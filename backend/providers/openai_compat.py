"""OpenAI & OpenAI-compatible REST provider."""

from __future__ import annotations

import json
from typing import Any

from .base import BaseAIProvider, ProviderError, ProviderResponse, ToolCall, post_json


class OpenAICompatProvider(BaseAIProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini", base_url: str = "https://api.openai.com/v1") -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")

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
            "temperature": 0.4,
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
            payload["tool_choice"] = "auto"

        data = post_json(
            f"{self.base_url}/chat/completions",
            payload,
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        choices = data.get("choices") or []
        if not choices:
            raise ProviderError("OpenAI response contained no choices")
        msg = choices[0].get("message", {})
        tool_calls: list[ToolCall] = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function", {})
            raw_args = fn.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(ToolCall(name=fn.get("name", ""), arguments=args, call_id=tc.get("id", "")))

        return ProviderResponse(
            content=(msg.get("content") or "").strip(),
            provider=self.name,
            model=data.get("model", self.model),
            tool_calls=tool_calls,
            usage=data.get("usage") or {},
        )
