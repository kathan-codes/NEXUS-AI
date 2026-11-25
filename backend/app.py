"""FastAPI application for NEXUS-AI local desktop assistant."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .actions import ApprovalGate
from .config import BASE_DIR, DB_PATH, VAULT_PATH
from .database import Database
from .providers.router import AIProviderHub
from .telemetry import TelemetryCollector
from .tools import create_default_registry
from .tools.base import ToolContext
from .tools.desktop_tools import discover_applications
from .vault import SecretsVault
from .voice_sapi import list_sapi_voices, speak_sapi
from .weather import WeatherService
from .workspace import WorkspaceService, is_safe_path


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=16000)


class ConversationCreate(BaseModel):
    title: str = Field(default="New Session", max_length=120)


class InvokeToolRequest(BaseModel):
    tool_name: str
    params: dict[str, Any] = Field(default_factory=dict)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    path: str = Field(min_length=1)
    description: str = ""


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")


class TaskUpdate(BaseModel):
    status: str = Field(pattern="^(todo|in_progress|done)$")


class WorkspaceAssistRequest(BaseModel):
    project_id: str | None = None
    relative_path: str | None = None
    mode: str = Field(pattern="^(summarize|debug|generate_code|generate_docs)$")
    prompt: str = Field(min_length=1, max_length=12000)


class ProposeWriteRequest(BaseModel):
    project_id: str
    relative_path: str
    content: str


class SecretUpdate(BaseModel):
    key_name: str
    value: str


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    voice_name: str | None = None
    rate: int = 0


def create_app(db_path: Path | None = None, vault_path: Path | None = None) -> FastAPI:
    db = Database(db_path or DB_PATH)
    vault = SecretsVault(vault_path or VAULT_PATH)
    telemetry = TelemetryCollector()
    weather = WeatherService()
    workspace = WorkspaceService(db)
    registry = create_default_registry()
    ctx = ToolContext(telemetry=telemetry, weather=weather, workspace=workspace, db=db)
    gate = ApprovalGate(db=db, registry=registry, ctx=ctx)
    ai_hub = AIProviderHub(db=db, vault=vault, registry=registry, gate=gate)

    app = FastAPI(title="NEXUS-AI Core API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
            "http://localhost:4173",
            "http://127.0.0.1:8765",
            "http://localhost:8765",
            "null",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_token = (os.environ.get("NEXUS_API_TOKEN") or os.environ.get("JARVIS_API_TOKEN") or "").strip()

    @app.middleware("http")
    async def verify_token(request: Request, call_next):
        if api_token and request.url.path.startswith("/api/"):
            provided = request.headers.get("X-Nexus-Token") or request.headers.get("X-Jarvis-Token") or ""
            if provided != api_token:
                raise HTTPException(status_code=401, detail="Invalid session token")
        return await call_next(request)

    app.state.services = {
        "db": db,
        "vault": vault,
        "telemetry": telemetry,
        "weather": weather,
        "workspace": workspace,
        "registry": registry,
        "gate": gate,
        "ai_hub": ai_hub,
    }

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        return {
            "status": "online",
            "service": "nexus-ai-core",
            "provider": ai_hub.status()["active_provider"],
            "tools_count": len(registry.list_specs()),
        }

    # --- Telemetry & Weather ---
    @app.get("/api/telemetry")
    def get_telemetry() -> dict[str, Any]:
        return telemetry.snapshot()

    @app.websocket("/ws/telemetry")
    async def ws_telemetry(websocket: WebSocket) -> None:
        if api_token and websocket.query_params.get("token") != api_token:
            await websocket.close(code=1008)
            return
        await websocket.accept()
        try:
            while True:
                await websocket.send_json(telemetry.snapshot())
                await asyncio.sleep(1.0)
        except WebSocketDisconnect:
            return
        except Exception:
            return

    @app.get("/api/weather")
    def get_weather(city: str | None = None, force: bool = False) -> dict[str, Any]:
        settings = db.get_settings()
        if city and city.strip():
            try:
                geo = weather.geocode_city(city.strip())
                return weather.get_weather(geo["name"], geo["latitude"], geo["longitude"], force=force)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        return weather.get_weather(
            settings["weather_city"],
            float(settings["weather_lat"]),
            float(settings["weather_lon"]),
            force=force,
        )

    @app.get("/api/weather/geocode")
    def geocode(city: str) -> dict[str, Any]:
        try:
            geo = weather.geocode_city(city)
            db.update_settings(
                {
                    "weather_city": geo["name"],
                    "weather_lat": geo["latitude"],
                    "weather_lon": geo["longitude"],
                }
            )
            return geo
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # --- Conversations & AI Chat ---
    @app.get("/api/conversations")
    def list_conversations() -> list[dict[str, Any]]:
        return db.list_conversations()

    @app.post("/api/conversations")
    def create_conversation(req: ConversationCreate) -> dict[str, Any]:
        return db.create_conversation(req.title)

    @app.delete("/api/conversations/{conversation_id}")
    def delete_conversation(conversation_id: str) -> dict[str, bool]:
        return {"deleted": db.delete_conversation(conversation_id)}

    @app.get("/api/conversations/{conversation_id}/messages")
    def get_messages(conversation_id: str) -> list[dict[str, Any]]:
        return db.get_messages(conversation_id)

    @app.post("/api/chat")
    def chat(req: ChatRequest) -> dict[str, Any]:
        return ai_hub.chat(req.conversation_id or "", req.message)

    # --- Desktop Control & Security Approval Gate ---
    @app.get("/api/tools")
    def list_tools() -> list[dict[str, Any]]:
        return registry.list_specs()

    @app.get("/api/desktop/apps")
    def list_desktop_apps() -> list[dict[str, Any]]:
        return discover_applications()

    @app.get("/api/desktop/search")
    def search_desktop_files(q: str, root_path: str | None = None) -> dict[str, Any]:
        params: dict[str, Any] = {"query": q}
        if root_path:
            params["root_path"] = root_path
        return gate.invoke("search_files", params)

    @app.get("/api/actions")
    def list_actions(status: str | None = None) -> list[dict[str, Any]]:
        return db.list_actions(status=status)

    @app.post("/api/actions/invoke")
    def invoke_action(req: InvokeToolRequest) -> dict[str, Any]:
        try:
            return gate.invoke(req.tool_name, req.params)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/actions/{action_id}/approve")
    def approve_action(action_id: str) -> dict[str, Any]:
        try:
            return gate.approve(action_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/actions/{action_id}/reject")
    def reject_action(action_id: str) -> dict[str, Any]:
        try:
            return gate.reject(action_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/audit")
    def get_audit_logs() -> list[dict[str, Any]]:
        return db.list_audit_logs()

    # --- Intelligent Workspace ---
    @app.get("/api/workspace/projects")
    def list_projects() -> list[dict[str, Any]]:
        projects = db.list_projects()
        enriched = []
        for p in projects:
            tasks = db.list_tasks(p["id"])
            done = sum(1 for t in tasks if t["status"] == "done")
            pct = round((done * 100.0) / len(tasks), 1) if tasks else 0.0
            enriched.append(
                {
                    **p,
                    "exists": Path(p["path"]).exists(),
                    "task_total": len(tasks),
                    "task_done": done,
                    "progress_percent": pct,
                }
            )
        return enriched

    @app.post("/api/workspace/projects")
    def add_project(req: ProjectCreate) -> dict[str, Any]:
        p = Path(req.path).resolve()
        ok, err = is_safe_path(p)
        if not ok:
            raise HTTPException(status_code=403, detail=err)
        if not p.exists() or not p.is_dir():
            raise HTTPException(status_code=400, detail="Project path must be an existing folder.")
        return db.add_project(req.name.strip(), str(p), req.description.strip())

    @app.delete("/api/workspace/projects/{project_id}")
    def remove_project(project_id: str) -> dict[str, bool]:
        return {"deleted": db.delete_project(project_id)}

    @app.get("/api/workspace/projects/{project_id}")
    def inspect_project(project_id: str) -> dict[str, Any]:
        try:
            return workspace.inspect_project(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/workspace/projects/{project_id}/file")
    def read_project_file(project_id: str, path: str) -> dict[str, Any]:
        try:
            return workspace.read_project_file(project_id, path)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/workspace/projects/{project_id}/tasks")
    def create_project_task(project_id: str, req: TaskCreate) -> dict[str, Any]:
        if not db.get_project(project_id):
            raise HTTPException(status_code=404, detail="Project not found")
        return db.add_task(project_id, req.title.strip(), req.priority)

    @app.patch("/api/workspace/tasks/{task_id}")
    def update_project_task(task_id: str, req: TaskUpdate) -> dict[str, Any]:
        updated = db.update_task_status(task_id, req.status)
        if not updated:
            raise HTTPException(status_code=404, detail="Task not found")
        return updated

    @app.delete("/api/workspace/tasks/{task_id}")
    def delete_project_task(task_id: str) -> dict[str, bool]:
        return {"deleted": db.delete_task(task_id)}

    @app.post("/api/workspace/assist")
    def workspace_assist(req: WorkspaceAssistRequest) -> dict[str, Any]:
        file_info = None
        if req.project_id and req.relative_path:
            try:
                file_info = workspace.read_project_file(req.project_id, req.relative_path)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
        return ai_hub.workspace_assist(req.mode, req.prompt, file_info=file_info)

    @app.post("/api/workspace/propose-write")
    def propose_write(req: ProposeWriteRequest) -> dict[str, Any]:
        return gate.invoke(
            "write_project_file",
            {
                "project_id": req.project_id,
                "relative_path": req.relative_path,
                "content": req.content,
            },
        )

    # --- Voice (Windows SAPI) ---
    @app.get("/api/voice/voices")
    def get_sapi_voices() -> list[dict[str, str]]:
        return list_sapi_voices()

    @app.post("/api/voice/speak")
    def speak(req: SpeakRequest) -> dict[str, Any]:
        return speak_sapi(req.text, req.voice_name, req.rate)

    # --- Settings & DPAPI Secrets ---
    @app.get("/api/settings")
    def get_settings() -> dict[str, Any]:
        return db.get_settings()

    @app.patch("/api/settings")
    def patch_settings(updates: dict[str, Any]) -> dict[str, Any]:
        return db.update_settings(updates)

    @app.get("/api/secrets")
    def get_secrets_status() -> dict[str, Any]:
        return vault.status()

    @app.post("/api/secrets")
    def update_secret(req: SecretUpdate) -> dict[str, Any]:
        try:
            vault.set_secret(req.key_name, req.value)
            return vault.status()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/providers/status")
    def provider_status() -> dict[str, Any]:
        return ai_hub.status()

    # Serve production frontend bundle if built
    dist_dir = BASE_DIR / "frontend" / "dist"
    if dist_dir.exists():
        assets_dir = dist_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/{full_path:path}")
        def serve_spa(full_path: str):
            candidate = (dist_dir / full_path).resolve()
            if full_path and candidate.exists() and candidate.is_file() and dist_dir.resolve() in candidate.parents:
                return FileResponse(str(candidate))
            return FileResponse(str(dist_dir / "index.html"))

    return app


app = create_app()
