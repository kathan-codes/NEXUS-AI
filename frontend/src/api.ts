import type {
  AuditLogEntry,
  ChatMessage,
  Conversation,
  DesktopApp,
  PendingAction,
  ProjectInspection,
  ProjectSummary,
  ProjectTask,
  ProviderStatus,
  SecretsStatus,
  SettingsData,
  TelemetrySnapshot,
  ToolEvent,
  ToolSpec,
  WeatherData,
} from "./types";

let apiBase = "";
let apiToken = "";
let initialized = false;

export async function initApiClient(): Promise<void> {
  if (initialized) return;
  if (window.jarvisDesktop) {
    const cfg = await window.jarvisDesktop.getConfig();
    apiBase = cfg.apiBase;
    apiToken = cfg.apiToken;
  }
  initialized = true;
}

export function getTelemetryWsUrl(): string {
  if (apiBase) {
    const wsBase = apiBase.replace(/^http/, "ws");
    const q = apiToken ? `?token=${encodeURIComponent(apiToken)}` : "";
    return `${wsBase}/ws/telemetry${q}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/telemetry`;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  await initApiClient();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (apiToken) {
    headers["X-Jarvis-Token"] = apiToken;
  }
  const res = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // keep HTTP status
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ status: string; provider: string; tools_count: number }>("/api/health"),
  telemetry: () => request<TelemetrySnapshot>("/api/telemetry"),
  weather: (city?: string, force = false) => {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (force) params.set("force", "true");
    const qs = params.toString();
    return request<WeatherData>(`/api/weather${qs ? `?${qs}` : ""}`);
  },
  geocodeCity: (city: string) =>
    request<{ name: string; country: string; latitude: number; longitude: number }>(
      `/api/weather/geocode?city=${encodeURIComponent(city)}`
    ),

  listConversations: () => request<Conversation[]>("/api/conversations"),
  createConversation: (title = "New Session") =>
    request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  deleteConversation: (id: string) =>
    request<{ deleted: boolean }>(`/api/conversations/${id}`, { method: "DELETE" }),
  getMessages: (id: string) => request<ChatMessage[]>(`/api/conversations/${id}/messages`),
  sendChat: (conversationId: string | null, message: string) =>
    request<{
      conversation_id: string;
      user_message: ChatMessage;
      assistant_message: ChatMessage;
      tool_events: ToolEvent[];
    }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ conversation_id: conversationId, message }),
    }),

  listApps: () => request<DesktopApp[]>("/api/desktop/apps"),
  searchFiles: (q: string, rootPath?: string) => {
    const params = new URLSearchParams({ q });
    if (rootPath) params.set("root_path", rootPath);
    return request<ToolEvent>(`/api/desktop/search?${params.toString()}`);
  },
  listActions: (status?: string) =>
    request<PendingAction[]>(`/api/actions${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  invokeTool: (tool_name: string, params: Record<string, unknown>) =>
    request<ToolEvent>("/api/actions/invoke", {
      method: "POST",
      body: JSON.stringify({ tool_name, params }),
    }),
  approveAction: (id: string) =>
    request<{ action: PendingAction; ok: boolean; summary: string }>(`/api/actions/${id}/approve`, {
      method: "POST",
    }),
  rejectAction: (id: string) =>
    request<{ action: PendingAction; ok: boolean; summary: string }>(`/api/actions/${id}/reject`, {
      method: "POST",
    }),
  listAuditLogs: () => request<AuditLogEntry[]>("/api/audit"),
  listTools: () => request<ToolSpec[]>("/api/tools"),

  listProjects: () => request<ProjectSummary[]>("/api/workspace/projects"),
  addProject: (name: string, path: string, description = "") =>
    request<ProjectSummary>("/api/workspace/projects", {
      method: "POST",
      body: JSON.stringify({ name, path, description }),
    }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/api/workspace/projects/${id}`, { method: "DELETE" }),
  inspectProject: (id: string) => request<ProjectInspection>(`/api/workspace/projects/${id}`),
  readProjectFile: (id: string, path: string) =>
    request<{ path: string; size: number; line_count: number; language: string; content: string }>(
      `/api/workspace/projects/${id}/file?path=${encodeURIComponent(path)}`
    ),
  createTask: (projectId: string, title: string, priority: "low" | "medium" | "high" = "medium") =>
    request<ProjectTask>(`/api/workspace/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title, priority }),
    }),
  updateTask: (taskId: string, status: "todo" | "in_progress" | "done") =>
    request<ProjectTask>(`/api/workspace/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  deleteTask: (taskId: string) =>
    request<{ deleted: boolean }>(`/api/workspace/tasks/${taskId}`, { method: "DELETE" }),
  workspaceAssist: (payload: {
    project_id?: string;
    relative_path?: string;
    mode: "summarize" | "debug" | "generate_code" | "generate_docs";
    prompt: string;
  }) =>
    request<{ ok: boolean; provider: string; model: string; output: string }>("/api/workspace/assist", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  proposeWrite: (project_id: string, relative_path: string, content: string) =>
    request<ToolEvent>("/api/workspace/propose-write", {
      method: "POST",
      body: JSON.stringify({ project_id, relative_path, content }),
    }),

  speakSapi: (text: string) =>
    request<{ ok: boolean; engine?: string }>("/api/voice/speak", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  getSettings: () => request<SettingsData>("/api/settings"),
  updateSettings: (updates: Partial<SettingsData>) =>
    request<SettingsData>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),
  getSecretsStatus: () => request<SecretsStatus>("/api/secrets"),
  setSecret: (key_name: string, value: string) =>
    request<SecretsStatus>("/api/secrets", {
      method: "POST",
      body: JSON.stringify({ key_name, value }),
    }),
  getProvidersStatus: () => request<ProviderStatus>("/api/providers/status"),
};
