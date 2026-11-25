"""Security approval gate and audit logging for desktop and workspace actions."""

from __future__ import annotations

from typing import Any

from .database import Database
from .tools.base import ToolContext, ToolRegistry


class ApprovalGate:
    """Enforces read vs confirm execution and records every decision in SQLite."""

    def __init__(self, db: Database, registry: ToolRegistry, ctx: ToolContext) -> None:
        self.db = db
        self.registry = registry
        self.ctx = ctx

    def invoke(self, tool_name: str, params: dict[str, Any]) -> dict[str, Any]:
        tool = self.registry.get(tool_name)
        if not tool:
            raise ValueError(f"Unknown tool: {tool_name}")

        if tool.risk_level == "read":
            result = tool.execute(params, self.ctx)
            self.db.add_audit_log(
                tool_name=tool.name,
                risk_level="read",
                decision="auto_executed" if result.ok else "failed",
                target=str(params),
                details={"summary": result.summary},
            )
            return {
                "status": "executed" if result.ok else "failed",
                "requires_approval": False,
                "tool_name": tool.name,
                "summary": result.summary,
                "data": result.data,
                "ok": result.ok,
            }

        # Sensitive / desktop-mutating action: queue for explicit user approval
        title, description = tool.describe_action(params)
        pending = self.db.create_pending_action(
            tool_name=tool.name,
            title=title,
            description=description,
            risk_level=tool.risk_level,
            params=params,
        )
        self.db.add_audit_log(
            action_id=pending["id"],
            tool_name=tool.name,
            risk_level=tool.risk_level,
            decision="pending_approval",
            target=title,
            details={"params": params},
        )
        return {
            "status": "pending_approval",
            "requires_approval": True,
            "action": pending,
            "summary": f"Approval required: {title}",
            "ok": True,
        }

    def approve(self, action_id: str) -> dict[str, Any]:
        action = self.db.get_action(action_id)
        if not action:
            raise ValueError("Action not found")
        if action["status"] != "pending":
            raise ValueError(f"Action already resolved with status '{action['status']}'")

        tool = self.registry.get(action["tool_name"])
        if not tool:
            resolved = self.db.resolve_action(action_id, "failed", {"error": "Tool no longer registered"})
            raise ValueError("Tool not found")

        result = tool.execute(action["params"], self.ctx)
        final_status = "executed" if result.ok else "failed"
        resolved = self.db.resolve_action(
            action_id,
            final_status,
            {"ok": result.ok, "summary": result.summary, "data": result.data},
        )
        self.db.add_audit_log(
            action_id=action_id,
            tool_name=action["tool_name"],
            risk_level=action["risk_level"],
            decision=f"approved_{final_status}",
            target=action["title"],
            details={"summary": result.summary},
        )
        return {
            "action": resolved,
            "ok": result.ok,
            "summary": result.summary,
            "data": result.data,
        }

    def reject(self, action_id: str) -> dict[str, Any]:
        action = self.db.get_action(action_id)
        if not action:
            raise ValueError("Action not found")
        if action["status"] != "pending":
            raise ValueError(f"Action already resolved with status '{action['status']}'")
        resolved = self.db.resolve_action(action_id, "rejected", {"ok": False, "summary": "Denied by user."})
        self.db.add_audit_log(
            action_id=action_id,
            tool_name=action["tool_name"],
            risk_level=action["risk_level"],
            decision="rejected",
            target=action["title"],
            details={},
        )
        return {"action": resolved, "ok": False, "summary": "Action rejected by user."}
