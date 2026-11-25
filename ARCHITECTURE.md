# NEXUS-AI — Architecture & Implementation Plan

## 1. Environment Assessment

Inspected on Windows x64:
- **Node.js** `v24.19.0` & **npm** `11.17.0`
- **Python** `3.14.6` & **pip** `26.1.2` (`fastapi`, `uvicorn`, `pydantic`, `websockets`, `httpx`, `pytest`, `playwright`)
- **Git** `2.55.0`
- **Browsers**: Google Chrome & Microsoft Edge installed

## 2. Recommended Technology Stack & Key Technical Decisions

| Layer | Choice | Rationale |
|---|---|---|
| **Desktop Shell** | **Electron** (Main + Context-Isolated Preload) | Uses Node 24 for a true frameless desktop window and native folder dialogs while keeping the renderer sandboxed (`contextIsolation: true`, `nodeIntegration: false`). |
| **Frontend UI** | **React 19 + TypeScript + Vite + Tailwind CSS v4** | Strict typing, zero-runtime styling overhead, subtle precision animations for the NEXUS Core status indicator and live Web Audio waveform. |
| **Local Backend** | **Python 3.14 + FastAPI + Uvicorn + WebSockets** | Zero-dependency access via `ctypes` to Win32 `GetSystemTimes`, `GlobalMemoryStatusEx`, and `crypt32.dll` DPAPI encryption without C++ build tools. |
| **Persistence** | **SQLite** (`sqlite3` with WAL mode) | Relational storage for conversation threads, messages, registered projects, task checklists, and security audit logs (`data/jarvis.db` preserved for compatibility). |
| **Secrets Vault** | **Windows DPAPI (`CryptProtectData`)** via Python `ctypes` | API keys are encrypted per-Windows-user at rest in `data/secrets.vault.json` and never returned in plaintext to the frontend (masked preview only). |
| **AI Providers** | **Pluggable `BaseAIProvider` Registry** | Supports **OpenAI** (and compatible endpoints), **Google Gemini**, **Anthropic Claude**, and **Ollama** (auto-detected local LLM), plus a transparent **Local Command Router** when no LLM is configured. |
| **Voice System** | **Web Audio API + Web Speech API + Windows SAPI Fallback** | Live microphone FFT waveform via `AudioContext`/`AnalyserNode`; STT & optional wake phrase (`"hey nexus"`) via `SpeechRecognition`; TTS via `window.speechSynthesis` and optional Windows `System.Speech` SAPI endpoint. |
| **Telemetry & Weather** | **Win32 APIs (`ctypes`) + Open-Meteo REST API** | Real-time 1 Hz CPU, RAM, disk, and uptime over WebSocket; real meteorological data & forecasts from Open-Meteo (no API key needed). |

## 3. High-Level System Architecture

```
+-----------------------------------------------------------------------+
|  Electron Desktop Shell (main.cjs + preload.cjs -> window.nexusDesktop)|
|  - Frameless HUD Window & Native Folder Picker                        |
|  - Spawns & supervises local FastAPI backend (127.0.0.1:8765)         |
|  - Passes per-session ephemeral Auth Token via IPC                    |
+----------------------------------+------------------------------------+
                                   | HTTP / WebSocket (127.0.0.1:8765)
                                   v
+-----------------------------------------------------------------------+
|  FastAPI Backend (Python 3.14)                                        |
|  +----------------------+  +--------------------+  +---------------+  |
|  | API & WS Router      |  | AI Provider Hub    |  | Tool Registry |  |
|  | /api/chat            |  | - OpenAI           |  | (BaseTool)    |  |
|  | /api/actions         |  | - Gemini           |  | - read tier   |  |
|  | /api/workspace       |  | - Anthropic        |  | - confirm tier|  |
|  | /api/settings        |  | - Ollama (local)   |  +-------+-------+  |
|  | /api/telemetry       |  | - Command Router   |          |          |
|  | /api/weather         |  +--------------------+          v          |
|  | /ws/telemetry        |                         +----------------+  |
|  +----------+-----------+                         | Approval Gate  |  |
|             |                                     | PendingAction  |  |
|  +----------v-----------+  +--------------------+ | + Audit Log    |  |
|  | SQLite Store (WAL)   |  | DPAPI Vault        | +----------------+  |
|  | conversations, tasks,|  | crypt32.dll        |                     |
|  | projects, audit_log  |  | encrypted secrets  |                     |
|  +----------------------+  +--------------------+                     |
+-----------------------------------------------------------------------+
```

## 4. Security & Compatibility Exceptions

1. **No Arbitrary Terminal Execution**: All desktop actions map to strictly typed `BaseTool` handlers.
2. **Two-Tier Risk Gate**: `read` actions execute directly; `confirm` actions (`open_application`, `open_website`, `write_project_file`, `run_project_check`) create a `PendingAction` in SQLite and execute only after explicit approval.
3. **Internal Compatibility Identifiers**:
   - `data/jarvis.db` filename (and `BLOCKED_FILE_NAMES` entry) is preserved so existing local databases continue working seamlessly.
   - `JARVIS_API_TOKEN`, `JARVIS_PORT`, `JARVIS_DATA_DIR`, `JARVIS_PYTHON`, `JARVIS_DEV_URL`, and `X-Jarvis-Token` are retained as secondary fallbacks behind `NEXUS_*` / `X-Nexus-Token`.
   - `backend/tests/test_jarvis_backend.py` and `ArcCore.tsx` retain their file names to avoid breaking external references, while their contents and UI labels represent **NEXUS-AI**.
