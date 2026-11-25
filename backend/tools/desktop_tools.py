"""Desktop control tools: app discovery/launch, URL open, and scoped file search."""

from __future__ import annotations

import os
import shutil
import subprocess
import urllib.parse
from pathlib import Path
from typing import Any

from ..config import BLOCKED_DIR_NAMES, BLOCKED_FILE_NAMES, MAX_SEARCH_RESULTS, default_search_roots
from ..workspace import is_safe_path
from .base import BaseTool, ToolContext, ToolResult

# Curated safe Windows desktop applications (no arbitrary shell commands).
BUILTIN_APP_CATALOG: dict[str, dict[str, str]] = {
    "notepad": {"name": "Notepad", "target": "notepad.exe", "category": "Utilities"},
    "calculator": {"name": "Calculator", "target": "calc.exe", "category": "Utilities"},
    "paint": {"name": "Paint", "target": "mspaint.exe", "category": "Creative"},
    "explorer": {"name": "File Explorer", "target": "explorer.exe", "category": "System"},
    "task_manager": {"name": "Task Manager", "target": "taskmgr.exe", "category": "System"},
    "settings": {"name": "Windows Settings", "target": "ms-settings:", "category": "System"},
    "vscode": {"name": "Visual Studio Code", "target": "code", "category": "Development"},
    "terminal": {"name": "Windows Terminal", "target": "wt.exe", "category": "Development"},
    "chrome": {"name": "Google Chrome", "target": "chrome", "category": "Browser"},
    "edge": {"name": "Microsoft Edge", "target": "msedge", "category": "Browser"},
}


def discover_applications() -> list[dict[str, Any]]:
    """Return verified available applications from the safe catalog and Start Menu shortcuts."""
    apps: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for app_id, meta in BUILTIN_APP_CATALOG.items():
        target = meta["target"]
        available = False
        resolved_path = target
        if target.endswith(":"):
            available = os.name == "nt"
        elif os.name == "nt":
            found = shutil.which(target)
            if found:
                available = True
                resolved_path = found
            elif app_id == "chrome" and Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe").exists():
                available = True
                resolved_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
            elif app_id == "edge" and Path(r"C:\Program Files (x86)\Microsoft Edge\Application\msedge.exe").exists():
                available = True
                resolved_path = r"C:\Program Files (x86)\Microsoft Edge\Application\msedge.exe"
        apps.append(
            {
                "id": app_id,
                "name": meta["name"],
                "category": meta["category"],
                "target": resolved_path,
                "available": available,
                "source": "catalog",
            }
        )
        seen_ids.add(meta["name"].lower())

    # Discover Start Menu .lnk shortcuts safely (read-only metadata, max 40)
    if os.name == "nt":
        start_dirs = [
            Path(os.environ.get("APPDATA", "")) / r"Microsoft\Windows\Start Menu\Programs",
            Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / r"Microsoft\Windows\Start Menu\Programs",
        ]
        discovered = 0
        for sdir in start_dirs:
            if not sdir.exists():
                continue
            for lnk in sdir.rglob("*.lnk"):
                if discovered >= 40:
                    break
                name = lnk.stem
                if name.lower() in seen_ids or "uninstall" in name.lower():
                    continue
                seen_ids.add(name.lower())
                apps.append(
                    {
                        "id": f"lnk:{name.lower().replace(' ', '_')}",
                        "name": name,
                        "category": "Start Menu",
                        "target": str(lnk),
                        "available": True,
                        "source": "start_menu",
                    }
                )
                discovered += 1
    return apps


class OpenApplicationTool(BaseTool):
    name = "open_application"
    description = "Open an installed desktop application from the verified app catalog (requires user approval)."
    risk_level = "confirm"
    parameters = {
        "type": "object",
        "properties": {
            "app_name": {"type": "string", "description": "Application ID or display name (e.g., notepad, calculator, vscode, chrome)."}
        },
        "required": ["app_name"],
    }

    @staticmethod
    def _resolve_app(app_name: str) -> dict[str, Any] | None:
        query = app_name.strip().lower()
        catalog = discover_applications()
        for app in catalog:
            if app["id"].lower() == query or app["name"].lower() == query:
                return app
        for app in catalog:
            if query in app["name"].lower() or query in app["id"].lower():
                return app
        return None

    def describe_action(self, params: dict[str, Any]) -> tuple[str, str]:
        app_name = str(params.get("app_name", "")).strip()
        resolved = self._resolve_app(app_name)
        label = resolved["name"] if resolved else app_name
        return (
            f"Launch Application: {label}",
            f"Open desktop application '{label}'" + (f" ({resolved['target']})" if resolved else " (unrecognized target)"),
        )

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        app_name = str(params.get("app_name", "")).strip()
        resolved = self._resolve_app(app_name)
        if not resolved or not resolved.get("available"):
            return ToolResult(False, f"Application '{app_name}' was not found in the safe installed application catalog.")

        target = resolved["target"]
        try:
            if os.name == "nt":
                if target.endswith(":") or target.lower().endswith(".lnk"):
                    os.startfile(target)  # noqa: S606 - strictly allowlisted catalog / .lnk
                else:
                    subprocess.Popen([target], shell=False)
            else:
                return ToolResult(False, "Desktop app launching is supported on Windows.")
            return ToolResult(True, f"Launched {resolved['name']}.", {"application": resolved})
        except Exception as exc:
            return ToolResult(False, f"Failed to launch {resolved['name']}: {exc}")


