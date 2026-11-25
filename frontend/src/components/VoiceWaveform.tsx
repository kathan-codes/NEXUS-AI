import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Volume2, VolumeX } from "lucide-react";

interface VoiceWaveformProps {
  ttsEnabled: boolean;
  wakeEnabled: boolean;
  wakePhrase: string;
  isListening: boolean;
  isSpeaking: boolean;
  onToggleListen: () => void;
  onToggleWake: () => void;
  onToggleTts: () => void;
  speechSupported: boolean;
  voiceError: string | null;
}

export function VoiceWaveform({
  ttsEnabled,
  wakeEnabled,
  wakePhrase,
  isListening,
  isSpeaking,
  onToggleListen,
  onToggleWake,
  onToggleTts,
  speechSupported,
  voiceError,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micDenied, setMicDenied] = useState<string | null>(null);

  useEffect(() => {
    let animId = 0;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array<ArrayBuffer> | null = null;
    let cancelled = false;

    const drawFrame = (phase: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Center baseline
      ctx.strokeStyle = "rgba(34, 211, 238, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (analyser && dataArray && micActive) {
        analyser.getByteFrequencyData(dataArray);
        const bars = 36;
        const step = Math.max(1, Math.floor(dataArray.length / bars));
        const barWidth = w / bars;
        for (let i = 0; i < bars; i++) {
          const val = dataArray[i * step] / 255;
          const barH = Math.max(3, val * (h - 8));
          const x = i * barWidth + 2;
          const y = (h - barH) / 2;
          ctx.fillStyle = isListening ? "#10b981" : "#22d3ee";
          ctx.fillRect(x, y, Math.max(2, barWidth - 4), barH);
        }
      } else if (isSpeaking) {
        // Deterministic harmonic envelope while TTS output is active
        const bars = 36;
        const barWidth = w / bars;
        for (let i = 0; i < bars; i++) {
          const norm = Math.sin(phase * 0.18 + i * 0.45) * 0.5 + 0.5;
          const barH = 6 + norm * (h * 0.55);
          const x = i * barWidth + 2;
          const y = (h - barH) / 2;
          ctx.fillStyle = "#06b6d4";
          ctx.fillRect(x, y, Math.max(2, barWidth - 4), barH);
        }
      } else {
        // Calm idle baseline indicator (not fake audio)
        const bars = 36;
        const barWidth = w / bars;
        for (let i = 0; i < bars; i++) {
          const x = i * barWidth + 2;
          ctx.fillStyle = "rgba(34, 211, 238, 0.25)";
          ctx.fillRect(x, h / 2 - 1.5, Math.max(2, barWidth - 4), 3);
        }
      }
      animId = requestAnimationFrame(() => drawFrame(phase + 1));
    };

    const startMicAnalyser = async () => {
      if (!isListening && !wakeEnabled) {
        setMicActive(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicDenied("Microphone API unavailable in this environment.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        source.connect(analyser);
        dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        setMicDenied(null);
        setMicActive(true);
      } catch (err) {
        setMicActive(false);
        setMicDenied(err instanceof Error ? err.message : "Microphone permission denied.");
      }
    };

    void startMicAnalyser();
    animId = requestAnimationFrame(() => drawFrame(0));

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) void audioCtx.close();
    };
  }, [isListening, wakeEnabled, isSpeaking, micActive]);

  return (
    <div className="hud-panel rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-widest text-slate-400">
        <span>Voice Link</span>
        <span className={micActive ? "text-emerald-400" : isSpeaking ? "text-cyan-300" : "text-slate-500"}>
          {micActive ? "LIVE MIC FFT" : isSpeaking ? "TTS ACTIVE" : "STANDBY"}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        width={260}
        height={48}
        className="w-full h-12 rounded-lg bg-slate-950/70 border border-cyan-500/15"
      />

      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onToggleListen}
          disabled={!speechSupported}
          title={speechSupported ? "Push-to-talk speech input" : "SpeechRecognition unsupported in this browser"}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40 ${
            isListening
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50"
              : "bg-slate-900/80 text-slate-200 border border-slate-700/80 hover:border-cyan-400/40"
          }`}
        >
          {isListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          <span>{isListening ? "Stop" : "Talk"}</span>
        </button>

        <button
          type="button"
          onClick={onToggleWake}
          disabled={!speechSupported}
          title={`Toggle wake phrase (${wakePhrase})`}
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-40 ${
            wakeEnabled
              ? "bg-cyan-500/20 text-cyan-200 border border-cyan-400/50"
              : "bg-slate-900/80 text-slate-300 border border-slate-700/80 hover:border-cyan-400/40"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Wake</span>
        </button>

        <button
          type="button"
          onClick={onToggleTts}
          title="Toggle spoken voice responses"
          className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            ttsEnabled
              ? "bg-blue-500/20 text-blue-200 border border-blue-400/40"
              : "bg-slate-900/80 text-slate-400 border border-slate-700/80"
          }`}
        >
          {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          <span>TTS</span>
        </button>
      </div>

      {(voiceError || micDenied || !speechSupported) && (
        <p className="text-[11px] text-amber-300/90 leading-snug">
          {voiceError || micDenied || "Web Speech STT unavailable here; text input & TTS remain active."}
        </p>
      )}
    </div>
  );
}
