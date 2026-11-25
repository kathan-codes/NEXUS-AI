"""Base abstractions for configurable AI providers."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]
    call_id: str = ""


@dataclass
class ProviderResponse:
    content: str
    provider: str
    model: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)


class ProviderError(RuntimeError):
    """Raised when an upstream AI provider returns an error or is unreachable."""


def post_json(url: str, payload: dict[str, Any], headers: dict[str, str], timeout: float = 45.0) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "JARVIS-Desktop/1.0", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace")
        raise ProviderError(f"HTTP {exc.code}: {err_body[:400]}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ProviderError(f"Network error: {exc}") from exc


def get_json(url: str, headers: dict[str, str] | None = None, timeout: float = 3.0) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "JARVIS-Desktop/1.0", **(headers or {})},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


class BaseAIProvider(ABC):
    name: str

    @abstractmethod
    def complete(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        tools: list[dict[str, Any]] | None = None,
    ) -> ProviderResponse:
        raise NotImplementedError
