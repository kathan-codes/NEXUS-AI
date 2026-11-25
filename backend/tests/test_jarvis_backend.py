"""Comprehensive backend test suite for J.A.R.V.I.S. Core."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest import mock

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app import create_app
from backend.vault import SecretsVault
from backend.workspace import is_safe_path


@pytest.fixture()
def temp_env(tmp_path: Path):
    db_path = tmp_path / "test_jarvis.db"
    vault_path = tmp_path / "test_secrets.json"
    proj_dir = tmp_path / "sample_project"
    proj_dir.mkdir()
    (proj_dir / "main.py").write_text(
        "# TODO: optimize parser\ndef greet(name: str) -> str:\n    return f'Hello {name}'\n",
        encoding="utf-8",
    )
    (proj_dir / "README.md").write_text("# Sample Project\nTest readme.\n", encoding="utf-8")
    (proj_dir / ".env").write_text("SECRET_TOKEN=do_not_read\n", encoding="utf-8")
    app = create_app(db_path=db_path, vault_path=vault_path)
    client = TestClient(app)
    return client, proj_dir, vault_path


def test_health_and_telemetry(temp_env):
    client, _, _ = temp_env
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "online"
    assert body["tools_count"] >= 10

    tel = client.get("/api/telemetry")
    assert tel.status_code == 200
    tdata = tel.json()
    assert tdata["memory"]["total_gb"] > 0
    assert 0.0 <= tdata["cpu_percent"] <= 100.0
    assert tdata["system"]["hostname"]


def test_dpapi_vault_encryption_roundtrip(tmp_path: Path):
    if os.name != "nt":
        pytest.skip("DPAPI test only runs on Windows")
    vault_file = tmp_path / "vault.json"
    vault = SecretsVault(vault_file)
    secret_val = "sk-test-super-secret-987654321"
    vault.set_secret("openai_api_key", secret_val)

    raw_disk = vault_file.read_text(encoding="utf-8")
    assert secret_val not in raw_disk  # Must not store plaintext
    assert vault.get_secret("openai_api_key") == secret_val

    status = vault.status()
    assert status["openai_api_key"]["configured"] is True
    assert status["openai_api_key"]["masked"].startswith("sk-t")
    assert secret_val not in json.dumps(status)

    vault.delete_secret("openai_api_key")
    assert vault.get_secret("openai_api_key") is None


def test_security_approval_gate_enforced(temp_env):
    client, _, _ = temp_env
    # Confirm-level tool must NOT execute immediately
    res = client.post("/api/actions/invoke", json={"tool_name": "open_website", "params": {"url": "https://example.com"}})
    assert res.status_code == 200
    data = res.json()
    assert data["requires_approval"] is True
    assert data["status"] == "pending_approval"
    action_id = data["action"]["id"]

    # Rejecting must mark rejected and record audit log without launching browser
    rej = client.post(f"/api/actions/{action_id}/reject")
    assert rej.status_code == 200
    assert rej.json()["action"]["status"] == "rejected"

    audit = client.get("/api/audit").json()
    decisions = [a["decision"] for a in audit]
    assert "pending_approval" in decisions
    assert "rejected" in decisions


def test_approval_executes_with_mocked_os_launch(temp_env):
    client, _, _ = temp_env
    res = client.post("/api/actions/invoke", json={"tool_name": "open_website", "params": {"url": "https://example.com"}})
    action_id = res.json()["action"]["id"]

    with mock.patch("backend.tools.desktop_tools.os.startfile", create=True) as mock_start:
        app_res = client.post(f"/api/actions/{action_id}/approve")
        assert app_res.status_code == 200
        assert app_res.json()["ok"] is True
        mock_start.assert_called_once_with("https://example.com")


def test_workspace_project_tasks_and_path_guard(temp_env):
    client, proj_dir, _ = temp_env
    p_res = client.post(
        "/api/workspace/projects",
        json={"name": "Sample", "path": str(proj_dir), "description": "Unit test project"},
    )
    assert p_res.status_code == 200
    pid = p_res.json()["id"]

    # Inspect project
    insp = client.get(f"/api/workspace/projects/{pid}")
    assert insp.status_code == 200
    idata = insp.json()
    assert idata["summary"]["file_count"] == 2  # .env is hidden/blocked
    assert any(t["tag"] == "TODO" for t in idata["todos"])

    # Read safe file
    f_res = client.get(f"/api/workspace/projects/{pid}/file", params={"path": "main.py"})
    assert f_res.status_code == 200
    assert "def greet" in f_res.json()["content"]

    # Block sensitive .env and path traversal
    env_res = client.get(f"/api/workspace/projects/{pid}/file", params={"path": ".env"})
    assert env_res.status_code == 403
    trav_res = client.get(f"/api/workspace/projects/{pid}/file", params={"path": "../../secret.txt"})
    assert trav_res.status_code == 403

    # Task progress tracking
    t1 = client.post(f"/api/workspace/projects/{pid}/tasks", json={"title": "Add docs", "priority": "high"}).json()
    t2 = client.post(f"/api/workspace/projects/{pid}/tasks", json={"title": "Write tests", "priority": "medium"}).json()
    client.patch(f"/api/workspace/tasks/{t1['id']}", json={"status": "done"})
    insp2 = client.get(f"/api/workspace/projects/{pid}").json()
    assert insp2["progress"]["percent"] == 50.0

    # Local structural file summary
    assist = client.post(
        "/api/workspace/assist",
        json={"project_id": pid, "relative_path": "main.py", "mode": "summarize", "prompt": "Summarize this file"},
    )
    assert assist.status_code == 200
    assert "def greet" in assist.json()["output"]


def test_chat_and_local_command_router(temp_env):
    client, proj_dir, _ = temp_env
    # System status via chat
    r1 = client.post("/api/chat", json={"message": "system status"})
    assert r1.status_code == 200
    body1 = r1.json()
    cid = body1["conversation_id"]
    assert "CPU:" in body1["assistant_message"]["content"]

    # Scoped file search via chat inside registered project
    client.post("/api/workspace/projects", json={"name": "Sample", "path": str(proj_dir)})
    r2 = client.post("/api/chat", json={"conversation_id": cid, "message": "search files main.py"})
    assert r2.status_code == 200
    assert "main.py" in r2.json()["assistant_message"]["content"]

    # Open app via chat must queue confirmation, not execute
    r3 = client.post("/api/chat", json={"conversation_id": cid, "message": "open notepad"})
    assert r3.status_code == 200
    events = r3.json()["tool_events"]
    assert events and events[0]["requires_approval"] is True

    # History persisted
    msgs = client.get(f"/api/conversations/{cid}/messages").json()
    assert len(msgs) == 6


def test_is_safe_path_blocks_ssh():
    ok, _ = is_safe_path(Path.home() / ".ssh" / "id_rsa")
    assert ok is False
