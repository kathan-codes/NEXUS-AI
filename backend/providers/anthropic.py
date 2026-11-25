"""Anthropic Claude Messages REST provider."""

from __future__ import annotations

from typing import Any

from .base import BaseAIProvider, ProviderError, ProviderResponse, ToolCall, post_json


class AnthropicProvider(BaseAIProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-latest") -> None:
        self.api_key = api_key
        self.model = model

    def complete(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        formatted = [
            {"role": "assistant" if m["role"] == "assistant" else "user", "content": m["content"]}
            for m in messages
        ]
        payload: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 2048,
            "system": system_prompt,
            "messages": formatted,
        }
        if tools:
            payload["tools"] = [
                {
                    "name": t["name"],
                    "description": t["description"],
                    "input_schema": t["parameters"],
                }
                for t in tools
            ]

        data = post_json(
            "https://api.anthropic.com/v1/messages",
            payload,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        blocks = data.get("content") or []
        if not blocks:
            raise ProviderError("Anthropic response contained no content blocks")

        text_chunks: list[str] = []
        tool_calls: list[ToolCall] = []
        for b in blocks:
            if b.get("type") == "text":
                text_chunks.append(b.get("text", ""))
            elif b.get("type") == "tool_use":
                tool_calls.append(
                    ToolCall(
                        name=b.get("name", ""),
                        arguments=dict(b.get("input") or {}),
                        call_id=b.get("id", ""),
                    )
                )

        return ProviderResponse(
            content="\n".join(text_chunks).strip(),
            provider=self.name,
            model=data.get("model", self.model),
            tool_calls=tool_calls,
            usage=data.get("usage") or {},
        )
