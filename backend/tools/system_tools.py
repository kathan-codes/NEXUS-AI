"""System telemetry and weather tools."""

from __future__ import annotations

from typing import Any

from .base import BaseTool, ToolContext, ToolResult


class SystemTelemetryTool(BaseTool):
    name = "get_system_telemetry"
    description = "Read real-time CPU usage, RAM usage, disk usage, and OS information."
    risk_level = "read"
    parameters = {"type": "object", "properties": {}}

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        snap = ctx.telemetry.snapshot()
        mem = snap["memory"]
        disk = snap["disk"]
        sysinfo = snap["system"]
        summary = (
            f"CPU: {snap['cpu_percent']}% ({snap['cpu_cores_logical']} logical cores) | "
            f"RAM: {mem['percent']}% ({mem['used_gb']}/{mem['total_gb']} GB) | "
            f"Disk {disk['drive']}: {disk['percent']}% ({disk['used_gb']}/{disk['total_gb']} GB) | "
            f"Host: {sysinfo['hostname']} ({sysinfo['os']})"
        )
        return ToolResult(True, summary, snap)


class WeatherTool(BaseTool):
    name = "get_weather"
    description = "Fetch real-time weather and short-term forecast for a city or configured location."
    risk_level = "read"
    parameters = {
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "Optional city name (defaults to configured weather city)."}
        },
    }

    def execute(self, params: dict[str, Any], ctx: ToolContext) -> ToolResult:
        settings = ctx.db.get_settings()
        city = str(params.get("city") or "").strip()
        if city:
            try:
                geo = ctx.weather.geocode_city(city)
                data = ctx.weather.get_weather(geo["name"], geo["latitude"], geo["longitude"])
            except Exception as exc:
                return ToolResult(False, f"Weather lookup failed for '{city}': {exc}")
        else:
            data = ctx.weather.get_weather(
                settings["weather_city"],
                float(settings["weather_lat"]),
                float(settings["weather_lon"]),
            )
        if data.get("status") != "online":
            return ToolResult(False, data.get("error", "Weather unavailable"), data)
        summary = (
            f"{data['city']}: {data['temperature_c']}°C, {data['condition']} "
            f"(feels like {data['apparent_temperature_c']}°C, humidity {data['humidity']}%, wind {data['wind_kmh']} km/h)"
        )
        return ToolResult(True, summary, data)
