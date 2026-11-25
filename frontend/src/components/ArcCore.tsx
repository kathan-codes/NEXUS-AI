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
    color: "#38bdf8",
    glow: "rgba(56, 189, 248, 0.22)",
    ringClass: "animate-spin-slow",
  },
  wake_armed: {
    label: "WAKE ARMED",
    color: "#22d3ee",
    glow: "rgba(34, 211, 238, 0.28)",
    ringClass: "animate-spin-slow",
  },
  listening: {
    label: "LISTENING",
    color: "#10b981",
    glow: "rgba(16, 185, 129, 0.36)",
    ringClass: "animate-spin-fast",
  },
  thinking: {
    label: "PROCESSING",
    color: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.42)",
    ringClass: "animate-spin-fast",
  },
  speaking: {
    label: "VOCALIZING",
    color: "#06b6d4",
    glow: "rgba(6, 182, 212, 0.38)",
    ringClass: "animate-spin-fast",
  },
  awaiting_approval: {
    label: "APPROVAL REQ",
    color: "#f59e0b",
    glow: "rgba(245, 158, 11, 0.36)",
    ringClass: "animate-spin-slow",
  },
  error: {
    label: "FAULT",
    color: "#ef4444",
    glow: "rgba(239, 68, 68, 0.35)",
    ringClass: "animate-spin-slow",
  },
};

export function ArcCore({ state, providerName }: ArcCoreProps) {
  const cfg = STATE_CONFIG[state];

  return (
    <div className="hud-panel rounded-lg p-3.5 flex flex-col items-center relative overflow-hidden">
      <div className="w-full flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-1.5">
        <span>NEXUS CORE</span>
        <span style={{ color: cfg.color }} className="font-semibold">
          ● {cfg.label}
        </span>
      </div>

      <div className="relative w-32 h-32 flex items-center justify-center my-0.5">
        <div
          className="absolute inset-4 rounded-full blur-xl transition-all duration-500"
          style={{ background: cfg.glow }}
        />
        <svg viewBox="0 0 200 200" className="w-full h-full relative z-10" aria-label="NEXUS-AI Core Status Indicator">
          {/* Outer calibrated orbit */}
          <circle
            cx="100"
            cy="100"
            r="88"
            fill="none"
            stroke="rgba(56, 189, 248, 0.16)"
            strokeWidth="1.2"
            strokeDasharray="3 6"
          />
          <g className={cfg.ringClass}>
            <circle
              cx="100"
              cy="100"
              r="76"
              fill="none"
              stroke={cfg.color}
              strokeWidth="2.2"
              strokeDasharray="52 20 12 20"
              strokeLinecap="round"
              opacity="0.88"
            />
          </g>
          <g className="animate-spin-reverse">
            <polygon
              points="100,42 150,71 150,129 100,158 50,129 50,71"
              fill="none"
              stroke="rgba(148, 163, 184, 0.32)"
              strokeWidth="1.5"
            />
          </g>
          <circle
            cx="100"
            cy="100"
            r="38"
            fill="rgba(4, 9, 20, 0.92)"
            stroke={cfg.color}
            strokeWidth="1.6"
          />
          <circle
            cx="100"
            cy="100"
            r={state === "listening" || state === "thinking" ? 22 : 16}
            fill={cfg.color}
            opacity="0.2"
            className="transition-all duration-300"
          />
          <circle cx="100" cy="100" r="7.5" fill={cfg.color} />
        </svg>
      </div>

      <div className="w-full mt-2 pt-2 border-t border-sky-500/15 flex items-center justify-between text-[10px] font-mono">
        <span className="text-slate-400">PROVIDER</span>
        <span className="text-sky-300 uppercase tracking-wider">{providerName}</span>
      </div>
    </div>
  );
}