class OpenWebsiteTool(BaseTool):
    name = "open_website"
    description = "Open a validated http:// or https:// website in the default browser (requires user approval)."
    risk_level = "confirm"
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Valid http:// or https:// URL to open."}
        },
        "required": ["url"],
    }

    @staticmethod
    def validate_url(raw_url: str) -> str:
        url = raw_url.strip()
        if not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError(f"Invalid URL: {raw_url}")
        return url

    def describe_action(self, params: dict[str, Any]) -> tuple[str, str]:
        raw = str(params.get("url", ""))
        try:
            clean = self.validate_url(raw)
        except ValueError:
            clean = raw
        return (f"Open Website: {clean}", f"Navigate default browser to {clean}")

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            url = self.validate_url(str(params.get("url", "")))
        except ValueError as exc:
            return ToolResult(False, str(exc))
        try:
            if os.name == "nt":
                os.startfile(url)  # noqa: S606 - validated http(s) URL
            else:
                import webbrowser
                webbrowser.open(url)
            return ToolResult(True, f"Opened {url} in default browser.", {"url": url})
        except Exception as exc:
            return ToolResult(False, f"Failed to open URL: {exc}")


class SearchFilesTool(BaseTool):
    name = "search_files"
    description = "Search files and folders by name inside approved user directories (Desktop, Documents, Downloads, Projects, Workspace)."
    risk_level = "read"
    parameters = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Case-insensitive filename/folder substring to match."},
            "root_path": {"type": "string", "description": "Optional approved root folder path to narrow the search."},
            "max_results": {"type": "integer", "description": "Maximum results (up to 60)."},
        },
        "required": ["query"],
    }

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        query = str(params.get("query", "")).strip().lower()
        if not query:
            return ToolResult(False, "Search query cannot be empty.")

        limit = min(MAX_SEARCH_RESULTS, max(1, int(params.get("max_results", 25))))
        allowed_roots = default_search_roots()
        # Also allow searching inside registered workspace projects
        for proj in ctx.db.list_projects():
            p = Path(proj["path"])
            if p.exists() and p.is_dir() and p.resolve() not in allowed_roots:
                allowed_roots.append(p.resolve())

        custom_root = params.get("root_path")
        if custom_root:
            candidate = Path(str(custom_root)).resolve()
            ok, err = is_safe_path(candidate)
            if not ok:
                return ToolResult(False, err)
            if not any(candidate == r or r in candidate.parents for r in allowed_roots):
                return ToolResult(
                    False,
                    "Requested search root is outside approved user/project directories. Add it as a workspace project first.",
                )
            search_roots = [candidate]
        else:
            search_roots = allowed_roots

        matches: list[dict[str, Any]] = []
        seen: set[str] = set()
        for root in search_roots:
            if len(matches) >= limit:
                break
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [
                    d for d in dirnames
                    if d not in BLOCKED_DIR_NAMES and not d.startswith(".")
                ]
                for d in dirnames:
                    if query in d.lower():
                        full = str((Path(dirpath) / d).resolve())
                        if full not in seen:
                            seen.add(full)
                            matches.append({"name": d, "path": full, "type": "folder", "size": None})
                            if len(matches) >= limit:
                                break
                if len(matches) >= limit:
                    break
                for fname in filenames:
                    if fname in BLOCKED_FILE_NAMES or fname.startswith(".env"):
                        continue
                    if query in fname.lower():
                        fpath = (Path(dirpath) / fname).resolve()
                        full = str(fpath)
                        if full not in seen:
                            seen.add(full)
                            try:
                                size = fpath.stat().st_size
                            except OSError:
                                size = None
                            matches.append({"name": fname, "path": full, "type": "file", "size": size})
                            if len(matches) >= limit:
                                break
                if len(matches) >= limit:
                    break

        return ToolResult(
            True,
            f"Found {len(matches)} match(es) for '{query}'.",
            {"query": query, "count": len(matches), "results": matches, "roots": [str(r) for r in search_roots]},
        )
