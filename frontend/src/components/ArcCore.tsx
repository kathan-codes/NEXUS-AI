import type { AIState } from "../types";

interface ArcCoreProps {
  state: AIState;
  providerName: string;
}

const STATE_CONFIG: Record<
  AIState,
  { label: string; color: string; glow: string; ringClass: string }
> = {
  idle: {
    label: "STANDBY",
    color: "#22d3ee",
    glow: "rgba(34, 211, 238, 0.35)",
    ringClass: "animate-spin-slow",
  },
  wake_armed: {
    label: "WAKE ARMED",
    color: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.45)",
    ringClass: "animate-spin-slow",
  },
  listening: {
    label: "LISTENING",
    color: "#10b981",
    glow: "rgba(16, 185, 129, 0.6)",
    ringClass: "animate-spin-fast",
  },
  thinking: {
    label: "PROCESSING",
    color: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.7)",
    ringClass: "animate-spin-fast",
  },
  speaking: {
    label: "VOCALIZING",
    color: "#06b6d4",
    glow: "rgba(6, 182, 212, 0.65)",
    ringClass: "animate-spin-fast",
  },
  awaiting_approval: {
    label: "CONFIRMATION",
    color: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.6)",
    ringClass: "animate-spin-slow",
  },
  error: {
    label: "FAULT",
    color: "#ef4444",
    glow: "rgba(239, 68, 68, 0.55)",
    ringClass: "animate-spin-slow",
  },
};

export function ArcCore({ state, providerName }: ArcCoreProps) {
  const cfg = STATE_CONFIG[state];

  return (
    <div className="hud-panel rounded-xl p-4 flex flex-col items-center relative overflow-hidden">
      <div className="w-full flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-400 mb-2">
        <span>Neural Core</span>
        <span style={{ color: cfg.color }} className="font-semibold">
          ● {cfg.label}
        </span>
      </div>

      <div className="relative w-40 h-40 flex items-center justify-center my-1">
        <div
          className="absolute inset-4 rounded-full blur-xl transition-all duration-500"
          style={{ background: cfg.glow }}
        />
        <svg viewBox="0 0 200 200" className="w-full h-full relative z-10">
          {/* Outer calibrated tick ring */}
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="rgba(34,211,238,0.18)"
            strokeWidth="1.5"
            strokeDasharray="4 6"
          />
          <g className={cfg.ringClass}>
            <circle
              cx="100"
              cy="100"
              r="78"
              fill="none"
              stroke={cfg.color}
              strokeWidth="2.5"
              strokeDasharray="46 18 14 18"
              strokeLinecap="round"
              opacity="0.9"
            />
          </g>
          <g className="animate-spin-reverse">
            <circle
              cx="100"
              cy="100"
              r="60"
              fill="none"
              stroke="rgba(148,163,184,0.45)"
              strokeWidth="2"
              strokeDasharray="24 12 6 12"
            />
          </g>
          <circle
            cx="100"
            cy="100"
            r="44"
            fill="rgba(5, 12, 24, 0.9)"
            stroke={cfg.color}
            strokeWidth="1.8"
            opacity="0.95"
          />
          <circle
            cx="100"
            cy="100"
            r={state === "listening" || state === "thinking" ? 26 : 20}
            fill={cfg.color}
            opacity="0.22"
            className="transition-all duration-300"
          />
          <circle cx="100" cy="100" r="10" fill={cfg.color} />
        </svg>
      </div>

      <div className="w-full mt-2 pt-2 border-t border-cyan-500/15 flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-400">ENGINE</span>
        <span className="text-cyan-300 uppercase tracking-wider">{providerName}</span>
      </div>
    </div>
  );
}
