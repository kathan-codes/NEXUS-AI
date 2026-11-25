import { useEffect, useState } from "react";
import { Cloud, Cpu, HardDrive, MemoryStick, RefreshCw, Sun, Wind } from "lucide-react";
import type { TelemetrySnapshot, WeatherData } from "../types";

interface TelemetryPanelProps {
  telemetry: TelemetrySnapshot | null;
  weather: WeatherData | null;
  onRefreshWeather: () => void;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="h-8 flex items-center text-[10px] font-mono text-slate-500">Sampling...</div>;
  }
  const max = 100;
  const w = 220;
  const h = 32;
  const pts = values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * w;
      const y = h - (Math.min(max, Math.max(0, v)) / max) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} />
    </svg>
  );
}

export function TelemetryPanel({ telemetry, weather, onRefreshWeather }: TelemetryPanelProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const cpuValues = telemetry?.history.map((p) => p.cpu_percent) ?? [];
  const cpuPct = telemetry?.cpu_percent ?? 0;
  const ramPct = telemetry?.memory.percent ?? 0;

  return (
    <div className="space-y-3">
      {/* Real-time Clock */}
      <div className="hud-panel rounded-xl p-3.5">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-400">
          <span>Chronometer</span>
          <span className="text-cyan-400">LOCAL</span>
        </div>
        <div className="text-2xl font-mono font-semibold tracking-wider text-cyan-200 mt-1" data-testid="hud-clock">
          {now.toLocaleTimeString([], { hour12: false })}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {now.toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
        </div>
      </div>

      {/* System Telemetry */}
      <div className="hud-panel rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-400">
          <span>System Telemetry</span>
          <span className="text-emerald-400">1 Hz</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" /> CPU Load
            </span>
            <span className="font-mono text-cyan-200" data-testid="cpu-readout">
              {cpuPct.toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(100, cpuPct)}%` }}
            />
          </div>
          <Sparkline values={cpuValues} color="#22d3ee" />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              <MemoryStick className="w-3.5 h-3.5 text-blue-400" /> RAM
            </span>
            <span className="font-mono text-blue-200" data-testid="ram-readout">
              {telemetry ? `${telemetry.memory.used_gb}/${telemetry.memory.total_gb} GB (${ramPct}%)` : "—"}
            </span>
          </div>
          <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                ramPct > 85 ? "bg-amber-400" : "bg-blue-400"
              }`}
              style={{ width: `${Math.min(100, ramPct)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs pt-1 border-t border-cyan-500/10 text-slate-400">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            Disk {telemetry?.disk.drive ?? ""}
          </span>
          <span className="font-mono text-slate-200">
            {telemetry ? `${telemetry.disk.used_gb}/${telemetry.disk.total_gb} GB` : "—"}
          </span>
        </div>

        {telemetry && (
          <div className="text-[11px] font-mono text-slate-400 flex justify-between">
            <span className="truncate max-w-[130px]">{telemetry.system.hostname}</span>
            <span>Up {formatUptime(telemetry.system.uptime_seconds)}</span>
          </div>
        )}
      </div>

      {/* Weather Card */}
      <div className="hud-panel rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-400">
          <span>Atmospheric</span>
          <button
            type="button"
            onClick={onRefreshWeather}
            className="text-cyan-400 hover:text-cyan-200 transition cursor-pointer"
            title="Refresh live weather"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {weather?.status === "online" ? (
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-100">{weather.city}</div>
                <div className="text-xs text-slate-400">{weather.condition}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {weather.icon === "clear" ? (
                  <Sun className="w-5 h-5 text-amber-300" />
                ) : (
                  <Cloud className="w-5 h-5 text-cyan-300" />
                )}
                <span className="text-xl font-mono font-semibold text-cyan-200" data-testid="weather-temp">
                  {weather.temperature_c}°C
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 pt-2 border-t border-cyan-500/10">
              <span>Humidity {weather.humidity}%</span>
              <span className="flex items-center gap-1">
                <Wind className="w-3 h-3" /> {weather.wind_kmh} km/h
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-amber-300/90" data-testid="weather-status">
            {weather?.error || "Fetching live weather..."}
          </div>
        )}
      </div>
    </div>
  );
}
