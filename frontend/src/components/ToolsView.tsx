import { Cpu, Layers, ShieldAlert, ShieldCheck } from "lucide-react";
import type { TelemetrySnapshot, ToolSpec, WeatherData } from "../types";

interface ToolsViewProps {
  tools: ToolSpec[];
  telemetry: TelemetrySnapshot | null;
  weather: WeatherData | null;
}

export function ToolsView({ tools, telemetry, weather }: ToolsViewProps) {
  return (
    <div className="space-y-3 h-full overflow-y-auto pr-1">
      <section className="hud-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-display font-semibold text-cyan-100">
              EXTENSIBLE TOOL REGISTRY ({tools.length} MODULES)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Modular BaseTool plugins · backend/tools/
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {tools.map((t) => (
            <div key={t.name} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-cyan-200">{t.name}</span>
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                    t.risk_level === "confirm"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                  }`}
                >
                  {t.risk_level === "confirm" ? (
                    <ShieldAlert className="w-3 h-3" />
                  ) : (
                    <ShieldCheck className="w-3 h-3" />
                  )}
                  {t.risk_level}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{t.description}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="hud-panel rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-display font-semibold text-cyan-100">
              HARDWARE & RUNTIME DIAGNOSTICS
            </h3>
          </div>
          {telemetry ? (
            <dl className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/70">
                <dt className="text-slate-500">HOSTNAME</dt>
                <dd className="text-slate-200 mt-0.5">{telemetry.system.hostname}</dd>
              </div>
              <div className="p-2 rounded bg-slate-950/70">
                <dt className="text-slate-500">OPERATING SYSTEM</dt>
                <dd className="text-slate-200 mt-0.5">{telemetry.system.os}</dd>
              </div>
              <div className="p-2 rounded bg-slate-950/70">
                <dt className="text-slate-500">ARCHITECTURE</dt>
                <dd className="text-slate-200 mt-0.5">
                  {telemetry.system.architecture} ({telemetry.cpu_cores_logical} threads)
                </dd>
              </div>
              <div className="p-2 rounded bg-slate-950/70">
                <dt className="text-slate-500">PYTHON CORE</dt>
                <dd className="text-slate-200 mt-0.5">Python {telemetry.system.python_version}</dd>
              </div>
            </dl>
          ) : (
            <div className="text-xs text-slate-400">Connecting to telemetry stream...</div>
          )}
        </section>

        <section className="hud-panel rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-display font-semibold text-cyan-100">
            HOURLY WEATHER FORECAST ({weather?.city || "—"})
          </h3>
          {weather?.forecast && weather.forecast.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {weather.forecast.map((f) => (
                <div key={f.time} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 text-center">
                  <div className="text-[10px] font-mono text-slate-400">{f.time}</div>
                  <div className="text-sm font-mono font-semibold text-cyan-200 mt-0.5">
                    {f.temperature_c}°C
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{f.condition}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">Forecast unavailable.</div>
          )}
        </section>
      </div>
    </div>
  );
}
