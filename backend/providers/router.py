"""AIProviderHub: selects active provider, executes tool loops, and provides transparent local command routing."""

from __future__ import annotations

import re
from typing import Any

from ..actions import ApprovalGate
from ..database import Database
from ..tools.base import ToolRegistry
from ..vault import SecretsVault
from .anthropic import AnthropicProvider
from .base import BaseAIProvider, ProviderError
from .gemini import GeminiProvider
from .ollama import OllamaProvider, probe_ollama
from .openai_compat import OpenAICompatProvider

URL_PATTERN = re.compile(r"(https?://[^\s]+|[a-zA-Z0-9.-]+\.(?:com|org|net|io|dev|ai|edu|gov)(?:/[^\s]*)?)", re.I)


class AIProviderHub:
    def __init__(self, db: Database, vault: SecretsVault, registry: ToolRegistry, gate: ApprovalGate) -> None:
        self.db = db
        self.vault = vault
        self.registry = registry
        self.gate = gate

    def status(self) -> dict[str, Any]:
        settings = self.db.get_settings()
        secrets = self.vault.status()
        ollama = probe_ollama(settings["ollama_url"])
        selected = self._resolve_provider_name(settings, secrets, ollama)
        return {
            "configured_mode": settings["active_provider"],
            "active_provider": selected,
            "providers": {
                "openai": {
                    "available": bool(secrets["openai_api_key"]["configured"]),
                    "model": settings["openai_model"],
                    "base_url": settings["openai_base_url"],
                },
                "gemini": {
                    "available": bool(secrets["gemini_api_key"]["configured"]),
                    "model": settings["gemini_model"],
                },
                "anthropic": {
                    "available": bool(secrets["anthropic_api_key"]["configured"]),
                    "model": settings["anthropic_model"],
                },
                "ollama": {
                    "available": ollama["reachable"],
                    "url": settings["ollama_url"],
                    "model": settings["ollama_model"],
                    "installed_models": ollama["models"],
                },
                "local_router": {
                    "available": True,
                    "description": "Deterministic command & tool router (no LLM API key required).",
                },
            },
        }

    def _resolve_provider_name(
        self,
        settings: dict[str, Any],
        secrets: dict[str, Any],
        ollama: dict[str, Any],
    ) -> str:
        choice = settings.get("active_provider", "auto")
        if choice == "local_router":
            return "local_router"
        if choice == "openai" and secrets["openai_api_key"]["configured"]:
            return "openai"
        if choice == "gemini" and secrets["gemini_api_key"]["configured"]:
            return "gemini"
        if choice == "anthropic" and secrets["anthropic_api_key"]["configured"]:
            return "anthropic"
        if choice == "ollama" and ollama["reachable"]:
            return "ollama"

        # Auto selection
        if secrets["openai_api_key"]["configured"]:
            return "openai"
        if secrets["gemini_api_key"]["configured"]:
            return "gemini"
        if secrets["anthropic_api_key"]["configured"]:
            return "anthropic"
        if ollama["reachable"]:
            return "ollama"
        return "local_router"

    def build_provider(self) -> BaseAIProvider | None:
        settings = self.db.get_settings()
        secrets = self.vault.status()
        ollama = probe_ollama(settings["ollama_url"])
        name = self._resolve_provider_name(settings, secrets, ollama)

        if name == "openai":
            key = self.vault.get_secret("openai_api_key")
            if key:
                return OpenAICompatProvider(key, settings["openai_model"], settings["openai_base_url"])
        elif name == "gemini":
            key = self.vault.get_secret("gemini_api_key")
            if key:
                return GeminiProvider(key, settings["gemini_model"])
        elif name == "anthropic":
            key = self.vault.get_secret("anthropic_api_key")
            if key:
                return AnthropicProvider(key, settings["anthropic_model"])
        elif name == "ollama":
            model = settings["ollama_model"]
            if ollama["models"] and model not in ollama["models"]:
                model = ollama["models"][0]
            return OllamaProvider(settings["ollama_url"], model)
        return None

    def _route_local_command(self, text: str) -> dict[str, Any] | None:
        """Deterministic intent parser for desktop/telemetry/weather commands without an LLM."""
        raw = text.strip()
        low = raw.lower()
        # Strip optional wake phrase prefix
        for prefix in ("hey nexus,", "hey nexus", "nexus-ai,", "nexus-ai", "nexus,", "nexus"):
            if low.startswith(prefix):
                raw = raw[len(prefix) :].strip()
                low = raw.lower()
                break

        # 1. System status / CPU / RAM
        if any(k in low for k in ("system status", "system info", "cpu", "ram", "memory usage", "telemetry", "diagnostics")):
            res = self.gate.invoke("get_system_telemetry", {})
            return {
                "reply": f"**[Local Command Router — Telemetry]**\n{res['summary']}",
                "tool_events": [res],
            }

        # 2. Weather
        if low.startswith("weather") or "weather in " in low or "forecast" in low:
            m = re.search(r"weather(?:\s+(?:in|for))?\s+([a-zA-Z\s,.-]+)$", raw, re.I)
            city = m.group(1).strip() if m else ""
            res = self.gate.invoke("get_weather", {"city": city} if city else {})
            return {
                "reply": f"**[Local Command Router — Weather]**\n{res['summary']}",
                "tool_events": [res],
            }

        # 3. Search files
        m_search = re.match(r"^(?:search|find)\s+(?:files?|folders?)\s+(?:for\s+|named\s+)?(.+)$", raw, re.I)
        if m_search:
            query = m_search.group(1).strip().strip("\"'")
            res = self.gate.invoke("search_files", {"query": query})
            items = res.get("data", {}).get("results", [])[:8]
            listing = "\n".join(f"- `{item['type']}` **{item['name']}** — `{item['path']}`" for item in items)
            body = res["summary"] + ("\n" + listing if listing else "")
            return {
                "reply": f"**[Local Command Router — File Search]**\n{body}",
                "tool_events": [res],
            }

        # 4. List projects
        if "list projects" in low or "show projects" in low or "my projects" in low:
            res = self.gate.invoke("list_projects", {})
            projs = res.get("data", {}).get("projects", [])
            listing = "\n".join(f"- **{p['name']}** (`{p['path']}`)" for p in projs) or "- No workspace projects registered yet."
            return {
                "reply": f"**[Local Command Router — Workspace]**\n{res['summary']}\n{listing}",
                "tool_events": [res],
            }

        # 5. Open website or application (requires confirmation!)
        m_open = re.match(r"^(?:open|launch|start|visit|go to)\s+(.+)$", raw, re.I)
        if m_open:
            target = m_open.group(1).strip().strip("\"'")
            if URL_PATTERN.fullmatch(target) or target.startswith(("http://", "https://")):
                res = self.gate.invoke("open_website", {"url": target})
                return {
                    "reply": f"**[Local Command Router — Approval Required]**\nPrepared browser navigation to `{target}`. Please approve or deny below.",
                    "tool_events": [res],
                }
            res = self.gate.invoke("open_application", {"app_name": target})
            return {
                "reply": f"**[Local Command Router — Approval Required]**\nPrepared launch request for **{target}**. Please confirm below before execution.",
                "tool_events": [res],
            }

        return None

    def chat(self, conversation_id: str, user_message: str) -> dict[str, Any]:
        conv = self.db.ensure_conversation(conversation_id, default_title=user_message[:48] or "New Session")
        cid = conv["id"]
        if conv.get("title") == "New Session" and user_message.strip():
            self.db.rename_conversation(cid, user_message.strip()[:48])

        user_rec = self.db.add_message(cid, "user", user_message)
        history = self.db.get_messages(cid, limit=24)
        chat_msgs = [{"role": m["role"], "content": m["content"]} for m in history if m["role"] in ("user", "assistant")]

        settings = self.db.get_settings()
        provider = self.build_provider()

        if provider is None:
            routed = self._route_local_command(user_message)
            if routed is not None:
                assistant_rec = self.db.add_message(
                    cid,
                    "assistant",
                    routed["reply"],
                    provider="local_router",
                    model="deterministic-command-router",
                    metadata={"tool_events": routed["tool_events"]},
                )
                return {
                    "conversation_id": cid,
                    "user_message": user_rec,
                    "assistant_message": assistant_rec,
                    "tool_events": routed["tool_events"],
                }

            notice = (
                "No LLM AI provider is currently configured or running.\n\n"
                "To enable full natural-language reasoning, debugging, and code generation, open **Settings** (top right) and either:\n"
                "1. Add an encrypted **OpenAI**, **Google Gemini**, or **Anthropic** API key (stored via Windows DPAPI), or\n"
                "2. Start **Ollama** locally on `http://127.0.0.1:11434`.\n\n"
                "In the meantime, direct desktop commands work right now without an API key, for example:\n"
                "- `system status` · `weather` · `weather in Tokyo`\n"
                "- `search files readme` · `list projects`\n"
                "- `open notepad` · `open https://github.com`"
            )
            assistant_rec = self.db.add_message(
                cid,
                "assistant",
                notice,
                provider="local_router",
                model="unconfigured",
                metadata={"provider_unconfigured": True},
            )
            return {
                "conversation_id": cid,
                "user_message": user_rec,
                "assistant_message": assistant_rec,
                "tool_events": [],
            }

        # Live AI provider with tool-calling support
        tool_specs = self.registry.list_specs()
        tool_events: list[dict[str, Any]] = []
        try:
            resp = provider.complete(chat_msgs, settings["system_prompt"], tools=tool_specs)
            reply_parts: list[str] = []
            if resp.content:
                reply_parts.append(resp.content)

            if resp.tool_calls:
                read_summaries: list[str] = []
                for tc in resp.tool_calls:
                    try:
                        event = self.gate.invoke(tc.name, tc.arguments)
                    except Exception as exc:
                        event = {"status": "failed", "requires_approval": False, "tool_name": tc.name, "summary": str(exc), "ok": False}
                    tool_events.append(event)
                    if not event.get("requires_approval"):
                        read_summaries.append(f"[{tc.name}] {event.get('summary', '')}")
                    else:
                        reply_parts.append(f"Action queued for your approval: **{event['action']['title']}**.")

                # Follow up with LLM so it synthesizes read-only tool outputs cleanly
                if read_summaries:
                    followup_msgs = [
                        *chat_msgs,
                        {
                            "role": "user",
                            "content": "Tool execution results (verified live data):\n" + "\n".join(read_summaries) + "\n\nRespond clearly to the user using these verified results.",
                        },
                    ]
                    resp2 = provider.complete(followup_msgs, settings["system_prompt"], tools=None)
                    if resp2.content:
                        reply_parts = [resp2.content] + [p for p in reply_parts if "Action queued" in p]

            final_text = "\n\n".join(p for p in reply_parts if p).strip() or "Completed."
            assistant_rec = self.db.add_message(
                cid,
                "assistant",
                final_text,
                provider=resp.provider,
                model=resp.model,
                metadata={"tool_events": tool_events, "usage": resp.usage},
            )
            return {
                "conversation_id": cid,
                "user_message": user_rec,
                "assistant_message": assistant_rec,
                "tool_events": tool_events,
            }
        except ProviderError as exc:
            err_msg = f"AI provider **{provider.name}** returned an error: `{exc}`"
            assistant_rec = self.db.add_message(
                cid,
                "assistant",
                err_msg,
                provider=provider.name,
                model="error",
                metadata={"error": str(exc)},
            )
            return {
                "conversation_id": cid,
                "user_message": user_rec,
                "assistant_message": assistant_rec,
                "tool_events": [],
            }

    def workspace_assist(self, mode: str, prompt: str, file_info: dict[str, Any] | None = None) -> dict[str, Any]:
        """Real AI-backed (or honest structural fallback) assistance for summarize/debug/generate."""
        provider = self.build_provider()
        settings = self.db.get_settings()

        if provider is None:
            if mode == "summarize" and file_info is not None:
                from ..workspace import WorkspaceService
                summary = WorkspaceService(self.db).structural_file_summary(file_info)
                return {"ok": True, "provider": "local_router", "model": "structural-analyzer", "output": summary}
            return {
                "ok": False,
                "provider": "local_router",
                "model": "unconfigured",
                "output": "No AI provider configured. Add an OpenAI, Gemini, or Anthropic API key in Settings, or start local Ollama to run AI debugging and code/documentation generation.",
            }

        context_block = ""
        if file_info is not None:
            context_block = (
                f"\n\nTarget File: `{file_info['path']}` ({file_info['language']}, {file_info['line_count']} lines)\n"
                f"```\n{file_info['content'][:16000]}\n```"
            )

        mode_instructions = {
            "summarize": "Provide a crisp, technical summary: purpose, key symbols/components, inputs/outputs, and notable risks or dependencies.",
            "debug": "Analyze the code/error carefully. Identify root causes, edge cases, and provide concrete corrected code.",
            "generate_code": "Generate clean, modular, production-ready code matching the user's specification. Output code in fenced code blocks.",
            "generate_docs": "Generate clear, accurate Markdown documentation (overview, architecture/API, usage examples) based strictly on the provided code and request.",
        }
        instruction = mode_instructions.get(mode, mode_instructions["summarize"])
        user_msg = f"{instruction}\n\nRequest: {prompt}{context_block}"
        try:
            resp = provider.complete([{"role": "user", "content": user_msg}], settings["system_prompt"])
            return {"ok": True, "provider": resp.provider, "model": resp.model, "output": resp.content}
        except ProviderError as exc:
            return {"ok": False, "provider": provider.name, "model": "error", "output": f"Provider error: {exc}"}
