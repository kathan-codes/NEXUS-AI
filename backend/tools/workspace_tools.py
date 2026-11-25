"""Workspace tools for project management, reading, writing (confirmed), and safe checks (confirmed)."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from ..config import ALLOWED_PROJECT_CHECKS
from ..workspace import is_safe_path
from .base import BaseTool, ToolContext, ToolResult


class ListProjectsTool(BaseTool):
    name = "list_projects"
    description = "List registered programming projects in the Intelligent Workspace."
    risk_level = "read"
    parameters = {"type": "object", "properties": {}}

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        projects = ctx.db.list_projects()
        return ToolResult(True, f"{len(projects)} registered project(s).", {"projects": projects})


class InspectProjectTool(BaseTool):
    name = "inspect_project"
    description = "Inspect a registered project's file structure, languages, git status, TODOs, and task progress."
    risk_level = "read"
    parameters = {
        "type": "object",
        "properties": {"project_id": {"type": "string", "description": "Registered project ID."}},
        "required": ["project_id"],
    }

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        pid = str(params.get("project_id", ""))
        try:
            info = ctx.workspace.inspect_project(pid)
            return ToolResult(True, f"Inspected project {info['project']['name']}.", info)
        except Exception as exc:
            return ToolResult(False, str(exc))


class ReadProjectFileTool(BaseTool):
    name = "read_project_file"
    description = "Read a text/code file inside a registered project (safe path & size checked)."
    risk_level = "read"
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "relative_path": {"type": "string"},
        },
        "required": ["project_id", "relative_path"],
    }

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        try:
            data = ctx.workspace.read_project_file(str(params["project_id"]), str(params["relative_path"]))
            return ToolResult(True, f"Read {data['path']} ({data['line_count']} lines).", data)
        except Exception as exc:
            return ToolResult(False, str(exc))


class WriteProjectFileTool(BaseTool):
    name = "write_project_file"
    description = "Create or update a file inside a registered workspace project (requires explicit user confirmation)."
    risk_level = "confirm"
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "relative_path": {"type": "string"},
            "content": {"type": "string"},
        },
        "required": ["project_id", "relative_path", "content"],
    }

    def describe_action(self, params: dict[str, Any]) -> tuple[str, str]:
        rel = params.get("relative_path", "")
        size = len(str(params.get("content", "")))
        return (f"Write Project File: {rel}", f"Write {size} characters to '{rel}' inside workspace project.")

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        project = ctx.db.get_project(str(params.get("project_id", "")))
        if not project:
            return ToolResult(False, "Project not found.")
        root = Path(project["path"]).resolve()
        target = (root / str(params.get("relative_path", ""))).resolve()
        ok, err = is_safe_path(target, allowed_root=root)
        if not ok:
            return ToolResult(False, err)
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            content = str(params.get("content", ""))
            target.write_text(content, encoding="utf-8")
            rel = str(target.relative_to(root)).replace("\\", "/")
            return ToolResult(True, f"Saved {rel} ({len(content)} bytes).", {"path": rel, "bytes": len(content)})
        except Exception as exc:
            return ToolResult(False, f"Failed to write file: {exc}")


class RunProjectCheckTool(BaseTool):
    name = "run_project_check"
    description = "Run an allowlisted read/test check (git_status, git_log, pytest, npm_test, npm_build) in a project (requires user approval)."
    risk_level = "confirm"
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string"},
            "check_id": {
                "type": "string",
                "enum": list(ALLOWED_PROJECT_CHECKS.keys()),
            },
        },
        "required": ["project_id", "check_id"],
    }

    def describe_action(self, params: dict[str, Any]) -> tuple[str, str]:
        check_id = str(params.get("check_id", ""))
        cmd = " ".join(ALLOWED_PROJECT_CHECKS.get(check_id, [check_id]))
        return (f"Run Project Check: {check_id}", f"Execute allowlisted command `{cmd}` inside project directory.")

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        project = ctx.db.get_project(str(params.get("project_id", "")))
        if not project:
            return ToolResult(False, "Project not found.")
        check_id = str(params.get("check_id", ""))
        cmd = ALLOWED_PROJECT_CHECKS.get(check_id)
        if not cmd:
            return ToolResult(False, f"Check '{check_id}' is not in the allowlist.")
        root = Path(project["path"]).resolve()
        try:
            res = subprocess.run(
                cmd,
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=60,
                shell=False,
                check=False,
            )
            output = (res.stdout + "\n" + res.stderr).strip()[:6000]
            return ToolResult(
                res.returncode == 0,
                f"`{' '.join(cmd)}` exited with code {res.returncode}.",
                {"returncode": res.returncode, "output": output, "command": cmd},
            )
        except Exception as exc:
            return ToolResult(False, f"Failed to run check: {exc}")
