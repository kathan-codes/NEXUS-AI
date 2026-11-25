"""Built-in tool registry factory."""

from __future__ import annotations

from .base import ToolRegistry
from .desktop_tools import OpenApplicationTool, OpenWebsiteTool, SearchFilesTool
from .system_tools import SystemTelemetryTool, WeatherTool
from .workspace_tools import (
    InspectProjectTool,
    ListProjectsTool,
    ReadProjectFileTool,
    RunProjectCheckTool,
    WriteProjectFileTool,
)


def create_default_registry() -> ToolRegistry:
    registry = ToolRegistry()
    for tool in (
        OpenApplicationTool(),
        OpenWebsiteTool(),
        SearchFilesTool(),
        SystemTelemetryTool(),
        WeatherTool(),
        ListProjectsTool(),
        InspectProjectTool(),
        ReadProjectFileTool(),
        WriteProjectFileTool(),
        RunProjectCheckTool(),
    ):
        registry.register(tool)
    return registry
