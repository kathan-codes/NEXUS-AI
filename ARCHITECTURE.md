# J.A.R.V.I.S. — Architecture & Implementation Plan

## 1. Environment Assessment

Inspected on Windows x64:
- **Node.js** `v24.19.0` & **npm** `11.17.0`
- **Python** `3.14.6` & **pip** `26.1.2` (with `fastapi 0.139.0`, `uvicorn 0.49.0`, `pydantic 2.13.4`, `playwright 1.61.0` preinstalled)
- **Git** `2.55.0`
- **Browsers**: Google Chrome & Microsoft Edge installed
- **Missing**: Rust/Cargo, .NET SDK, Go, Ollama (no local LLM daemon running by default)

## 2. Recommended Technology Stack & Key Technical Decisions

| Layer | Choice | Rationale |
|---|---|---|
| **Desktop Shell** | **Electron** (Main + Context-Isolated Preload) | Rust/Cargo is absent so Tauri cannot compile natively; Electron leverages Node 24 for a true desktop window (custom frameless HUD controls, tray/native dialogs, process lifecycle) while keeping renderer sandboxed (`contextIsolation: true`, `nodeIntegration: false`). |
| **Frontend UI** | **React 19 + TypeScript + Vite + Tailwind CSS v4** | Fast HMR, strict typing, zero-runtime styling overhead, hardware-accelerated CSS + Canvas/SVG animations for the Arc Reactor core and live Web Audio waveform. |
| **Local Backend** | **Python 3.14 + FastAPI + Uvicorn + WebSockets** | FastAPI, Uvicorn, and Pydantic are already installed; Python `ctypes` gives zero-dependency access to Win32 `GetSystemTimes`, `GlobalMemoryStatusEx`, and `crypt32.dll` DPAPI encryption without native C++ build tools. |
| **Persistence** | **SQLite** (`sqlite3` with WAL mode) | Zero-config relational storage for conversation threads, messages, registered projects, task checklists, and security audit logs. |
| **Secrets Vault** | **Windows DPAPI (`CryptProtectData`)** via Python `ctypes` | API keys are encrypted per-Windows-user at rest in `data/secrets.vault.json` and never returned in plaintext to the frontend (masked preview only). |
| **AI Providers** | **Pluggable `BaseAIProvider` Registry** | Supports **OpenAI** (and compatible endpoints), **Google Gemini**, **Anthropic Claude**, and **Ollama** (auto-detected local LLM), plus a transparent **Local Command Router** when no LLM is configured (no fake AI replies). |
| **Voice System** | **Web Audio API + Web Speech API + Windows SAPI Fallback** | Live microphone FFT waveform via `AudioContext`/`AnalyserNode`; STT & optional wake phrase (`"Hey Jarvis"`) via `SpeechRecognition` (with WAV upload/Windows Speech fallback); TTS via `window.speechSynthesis` and optional Windows `System.Speech` SAPI endpoint. |
| **Telemetry & Weather** | **Win32 APIs (`ctypes`) + Open-Meteo REST API** | Real-time 1 Hz CPU, RAM, disk, and uptime over WebSocket; real meteorological data & forecasts from Open-Meteo (no API key needed). |

## 3. High-Level System Architecture

```
+-----------------------------------------------------------------------+
|  Electron Desktop Shell (main.cjs + preload.cjs)                      |
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

## 4. Security Architecture (Zero-Trust Desktop Control)

1. **No Arbitrary Terminal Execution**: There is no shell/eval endpoint. All desktop actions map to strictly typed `BaseTool` handlers.
2. **Two-Tier Risk Gate**:
   - `read`: Telemetry, weather, scoped directory/file search, project metadata & read-only file preview.
   - `confirm`: Opening allowlisted/discovered applications, opening `http(s)://` URLs, writing/generating files inside registered project roots, running allowlisted project checks (`git status`, `pytest`, `npm test` via `shell=False`).
3. **Explicit Approval Token**: Every `confirm` tool invocation creates a `PendingAction` in SQLite with exact target/arguments and waits in `pending` state until the user clicks **Approve** (or confirms via explicit API call).
4. **Path Traversal & Sensitive Directory Protection**: File searches and workspace reads resolve canonical paths (`Path.resolve()`), block sensitive user directories (`.ssh`, `.aws`, `.gnupg`, `AppData\Local\Microsoft`, `.env` credentials by default), and enforce size/binary guards.
5. **Ephemeral Session Token + Localhost Binding**: Backend binds strictly to `127.0.0.1` and validates an instance token (with configurable CORS for Vite dev / Electron file origin).

## 5. Implementation Plan

1. **Backend (`backend/`)**: Core config, SQLite persistence, DPAPI secrets vault, Win32 telemetry, Open-Meteo weather service, extensible `ToolRegistry` & `ApprovalGate`, `WorkspaceService` (projects, git status, document/code inspection, progress milestones), `AIProviderHub` (OpenAI, Gemini, Anthropic, Ollama, Local Command Router), Windows SAPI TTS helper, FastAPI routes & WebSocket.
2. **Frontend (`frontend/`)**: Cinematic dark HUD design system (`Space Grotesk` / `JetBrains Mono` / cyan-amber holographic palette), interactive Arc Reactor AI status core, real-time Web Audio microphone waveform + STT/TTS/wake-phrase engine, multi-thread AI conversation panel with tool-call & confirmation cards, Desktop Control center (app catalog, URL launcher, scoped file search, audit log), Intelligent Workspace (project manager, progress tracker, file explorer, summarize/debug/code-doc generator with diff/save confirmation), and Settings modal (providers, DPAPI API keys, weather location, voice settings).
3. **Electron Shell (`electron/`)**: Main process managing Python backend lifecycle, native folder dialog, window controls, and `preload.cjs` IPC bridge.
4. **Verification**: Backend `pytest` suite (vault encryption roundtrip, approval gate enforcement, path-traversal protection, telemetry, tool registry, workspace analysis, chat routing), frontend production build, live Playwright E2E UI verification against running backend + frontend, and Electron desktop smoke test.
5. **Documentation**: Complete `README.md` and `docs/USER_GUIDE.md` covering installation, configuration, security model, provider setup, and adding custom tools.
