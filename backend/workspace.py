"""Intelligent Workspace: project analysis, git inspection, file reading, and progress tracking."""

from __future__ import annotations

import os
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

from .config import BLOCKED_DIR_NAMES, BLOCKED_FILE_NAMES, MAX_FILE_READ_BYTES
from .database import Database

EXT_LANGUAGE_MAP = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".js": "JavaScript",
    ".jsx": "JavaScript (React)",
    ".json": "JSON",
    ".md": "Markdown",
    ".css": "CSS",
    ".html": "HTML",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".toml": "TOML",
    ".sql": "SQL",
    ".ps1": "PowerShell",
    ".sh": "Shell",
    ".rs": "Rust",
    ".go": "Go",
}

TODO_RE = re.compile(r"\b(TODO|FIXME|HACK|BUG)\b[:\s-]*(.*)", re.IGNORECASE)


def is_safe_path(target: Path, allowed_root: Path | None = None) -> tuple[bool, str]:
    try:
        resolved = target.resolve()
    except OSError as exc:
        return False, f"Invalid path: {exc}"

    if allowed_root is not None:
        root_resolved = allowed_root.resolve()
        try:
            rel = resolved.relative_to(root_resolved)
        except ValueError:
            return False, f"Path '{resolved}' is outside allowed root '{root_resolved}'"
        parts_to_check = rel.parts
    else:
        temp_root = Path(tempfile.gettempdir()).resolve()
        try:
            rel_temp = resolved.relative_to(temp_root)
            parts_to_check = rel_temp.parts
        except ValueError:
            parts_to_check = resolved.parts

    for part in parts_to_check:
        if part in BLOCKED_DIR_NAMES:
            return False, f"Access to protected directory '{part}' is blocked"

    if resolved.name in BLOCKED_FILE_NAMES or resolved.name.startswith(".env."):
        return False, f"Access to sensitive file '{resolved.name}' is blocked"

    return True, ""


def _run_git(project_path: Path, args: list[str]) -> tuple[bool, str]:
    try:
        res = subprocess.run(
            ["git", "-C", str(project_path), *args],
            capture_output=True,
            text=True,
            timeout=5,
            shell=False,
            check=False,
        )
        if res.returncode == 0:
            return True, res.stdout.strip()
        return False, res.stderr.strip()
    except Exception as exc:
        return False, str(exc)


