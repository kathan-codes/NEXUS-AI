"""Native Windows SAPI Text-to-Speech helper using System.Speech."""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any


def list_sapi_voices() -> list[dict[str, str]]:
    if os.name != "nt":
        return []
    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.GetInstalledVoices() | ForEach-Object { "
        "$v = $_.VoiceInfo; "
        "[PSCustomObject]@{ name = $v.Name; culture = $v.Culture.Name; gender = $v.Gender.ToString() } "
        "} | ConvertTo-Json -Compress"
    )
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if res.returncode != 0 or not res.stdout.strip():
            return []
        parsed = json.loads(res.stdout.strip())
        if isinstance(parsed, dict):
            return [parsed]
        if isinstance(parsed, list):
            return parsed
    except Exception:
        return []
    return []


def speak_sapi(text: str, voice_name: str | None = None, rate: int = 0) -> dict[str, Any]:
    """Speak text asynchronously via Windows SAPI so the API stays responsive."""
    if os.name != "nt":
        return {"ok": False, "error": "Windows SAPI TTS is only supported on Windows"}
    cleaned = text.strip()[:1200]
    if not cleaned:
        return {"ok": False, "error": "Empty text"}

    rate_clamped = max(-5, min(5, int(rate)))
    # Pass text via environment variable to avoid shell interpolation/injection issues.
    env = dict(os.environ)
    env["JARVIS_TTS_TEXT"] = cleaned
    env["JARVIS_TTS_VOICE"] = (voice_name or "").strip()
    env["JARVIS_TTS_RATE"] = str(rate_clamped)

    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$s.Rate = [int]$env:JARVIS_TTS_RATE; "
        "if ($env:JARVIS_TTS_VOICE) { try { $s.SelectVoice($env:JARVIS_TTS_VOICE) } catch {} }; "
        "$s.Speak($env:JARVIS_TTS_TEXT)"
    )
    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"ok": True, "engine": "windows_sapi", "characters": len(cleaned)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
