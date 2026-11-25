"""Google Gemini REST provider."""

from __future__ import annotations

import urllib.parse
from typing import Any

from .base import BaseAIProvider, ProviderError, ProviderResponse, ToolCall, post_json


class GeminiProvider(BaseAIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self.api_key = api_key
        self.model = model

    def complete(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        contents = []
        for m in messages:
            role = "model" if m["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m["content"]}]})

        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {"temperature": 0.4},
        }
        if tools:
            payload["tools"] = [
                {
                    "functionDeclarations": [
                        {
                            "name": t["name"],
                            "description": t["description"],
                            "parameters": t["parameters"],
                        }
                        for t in tools
                    ]
                }
            ]

        model_enc = urllib.parse.quote(self.model, safe="")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_enc}:generateContent"
        data = post_json(url, payload, headers={"x-goog-api-key": self.api_key})
        candidates = data.get("candidates") or []
        if not candidates:
            raise ProviderError("Gemini response contained no candidates")

        parts = candidates[0].get("content", {}).get("parts") or []
        text_chunks: list[str] = []
        tool_calls: list[ToolCall] = []
        for p in parts:
            if "text" in p:
                text_chunks.append(p["text"])
            elif "functionCall" in p:
                fc = p["functionCall"]
                tool_calls.append(
                    ToolCall(name=fc.get("name", ""), arguments=dict(fc.get("args") or {}))
                )

        return ProviderResponse(
            content="\n".join(text_chunks).strip(),
            provider=self.name,
            model=self.model,
            tool_calls=tool_calls,
            usage=data.get("usageMetadata") or {},
        )
