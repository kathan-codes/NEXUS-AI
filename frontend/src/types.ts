export type AIState =
  | "idle"
  | "listening"
  | "wake_armed"
  | "thinking"
  | "speaking"
  | "awaiting_approval"
  | "error";

export interface TelemetryHistoryPoint {
  timestamp: number;
  cpu_percent: number;
  ram_percent: number;
}

export interface TelemetrySnapshot {
  timestamp: number;
  cpu_percent: number;
  cpu_cores_logical: number;
  memory: {
    percent: number;
    total_gb: number;
    used_gb: number;
    available_gb: number;
  };
  disk: {
    drive: string;
    percent: number;
    used_gb: number;
    total_gb: number;
  };
  system: {
    hostname: string;
    os: string;
    os_version: string;
    architecture: string;
    processor: string;
    python_version: string;
    uptime_seconds: number;
    backend_uptime_seconds: number;
  };
  history: TelemetryHistoryPoint[];
}

export interface WeatherForecastItem {
  time: string;
  temperature_c: number;
  condition: string;
}

export interface WeatherData {
  status: "online" | "unavailable";
  city: string;
  temperature_c?: number;
  apparent_temperature_c?: number;
  humidity?: number;
  wind_kmh?: number;
  is_day?: boolean;
  condition?: string;
  icon?: string;
  forecast?: WeatherForecastItem[];
  source?: string;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface PendingAction {
  id: string;
  tool_name: string;
  title: string;
  description: string;
  risk_level: string;
  params: Record<string, unknown>;
  status: "pending" | "executed" | "rejected" | "failed";
  result?: { ok?: boolean; summary?: string; data?: Record<string, unknown> } | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface ToolEvent {
  status: string;
  requires_approval: boolean;
  tool_name?: string;
  summary: string;
  ok: boolean;
  action?: PendingAction;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  metadata?: {
    tool_events?: ToolEvent[];
    provider_unconfigured?: boolean;
    error?: string;
  };
  created_at: string;
}

export interface DesktopApp {
  id: string;
  name: string;
  category: string;
  target: string;
  available: boolean;
  source: string;
}

export interface SearchMatch {
  name: string;
  path: string;
  type: "file" | "folder";
  size: number | null;
}

export interface AuditLogEntry {
  id: string;
  action_id?: string | null;
  tool_name: string;
  risk_level: string;
  decision: string;
  target: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  description: string;
  created_at: string;
  exists?: boolean;
  task_total?: number;
  task_done?: number;
  progress_percent?: number;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  created_at: string;
  updated_at: string;
}

export interface ProjectInspection {
  project: ProjectSummary;
  exists: boolean;
  error?: string;
  summary?: {
    file_count: number;
    total_kb: number;
    languages: { name: string; count: number }[];
    todo_count: number;
  };
  git?: {
    is_repo: boolean;
    branch?: string;
    changed_count?: number;
    changed_files?: string[];
    recent_commits?: string[];
  };
  files?: { path: string; size: number; language: string }[];
  todos?: { file: string; line: number; tag: string; text: string }[];
  tasks: ProjectTask[];
  progress?: {
    total: number;
    done: number;
    in_progress: number;
    todo: number;
    percent: number;
  };
}

export interface ToolSpec {
  name: string;
  description: string;
  risk_level: "read" | "confirm";
  parameters: Record<string, unknown>;
}

export interface SettingsData {
  active_provider: string;
  openai_model: string;
  openai_base_url: string;
  gemini_model: string;
  anthropic_model: string;
  ollama_url: string;
  ollama_model: string;
  weather_city: string;
  weather_lat: number;
  weather_lon: number;
  voice_tts_enabled: boolean;
  voice_tts_engine: "browser" | "sapi";
  voice_wake_phrase: string;
  voice_wake_enabled: boolean;
  system_prompt: string;
}

export interface SecretsStatus {
  [key: string]: {
    configured: boolean;
    masked: string;
    storage: string;
  };
}

export interface ProviderStatus {
  configured_mode: string;
  active_provider: string;
  providers: Record<
    string,
    {
      available: boolean;
      model?: string;
      base_url?: string;
      url?: string;
      installed_models?: string[];
      description?: string;
    }
  >;
}

declare global {
  interface Window {
    nexusDesktop?: {
      isElectron: boolean;
      getConfig: () => Promise<{ apiBase: string; apiToken: string; isElectron: boolean }>;
      pickFolder: () => Promise<string | null>;
      windowControl: (action: "minimize" | "maximize" | "close") => Promise<void>;
    };
  }
}
