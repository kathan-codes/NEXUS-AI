"""Local Ollama REST provider + discovery."""

from __future__ import annotations

from typing import Any

from .base import BaseAIProvider, ProviderError, ProviderResponse, ToolCall, get_json, post_json


def probe_ollama(base_url: str = "http://127.0.0.1:11434") -> dict[str, Any]:
    try:
        data = get_json(f"{base_url.rstrip('/')}/api/tags", timeout=1.5)
        models = [m.get("name") for m in data.get("models") or [] if m.get("name")]
        return {"reachable": True, "models": models}
    except Exception:
        return {"reachable": False, "models": []}


class OllamaProvider(BaseAIProvider):
    name = "ollama"

    def __init__(self, base_url: str = "http://127.0.0.1:11434", model: str = "llama3.2") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    def complete(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        formatted = [{"role": "system", "content": system_prompt}, *messages]
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": formatted,
            "stream": False,
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["parameters"],
                    },
                }
                for t in tools
            ]

        data = post_json(f"{self.base_url}/api/chat", payload, headers={}, timeout=60.0)
        msg = data.get("message")
        if not msg:
            raise ProviderError("Ollama response contained no message")
        tool_calls: list[ToolCall] = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            tool_calls.append(
                ToolCall(name=fn.get("name", ""), arguments=dict(fn.get("arguments") or {}))
            )

        return ProviderResponse(
            content=(msg.get("content") or "").strip(),
            provider=self.name,
            model=data.get("model", self.model),
            tool_calls=tool_calls,
        )
