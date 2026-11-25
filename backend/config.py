"""Configuration, paths, and security guardrails for NEXUS-AI."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(
    os.environ.get("NEXUS_DATA_DIR") or os.environ.get("JARVIS_DATA_DIR") or str(BASE_DIR / "data")
).resolve()
# Preserve jarvis.db filename for existing local database compatibility.
DB_PATH = DATA_DIR / "jarvis.db"
VAULT_PATH = DATA_DIR / "secrets.vault.json"

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = int(os.environ.get("NEXUS_PORT") or os.environ.get("JARVIS_PORT") or "8765")

# Sensitive directory names blocked during file search and workspace reads.
BLOCKED_DIR_NAMES = frozenset(
    {
        ".ssh",
        ".aws",
        ".gnupg",
        ".kube",
        ".docker",
        ".git",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        "AppData",
        "ProgramData",
        "Windows",
    }
)

# Sensitive file patterns blocked from arbitrary reading/searching.
BLOCKED_FILE_NAMES = frozenset(
    {
        ".env",
        ".env.local",
        ".env.production",
        "id_rsa",
        "id_ed25519",
        "credentials.json",
        "secrets.vault.json",
        "jarvis.db",
    }
)

ALLOWED_PROJECT_CHECKS: dict[str, list[str]] = {
    "git_status": ["git", "status", "--short", "--branch"],
    "git_log": ["git", "log", "-n", "10", "--oneline"],
    "pytest": ["python", "-m", "pytest", "-q"],
    "npm_test": ["npm", "test"],
    "npm_build": ["npm", "run", "build"],
}

MAX_FILE_READ_BYTES = 256 * 1024  # 256 KB
MAX_SEARCH_RESULTS = 60

DEFAULT_SETTINGS = {
    "active_provider": "auto",  # auto | openai | gemini | anthropic | ollama | local_router
    "openai_model": "gpt-4o-mini",
    "openai_base_url": "https://api.openai.com/v1",
    "gemini_model": "gemini-2.5-flash",
    "anthropic_model": "claude-3-5-sonnet-latest",
    "ollama_url": "http://127.0.0.1:11434",
    "ollama_model": "llama3.2",
    "weather_city": "New York",
    "weather_lat": 40.7128,
    "weather_lon": -74.0060,
    "voice_tts_enabled": True,
    "voice_tts_engine": "browser",  # browser | sapi
    "voice_wake_phrase": "hey nexus",
    "voice_wake_enabled": False,
    "system_prompt": (
        "You are NEXUS-AI, a precise, calm, futuristic personal desktop AI assistant. "
        "Be concise, helpful, technically accurate, and security-conscious. Never claim an action "
        "succeeded unless its tool output confirms it, and always respect user approval gates."
    ),
}


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def default_search_roots() -> list[Path]:
    """Return safe, user-relevant default roots for scoped file search."""
    home = Path.home()
    candidates = [
        BASE_DIR,
        home / "Desktop",
        home / "Documents",
        home / "Downloads",
        home / "Projects",
    ]
    roots: list[Path] = []
    seen: set[Path] = set()
    for p in candidates:
        try:
            rp = p.resolve()
            if rp.exists() and rp.is_dir() and rp not in seen:
                seen.add(rp)
                roots.append(rp)
        except OSError:
            continue
    return roots
