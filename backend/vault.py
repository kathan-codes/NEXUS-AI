"""Encrypted API key & secret management using Windows DPAPI (crypt32.dll)."""

from __future__ import annotations

import base64
import ctypes
import ctypes.wintypes as wt
import json
import os
from pathlib import Path

from .config import VAULT_PATH, ensure_data_dir


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [
        ("cbData", wt.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_char)),
    ]


def _dpapi_protect(plaintext: bytes, description: str = "NEXUS-AI-Secret") -> bytes:
    if os.name != "nt":
        raise RuntimeError("DPAPI vault requires Windows")
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    buf = ctypes.create_string_buffer(plaintext, len(plaintext))
    in_blob = _DATA_BLOB(len(plaintext), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out_blob = _DATA_BLOB()
    ok = crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        description,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    )
    if not ok:
        raise OSError(f"CryptProtectData failed with error {ctypes.GetLastError()}")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def _dpapi_unprotect(ciphertext: bytes) -> bytes:
    if os.name != "nt":
        raise RuntimeError("DPAPI vault requires Windows")
    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32
    buf = ctypes.create_string_buffer(ciphertext, len(ciphertext))
    in_blob = _DATA_BLOB(len(ciphertext), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    out_blob = _DATA_BLOB()
    ok = crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    )
    if not ok:
        raise OSError(f"CryptUnprotectData failed with error {ctypes.GetLastError()}")
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)


def mask_secret(value: str | None) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * min(12, len(value) - 8)}{value[-4:]}"


class SecretsVault:
    """Stores provider API keys encrypted per-Windows-user via DPAPI."""

    ALLOWED_KEYS = ("openai_api_key", "gemini_api_key", "anthropic_api_key")

    def __init__(self, vault_path: Path | None = None) -> None:
        self.vault_path = vault_path or VAULT_PATH

    def _read_raw(self) -> dict[str, str]:
        if not self.vault_path.exists():
            return {}
        try:
            data = json.loads(self.vault_path.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return {str(k): str(v) for k, v in data.items()}
        except (OSError, json.JSONDecodeError):
            return {}
        return {}

    def _write_raw(self, payload: dict[str, str]) -> None:
        ensure_data_dir()
        self.vault_path.parent.mkdir(parents=True, exist_ok=True)
        self.vault_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def set_secret(self, name: str, value: str) -> None:
        if name not in self.ALLOWED_KEYS:
            raise ValueError(f"Unsupported secret key: {name}")
        raw = self._read_raw()
        cleaned = value.strip()
        if not cleaned:
            raw.pop(name, None)
        else:
            encrypted = _dpapi_protect(cleaned.encode("utf-8"), description=f"NEXUS-AI:{name}")
            raw[name] = base64.b64encode(encrypted).decode("ascii")
        self._write_raw(raw)

    def get_secret(self, name: str) -> str | None:
        raw = self._read_raw()
        encoded = raw.get(name)
        if not encoded:
            return None
        try:
            encrypted = base64.b64decode(encoded.encode("ascii"))
            return _dpapi_unprotect(encrypted).decode("utf-8")
        except Exception:
            return None

    def delete_secret(self, name: str) -> None:
        raw = self._read_raw()
        if name in raw:
            raw.pop(name, None)
            self._write_raw(raw)

    def status(self) -> dict[str, dict[str, str | bool]]:
        out: dict[str, dict[str, str | bool]] = {}
        for key in self.ALLOWED_KEYS:
            val = self.get_secret(key)
            out[key] = {
                "configured": bool(val),
                "masked": mask_secret(val),
                "storage": "windows_dpapi",
            }
        return out