class WorkspaceService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def inspect_project(self, project_id: str) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError("Project not found")
        root = Path(project["path"]).resolve()
        if not root.exists() or not root.is_dir():
            return {
                "project": project,
                "exists": False,
                "error": "Directory does not exist on disk",
                "tasks": self.db.list_tasks(project_id),
            }

        file_count = 0
        total_bytes = 0
        lang_counts: Counter[str] = Counter()
        files: list[dict[str, Any]] = []
        todos: list[dict[str, Any]] = []

        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [
                d for d in sorted(dirnames)
                if d not in BLOCKED_DIR_NAMES and not d.startswith(".")
            ]
            for fname in sorted(filenames):
                if fname in BLOCKED_FILE_NAMES or fname.startswith(".env"):
                    continue
                fpath = Path(dirpath) / fname
                rel = str(fpath.relative_to(root)).replace("\\", "/")
                try:
                    size = fpath.stat().st_size
                except OSError:
                    continue
                file_count += 1
                total_bytes += size
                ext = fpath.suffix.lower()
                lang = EXT_LANGUAGE_MAP.get(ext, ext.lstrip(".").upper() or "Other")
                lang_counts[lang] += 1
                if len(files) < 250:
                    files.append({"path": rel, "size": size, "language": lang})

                if ext in EXT_LANGUAGE_MAP and size <= 96 * 1024 and len(todos) < 30:
                    try:
                        text = fpath.read_text(encoding="utf-8", errors="ignore")
                        for idx, line in enumerate(text.splitlines(), start=1):
                            m = TODO_RE.search(line)
                            if m:
                                todos.append(
                                    {
                                        "file": rel,
                                        "line": idx,
                                        "tag": m.group(1).upper(),
                                        "text": m.group(2).strip()[:140],
                                    }
                                )
                                if len(todos) >= 30:
                                    break
                    except OSError:
                        pass

        # Git inspection
        is_git, branch = _run_git(root, ["rev-parse", "--abbrev-ref", "HEAD"])
        git_info: dict[str, Any] = {"is_repo": is_git}
        if is_git:
            _, status_out = _run_git(root, ["status", "--short"])
            _, log_out = _run_git(root, ["log", "-n", "5", "--oneline"])
            changed = [line for line in status_out.splitlines() if line.strip()]
            commits = [line for line in log_out.splitlines() if line.strip()]
            git_info.update(
                {
                    "branch": branch,
                    "changed_count": len(changed),
                    "changed_files": changed[:25],
                    "recent_commits": commits,
                }
            )

        tasks = self.db.list_tasks(project_id)
        done_count = sum(1 for t in tasks if t["status"] == "done")
        in_progress_count = sum(1 for t in tasks if t["status"] == "in_progress")
        completion_pct = round((done_count * 100.0) / len(tasks), 1) if tasks else 0.0

        return {
            "project": project,
            "exists": True,
            "summary": {
                "file_count": file_count,
                "total_kb": round(total_bytes / 1024.0, 1),
                "languages": [{"name": k, "count": v} for k, v in lang_counts.most_common(8)],
                "todo_count": len(todos),
            },
            "git": git_info,
            "files": files,
            "todos": todos,
            "tasks": tasks,
            "progress": {
                "total": len(tasks),
                "done": done_count,
                "in_progress": in_progress_count,
                "todo": len(tasks) - done_count - in_progress_count,
                "percent": completion_pct,
            },
        }

    def read_project_file(self, project_id: str, rel_path: str) -> dict[str, Any]:
        project = self.db.get_project(project_id)
        if not project:
            raise ValueError("Project not found")
        root = Path(project["path"]).resolve()
        target = (root / rel_path).resolve()
        ok, err = is_safe_path(target, allowed_root=root)
        if not ok:
            raise PermissionError(err)
        if not target.exists() or not target.is_file():
            raise FileNotFoundError(f"File not found: {rel_path}")
        size = target.stat().st_size
        if size > MAX_FILE_READ_BYTES:
            raise ValueError(f"File exceeds {MAX_FILE_READ_BYTES // 1024} KB safety limit ({size // 1024} KB)")

        raw = target.read_bytes()
        if b"\x00" in raw[:4096]:
            raise ValueError("Binary files cannot be displayed as text")
        content = raw.decode("utf-8", errors="replace")
        lines = content.splitlines()
        return {
            "project_id": project_id,
            "path": str(target.relative_to(root)).replace("\\", "/"),
            "size": size,
            "line_count": len(lines),
            "language": EXT_LANGUAGE_MAP.get(target.suffix.lower(), "Text"),
            "content": content,
        }

    def structural_file_summary(self, file_info: dict[str, Any]) -> str:
        """Deterministic local summary when no LLM provider is configured."""
        content = file_info["content"]
        lines = content.splitlines()
        headings = [l.strip() for l in lines if l.strip().startswith(("#", "class ", "def ", "async def ", "export ", "function ", "interface "))]
        preview_symbols = "\n".join(f"- `{h[:100]}`" for h in headings[:18]) or "- No top-level symbols or headings detected."
        return (
            f"### Local Structural Summary: `{file_info['path']}`\n"
            f"- **Language**: {file_info['language']} | **Lines**: {file_info['line_count']} | **Size**: {file_info['size']} bytes\n\n"
            f"**Detected Symbols / Headings**:\n{preview_symbols}\n\n"
            f"*Configure an AI provider (OpenAI, Gemini, Anthropic, or local Ollama) in Settings for full semantic summarization, debugging, and code generation.*"
        )
