"""SQLite persistence layer (conversations, projects, tasks, actions, audit, settings)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .config import DB_PATH, DEFAULT_SETTINGS, ensure_data_dir


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or DB_PATH
        ensure_data_dir()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    provider TEXT,
                    model TEXT,
                    metadata_json TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    description TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS project_tasks (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'todo',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS pending_actions (
                    id TEXT PRIMARY KEY,
                    tool_name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    params_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    result_json TEXT,
                    created_at TEXT NOT NULL,
                    resolved_at TEXT
                );

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    action_id TEXT,
                    tool_name TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    target TEXT NOT NULL,
                    details_json TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL
                );
                """
            )

    # --- Settings ---
    def get_settings(self) -> dict[str, Any]:
        merged = dict(DEFAULT_SETTINGS)
        with self.connect() as conn:
            rows = conn.execute("SELECT key, value_json FROM settings").fetchall()
            for row in rows:
                try:
                    merged[row["key"]] = json.loads(row["value_json"])
                except json.JSONDecodeError:
                    merged[row["key"]] = row["value_json"]
        return merged

    def update_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as conn:
            for k, v in updates.items():
                if k in DEFAULT_SETTINGS:
                    conn.execute(
                        "INSERT INTO settings (key, value_json) VALUES (?, ?) "
                        "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                        (k, json.dumps(v)),
                    )
        return self.get_settings()

    # --- Conversations & Messages ---
    def list_conversations(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT c.*, COUNT(m.id) AS message_count
                FROM conversations c
                LEFT JOIN messages m ON m.conversation_id = c.id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]

    def create_conversation(self, title: str = "New Session") -> dict[str, Any]:
        cid = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (cid, title, now, now),
            )
        return {"id": cid, "title": title, "created_at": now, "updated_at": now, "message_count": 0}

    def ensure_conversation(self, conversation_id: str | None, default_title: str = "New Session") -> dict[str, Any]:
        if conversation_id:
            with self.connect() as conn:
                row = conn.execute("SELECT * FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
                if row:
                    return dict(row)
        return self.create_conversation(default_title)

    def rename_conversation(self, conversation_id: str, title: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                (title[:120], utc_now(), conversation_id),
            )

    def delete_conversation(self, conversation_id: str) -> bool:
        with self.connect() as conn:
            cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
            return cur.rowcount > 0

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        provider: str | None = None,
        model: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        mid = str(uuid.uuid4())
        now = utc_now()
        meta_str = json.dumps(metadata) if metadata else None
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO messages (id, conversation_id, role, content, provider, model, metadata_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (mid, conversation_id, role, content, provider, model, meta_str, now),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id),
            )
        return {
            "id": mid,
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "provider": provider,
            "model": model,
            "metadata": metadata or {},
            "created_at": now,
        }

    def get_messages(self, conversation_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?",
                (conversation_id, limit),
            ).fetchall()
            result = []
            for r in rows:
                d = dict(r)
                raw_meta = d.pop("metadata_json", None)
                d["metadata"] = json.loads(raw_meta) if raw_meta else {}
                result.append(d)
            return result

    # --- Projects & Tasks ---
    def list_projects(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
            return [dict(r) for r in rows]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            return dict(row) if row else None

    def add_project(self, name: str, path: str, description: str = "") -> dict[str, Any]:
        pid = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as conn:
            existing = conn.execute("SELECT * FROM projects WHERE path = ?", (path,)).fetchone()
            if existing:
                return dict(existing)
            conn.execute(
                "INSERT INTO projects (id, name, path, description, created_at) VALUES (?, ?, ?, ?, ?)",
                (pid, name, path, description, now),
            )
        return {"id": pid, "name": name, "path": path, "description": description, "created_at": now}

    def delete_project(self, project_id: str) -> bool:
        with self.connect() as conn:
            cur = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            return cur.rowcount > 0

    def list_tasks(self, project_id: str) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM project_tasks WHERE project_id = ? ORDER BY created_at ASC",
                (project_id,),
            ).fetchall()
            return [dict(r) for r in rows]

    def add_task(self, project_id: str, title: str, priority: str = "medium") -> dict[str, Any]:
        tid = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO project_tasks (id, project_id, title, status, priority, created_at, updated_at) "
                "VALUES (?, ?, ?, 'todo', ?, ?, ?)",
                (tid, project_id, title, priority, now, now),
            )
        return {
            "id": tid,
            "project_id": project_id,
            "title": title,
            "status": "todo",
            "priority": priority,
            "created_at": now,
            "updated_at": now,
        }

    def update_task_status(self, task_id: str, status: str) -> dict[str, Any] | None:
        if status not in ("todo", "in_progress", "done"):
            raise ValueError("Invalid task status")
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                "UPDATE project_tasks SET status = ?, updated_at = ? WHERE id = ?",
                (status, now, task_id),
            )
            row = conn.execute("SELECT * FROM project_tasks WHERE id = ?", (task_id,)).fetchone()
            return dict(row) if row else None

    def delete_task(self, task_id: str) -> bool:
        with self.connect() as conn:
            cur = conn.execute("DELETE FROM project_tasks WHERE id = ?", (task_id,))
            return cur.rowcount > 0

    # --- Pending Actions & Audit Log ---
    def create_pending_action(
        self,
        tool_name: str,
        title: str,
        description: str,
        risk_level: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        aid = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO pending_actions (id, tool_name, title, description, risk_level, params_json, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
                (aid, tool_name, title, description, risk_level, json.dumps(params), now),
            )
        return {
            "id": aid,
            "tool_name": tool_name,
            "title": title,
            "description": description,
            "risk_level": risk_level,
            "params": params,
            "status": "pending",
            "result": None,
            "created_at": now,
            "resolved_at": None,
        }

    def get_action(self, action_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM pending_actions WHERE id = ?", (action_id,)).fetchone()
            if not row:
                return None
            return self._decode_action(row)

    def list_actions(self, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        with self.connect() as conn:
            if status:
                rows = conn.execute(
                    "SELECT * FROM pending_actions WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                    (status, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM pending_actions ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [self._decode_action(r) for r in rows]

    def resolve_action(self, action_id: str, status: str, result: dict[str, Any] | None = None) -> dict[str, Any] | None:
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                "UPDATE pending_actions SET status = ?, result_json = ?, resolved_at = ? WHERE id = ?",
                (status, json.dumps(result) if result is not None else None, now, action_id),
            )
        return self.get_action(action_id)

    def add_audit_log(
        self,
        tool_name: str,
        risk_level: str,
        decision: str,
        target: str,
        details: dict[str, Any] | None = None,
        action_id: str | None = None,
    ) -> dict[str, Any]:
        lid = str(uuid.uuid4())
        now = utc_now()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO audit_logs (id, action_id, tool_name, risk_level, decision, target, details_json, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (lid, action_id, tool_name, risk_level, decision, target, json.dumps(details or {}), now),
            )
        return {
            "id": lid,
            "action_id": action_id,
            "tool_name": tool_name,
            "risk_level": risk_level,
            "decision": decision,
            "target": target,
            "details": details or {},
            "created_at": now,
        }

    def list_audit_logs(self, limit: int = 80) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                raw = d.pop("details_json", None)
                d["details"] = json.loads(raw) if raw else {}
                out.append(d)
            return out

    @staticmethod
    def _decode_action(row: sqlite3.Row) -> dict[str, Any]:
        d = dict(row)
        d["params"] = json.loads(d.pop("params_json"))
        raw_res = d.pop("result_json", None)
        d["result"] = json.loads(raw_res) if raw_res else None
        return d
