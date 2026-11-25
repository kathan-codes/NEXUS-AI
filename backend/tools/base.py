"""Extensible tool base classes and registry."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

RiskLevel = Literal["read", "confirm"]


@dataclass
class ToolContext:
    """Shared services injected into tools at execution time."""

    telemetry: Any
    weather: Any
    workspace: Any
    db: Any


@dataclass
class ToolResult:
    ok: bool
    summary: str
    data: dict[str, Any] = field(default_factory=dict)


class BaseTool(ABC):
    name: str
    description: str
    risk_level: RiskLevel = "read"
    parameters: dict[str, Any]

    def spec(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "risk_level": self.risk_level,
            "parameters": self.parameters,
        }

    def describe_action(self, params: dict[str, Any]) -> tuple[str, str]:
        return (self.name, f"Execute {self.name} with {params}")

    @abstractmethod
    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        raise NotImplementedError


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def list_specs(self) -> list[dict[str, Any]]:
        return [t.spec() for t in self._tools.values()]
