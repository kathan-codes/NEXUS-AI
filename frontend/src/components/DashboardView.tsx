import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Cloud,
  Cpu,
  FolderGit2,
  HardDrive,
  Layers,
  MemoryStick,
  MessageSquare,
  Mic,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Wind,
} from "lucide-react";
import type {
  AIState,
  AuditLogEntry,
  PendingAction,
  ProjectSummary,
  ProviderStatus,
  TelemetrySnapshot,
  ToolSpec,
  WeatherData,
} from "../types";

interface DashboardViewProps {
  aiState: AIState;
  providerStatus: ProviderStatus | null;
  telemetry: TelemetrySnapshot | null;
  weather: WeatherData | null;
  tools: ToolSpec[];
  projects: ProjectSummary[];
  auditLogs: AuditLogEntry[];
  pendingActions: PendingAction[];
  voiceTtsEnabled: boolean;
  voiceWakeEnabled: boolean;
  isListening: boolean;
  onRefreshWeather: () => void;
  onNavigate: (tab: "chat" | "desktop" | "workspace" | "tools") => void;
  onOpenSettings: () => void;
  onReviewPending: (action: PendingAction) => void;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="h-9 flex items-center text-[10px] font-mono text-slate-500">Collecting samples...</div>;
  }
  const w = 260;
  const h = 36;
  const pts = values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * w;
      const y = h - (Math.min(100, Math.max(0, v)) / 100) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9 overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} />
    </svg>
  );
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function DashboardView({
  aiState,
  providerStatus,
  telemetry,
  weather,
  tools,
  projects,
  auditLogs,
  pendingActions,
  voiceTtsEnabled,
  voiceWakeEnabled,
  isListening,
  onRefreshWeather,
  onNavigate,
  onOpenSettings,
  onReviewPending,
}: DashboardViewProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const activeProvider = providerStatus?.active_provider || "local_router";
  const activeProvInfo = providerStatus?.providers?.[activeProvider];
  const cpuPct = telemetry?.cpu_percent ?? 0;
  const ramPct = telemetry?.memory.percent ?? 0;
  const cpuHistory = telemetry?.history.map((h) => h.cpu_percent) ?? [];
  const readToolsCount = tools.filter((t) => t.risk_level === "read").length;
  const confirmToolsCount = tools.filter((t) => t.risk_level === "confirm").length;

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-3" data-testid="dashboard-view">
      {/* Top Executive Status Banner */}
      <section className="hud-panel rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-sky-400">
            <Activity className="w-3.5 h-3.5" />
            <span>NEXUS-AI Operational Overview</span>
          </div>
          <h1 className="text-xl font-display font-semibold text-slate-100">
            System Ready ·{" "}
            <span className="text-sky-300 uppercase font-mono text-base">{aiState.replace("_", " ")}</span>
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Active engine: <span className="font-mono text-slate-200">{activeProvider}</span>
            {activeProvInfo?.model ? ` (${activeProvInfo.model})` : ""} ·{" "}
            {tools.length} modular tools registered · Security approval gate active
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate("chat")}
            data-testid="dash-open-chat"
            className="px-3.5 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/45 text-sky-100 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Open Command Chat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            <span>Configure Providers</span>
          </button>
        </div>
      </section>

      {/* Pending Approval Alert Strip */}
      {pendingActions.length > 0 && (
        <section className="hud-panel-amber rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-amber-300">
                {pendingActions.length} Pending Security Confirmation{pendingActions.length > 1 ? "s" : ""}
              </div>
              <div className="text-xs text-slate-200">{pendingActions[0].title}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onReviewPending(pendingActions[0])}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-100 text-xs font-medium cursor-pointer shrink-0"
          >
            Review Request
          </button>
        </section>
      )}

      {/* Primary Telemetry & Weather Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Chronometer & Host */}
        <div className="hud-panel rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400">
            <span>System Chronometer</span>
            <span className="text-emerald-400">ONLINE</span>
          </div>
          <div className="my-2">
            <div className="text-2xl font-mono font-semibold text-sky-200" data-testid="dash-clock">
              {now.toLocaleTimeString([], { hour12: false })}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <div className="pt-2 border-t border-sky-500/10 text-[11px] font-mono text-slate-400 flex justify-between">
            <span className="truncate max-w-[140px]">{telemetry?.system.hostname || "—"}</span>
            <span>{telemetry ? `Up ${formatUptime(telemetry.system.uptime_seconds)}` : "—"}</span>
          </div>
        </div>

        {/* CPU Telemetry */}
        <div className="hud-panel rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" /> CPU Telemetry
            </span>
            <span className="text-sky-300 font-semibold" data-testid="dash-cpu">
              {cpuPct.toFixed(1)}%
            </span>
          </div>
          <div className="my-1.5">
            <Sparkline values={cpuHistory} color="#38bdf8" />
          </div>
          <div className="pt-2 border-t border-sky-500/10 text-[11px] font-mono text-slate-400 flex justify-between">
            <span>{telemetry?.cpu_cores_logical ?? "—"} Logical Threads</span>
            <span>1 Hz Stream</span>
          </div>
        </div>

        {/* Memory & Storage */}
        <div className="hud-panel rounded-lg p-3.5 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400">
            <span className="flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5 text-blue-400" /> Memory & Disk
            </span>
            <span className="text-blue-200">{ramPct}% RAM</span>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300 mb-1">
                <span>Physical RAM</span>
                <span>
                  {telemetry ? `${telemetry.memory.used_gb}/${telemetry.memory.total_gb} GB` : "—"}
                </span>
              </div>
              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${ramPct > 85 ? "bg-amber-400" : "bg-blue-400"}`}
                  style={{ width: `${Math.min(100, ramPct)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-mono text-slate-300 mb-1">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-slate-400" />
                  Disk {telemetry?.disk.drive || ""}
                </span>
                <span>
                  {telemetry ? `${telemetry.disk.used_gb}/${telemetry.disk.total_gb} GB` : "—"}
                </span>
              </div>
              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all"
                  style={{ width: `${Math.min(100, telemetry?.disk.percent ?? 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Weather Telemetry */}
        <div className="hud-panel rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400">
            <span>Atmospheric</span>
            <button
              type="button"
              onClick={onRefreshWeather}
              className="text-sky-400 hover:text-sky-200 cursor-pointer"
              title="Refresh live weather"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {weather?.status === "online" ? (
            <>
              <div className="flex items-center justify-between my-1.5">
                <div>
                  <div className="text-sm font-medium text-slate-100">{weather.city}</div>
                  <div className="text-xs text-slate-400">{weather.condition}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  {weather.icon === "clear" ? (
                    <Sun className="w-5 h-5 text-amber-300" />
                  ) : (
                    <Cloud className="w-5 h-5 text-sky-300" />
                  )}
                  <span className="text-xl font-mono font-semibold text-sky-200">
                    {weather.temperature_c}°C
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-sky-500/10 text-[11px] font-mono text-slate-400 flex justify-between">
                <span>Humidity {weather.humidity}%</span>
                <span className="flex items-center gap-1">
                  <Wind className="w-3 h-3" /> {weather.wind_kmh} km/h
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-amber-300/90 my-2">
              {weather?.error || "Live weather unavailable."}
            </div>
          )}
        </div>
      </div>

      {/* Subsystems Summary Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* Voice & Provider Readiness */}
        <section className="hud-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Subsystems & Voice Status
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("tools")}
              className="text-[11px] font-mono text-slate-400 hover:text-sky-300 cursor-pointer"
            >
              Details →
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded hud-panel-subtle flex items-center justify-between">
              <span className="text-slate-300">Active AI Provider</span>
              <span className="font-mono text-sky-300 uppercase">{activeProvider}</span>
            </div>
            <div className="p-2.5 rounded hud-panel-subtle flex items-center justify-between">
              <span className="text-slate-300">Voice Recognition</span>
              <span className="font-mono text-slate-200">
                {isListening ? "ACTIVE" : voiceWakeEnabled ? "WAKE ARMED" : "STANDBY"}
              </span>
            </div>
            <div className="p-2.5 rounded hud-panel-subtle flex items-center justify-between">
              <span className="text-slate-300">Voice Output (TTS)</span>
              <span className={`font-mono ${voiceTtsEnabled ? "text-emerald-300" : "text-slate-500"}`}>
                {voiceTtsEnabled ? "ENABLED" : "MUTED"}
              </span>
            </div>
            <div className="p-2.5 rounded hud-panel-subtle flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" /> Modular Tools
              </span>
              <span className="font-mono text-slate-200">
                {readToolsCount} read · {confirmToolsCount} gated
              </span>
            </div>
          </div>
        </section>

        {/* Workspace Status */}
        <section className="hud-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5" /> Intelligent Workspace ({projects.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("workspace")}
              className="text-[11px] font-mono text-slate-400 hover:text-sky-300 cursor-pointer"
            >
              Open →
            </button>
          </div>
          {projects.length === 0 ? (
            <div className="p-4 rounded hud-panel-subtle text-xs text-slate-400 text-center">
              No projects registered yet. Open Workspace to add a local codebase for inspection and progress tracking.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {projects.slice(0, 4).map((p) => (
                <div key={p.id} className="p-2.5 rounded hud-panel-subtle space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-100 truncate">{p.name}</span>
                    <span className="font-mono text-[11px] text-emerald-300">
                      {p.progress_percent ?? 0}%
                    </span>
                  </div>
                  <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${p.progress_percent ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Security & Tool Activity */}
        <section className="hud-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Recent Activity
            </h2>
            <button
              type="button"
              onClick={() => onNavigate("desktop")}
              className="text-[11px] font-mono text-slate-400 hover:text-sky-300 cursor-pointer"
            >
              Audit Log →
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <div className="p-4 rounded hud-panel-subtle text-xs text-slate-400 text-center">
              No tool executions or security decisions logged yet.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {auditLogs.slice(0, 6).map((log) => (
                <div
                  key={log.id}
                  className="px-2.5 py-2 rounded hud-panel-subtle flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-sky-300 truncate">{log.tool_name}</div>
                    <div className="text-[11px] text-slate-400 truncate">{log.target}</div>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono text-[10px] shrink-0 ${
                      log.decision.includes("rejected")
                        ? "bg-rose-500/20 text-rose-300"
                        : log.decision.includes("pending")
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {log.decision}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
