"""Real weather integration powered by Open-Meteo (no API key required)."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("Clear Sky", "clear"),
    1: ("Mainly Clear", "clear"),
    2: ("Partly Cloudy", "cloudy"),
    3: ("Overcast", "cloudy"),
    45: ("Fog", "fog"),
    48: ("Depositing Rime Fog", "fog"),
    51: ("Light Drizzle", "rain"),
    53: ("Moderate Drizzle", "rain"),
    55: ("Dense Drizzle", "rain"),
    61: ("Slight Rain", "rain"),
    63: ("Moderate Rain", "rain"),
    65: ("Heavy Rain", "rain"),
    71: ("Slight Snow", "snow"),
    73: ("Moderate Snow", "snow"),
    75: ("Heavy Snow", "snow"),
    80: ("Rain Showers", "rain"),
    81: ("Moderate Showers", "rain"),
    82: ("Violent Showers", "rain"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunderstorm with Hail", "storm"),
    99: ("Severe Thunderstorm", "storm"),
}


class WeatherService:
    """Fetches and caches live weather from Open-Meteo."""

    def __init__(self, ttl_seconds: int = 300) -> None:
        self._ttl = ttl_seconds
        self._cache: dict[str, tuple[float, dict[str, Any]]] = {}

    @staticmethod
    def _fetch_json(url: str, timeout: float = 8.0) -> dict[str, Any]:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "NEXUS-AI-Desktop/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def geocode_city(self, city: str) -> dict[str, Any]:
        q = urllib.parse.quote(city.strip())
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={q}&count=5&language=en&format=json"
        data = self._fetch_json(url)
        results = data.get("results") or []
        if not results:
            raise ValueError(f"City not found: {city}")
        top = results[0]
        return {
            "name": top.get("name", city),
            "country": top.get("country", ""),
            "admin1": top.get("admin1", ""),
            "latitude": float(top["latitude"]),
            "longitude": float(top["longitude"]),
        }

    def get_weather(self, city: str, lat: float, lon: float, force: bool = False) -> dict[str, Any]:
        cache_key = f"{city}:{lat:.3f},{lon:.3f}"
        now = time.time()
        if not force and cache_key in self._cache:
            ts, cached = self._cache[cache_key]
            if now - ts < self._ttl:
                return {**cached, "cached": True}

        url = (
            "https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day"
            "&hourly=temperature_2m,weather_code"
            "&forecast_days=1&timezone=auto"
        )
        try:
            data = self._fetch_json(url)
            cur = data.get("current", {})
            code = int(cur.get("weather_code", 0))
            condition, icon = WMO_CODES.get(code, ("Unknown", "cloudy"))
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])[:8]
            temps = hourly.get("temperature_2m", [])[:8]
            codes = hourly.get("weather_code", [])[:8]
            forecast = [
                {
                    "time": t.split("T")[-1] if "T" in t else t,
                    "temperature_c": temp,
                    "condition": WMO_CODES.get(int(c), ("Unknown", "cloudy"))[0],
                }
                for t, temp, c in zip(times, temps, codes)
            ]
            payload = {
                "status": "online",
                "city": city,
                "latitude": lat,
                "longitude": lon,
                "timezone": data.get("timezone", "UTC"),
                "temperature_c": cur.get("temperature_2m"),
                "apparent_temperature_c": cur.get("apparent_temperature"),
                "humidity": cur.get("relative_humidity_2m"),
                "wind_kmh": cur.get("wind_speed_10m"),
                "is_day": bool(cur.get("is_day", 1)),
                "weather_code": code,
                "condition": condition,
                "icon": icon,
                "forecast": forecast,
                "source": "Open-Meteo",
                "updated_at": now,
                "cached": False,
            }
            self._cache[cache_key] = (now, payload)
            return payload
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            return {
                "status": "unavailable",
                "city": city,
                "latitude": lat,
                "longitude": lon,
                "error": f"Live weather unavailable: {exc}",
                "source": "Open-Meteo",
                "updated_at": now,
                "cached": False,
            }
