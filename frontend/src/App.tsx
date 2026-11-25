import { useCallback, useEffect, useRef, useState } from "react";
import {
  BellRing,
  FolderGit2,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Minus,
  MonitorCog,
  Settings,
  Square,
  X,
} from "lucide-react";
import { api, getTelemetryWsUrl, initApiClient } from "./api";
import { ArcCore } from "./components/ArcCore";
import { ApprovalModal } from "./components/ApprovalModal";
import { ChatView } from "./components/ChatView";
import { DashboardView } from "./components/DashboardView";
import { DesktopControlView } from "./components/DesktopControlView";
import { SettingsModal } from "./components/SettingsModal";
import { ToolsView } from "./components/ToolsView";
import { VoiceWaveform } from "./components/VoiceWaveform";
import { WorkspaceView } from "./components/WorkspaceView";
import type {
  AIState,
  AuditLogEntry,
  ChatMessage,
  Conversation,
  PendingAction,
  ProjectSummary,
  ProviderStatus,
  SettingsData,
  TelemetrySnapshot,
  ToolSpec,
  WeatherData,
} from "./types";

type TabId = "overview" | "chat" | "desktop" | "workspace" | "tools";

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [idx: number]: {
      isFinal: boolean;
      [alt: number]: { transcript: string };
    };
  };
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  const win = window as unknown as Record<string, unknown>;
  const ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as new () => SpeechRecognitionInstance) : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [aiState, setAiState] = useState<AIState>("idle");
  const [providerName, setProviderName] = useState("local_router");
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [tools, setTools] = useState<ToolSpec[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [clockText, setClockText] = useState(() => new Date().toLocaleTimeString([], { hour12: false }));

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [modalAction, setModalAction] = useState<PendingAction | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Voice state
  const speechCtor = getSpeechRecognitionCtor();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setClockText(new Date().toLocaleTimeString([], { hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const refreshPendingActions = useCallback(async () => {
    const [list, logs] = await Promise.all([api.listActions("pending"), api.listAuditLogs()]);
    setPendingActions(list);
    setAuditLogs(logs);
    if (list.length > 0) {
      setAiState((prev) => (prev === "thinking" ? prev : "awaiting_approval"));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const [health, provStat, convs, w, tls, sett, projs] = await Promise.all([
      api.health(),
      api.getProvidersStatus(),
      api.listConversations(),
      api.weather(),
      api.listTools(),
      api.getSettings(),
      api.listProjects(),
    ]);
    setProviderName(health.provider);
    setProviderStatus(provStat);
    setConversations(convs);
    setWeather(w);
    setTools(tls);
    setSettings(sett);
    setProjects(projs);
    setTtsEnabled(sett.voice_tts_enabled);
    setWakeEnabled(sett.voice_wake_enabled);
    await refreshPendingActions();
    if (convs.length > 0 && !activeConvId) {
      setActiveConvId(convs[0].id);
      const msgs = await api.getMessages(convs[0].id);
      setMessages(msgs);
    }
  }, [activeConvId, refreshPendingActions]);

  // Initial load + Telemetry WebSocket with polling fallback
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollTimer: number | null = null;
    let unmounted = false;

    const boot = async () => {
      await initApiClient();
      try {
        const snap = await api.telemetry();
        if (!unmounted) setTelemetry(snap);
        await refreshAll();
      } catch (err) {
        console.error("NEXUS-AI bootstrap error:", err);
        if (!unmounted) setAiState("error");
      }

      const connectWs = () => {
        if (unmounted) return;
        ws = new WebSocket(getTelemetryWsUrl());
        ws.onmessage = (ev) => {
          try {
            const snap = JSON.parse(ev.data) as TelemetrySnapshot;
            setTelemetry(snap);
          } catch {
            // ignore malformed frame
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
        ws.onclose = () => {
          if (!unmounted && pollTimer === null) {
            pollTimer = window.setInterval(async () => {
              try {
                const snap = await api.telemetry();
                if (!unmounted) setTelemetry(snap);
              } catch {
                // ignore
              }
            }, 2000);
          }
        };
      };
      connectWs();
    };

    void boot();
    return () => {
      unmounted = true;
      ws?.close();
      if (pollTimer !== null) clearInterval(pollTimer);
    };
  }, [refreshAll]);

  const speakText = useCallback(
    async (text: string) => {
      if (!ttsEnabled || !text.trim()) return;
      const clean = text.replace(/[`*#]/g, "").slice(0, 600);
      if (settings?.voice_tts_engine === "sapi") {
        setIsSpeaking(true);
        setAiState("speaking");
        try {
          await api.speakSapi(clean);
        } finally {
          window.setTimeout(() => {
            setIsSpeaking(false);
            setAiState("idle");
          }, Math.min(6000, Math.max(1500, clean.length * 45)));
        }
        return;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(clean);
        utter.rate = 1.02;
        utter.pitch = 0.95;
        utter.onstart = () => {
          setIsSpeaking(true);
          setAiState("speaking");
        };
        utter.onend = () => {
          setIsSpeaking(false);
          setAiState(wakeEnabled ? "wake_armed" : "idle");
        };
        utter.onerror = () => {
          setIsSpeaking(false);
          setAiState("idle");
        };
        window.speechSynthesis.speak(utter);
      }
    },
    [ttsEnabled, settings?.voice_tts_engine, wakeEnabled]
  );

  const handleSelectConversation = async (id: string) => {
    setActiveConvId(id);
    const msgs = await api.getMessages(id);
    setMessages(msgs);
  };

  const handleNewConversation = async () => {
    const created = await api.createConversation("New Session");
    setConversations((prev) => [created, ...prev]);
    setActiveConvId(created.id);
    setMessages([]);
  };

  const handleDeleteConversation = async (id: string) => {
    await api.deleteConversation(id);
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (activeConvId === id) {
      const next = updated[0]?.id ?? null;
      setActiveConvId(next);
      setMessages(next ? await api.getMessages(next) : []);
    }
  };

  const handleSendMessage = useCallback(
    async (text: string) => {
      setIsSending(true);
      setAiState("thinking");
      try {
        const res = await api.sendChat(activeConvId, text);
        setActiveConvId(res.conversation_id);
        const [convs, msgs] = await Promise.all([
          api.listConversations(),
          api.getMessages(res.conversation_id),
        ]);
        setConversations(convs);
        setMessages(msgs);
        await refreshPendingActions();

        const hasPending = res.tool_events.some((ev) => ev.requires_approval);
        if (hasPending) {
          const firstPending = res.tool_events.find((ev) => ev.requires_approval)?.action ?? null;
          if (firstPending) setModalAction(firstPending);
          setAiState("awaiting_approval");
        } else {
          setAiState(wakeEnabled ? "wake_armed" : "idle");
        }
        await speakText(res.assistant_message.content);
      } catch (err) {
        setAiState("error");
        console.error(err);
      } finally {
        setIsSending(false);
      }
    },
    [activeConvId, refreshPendingActions, speakText, wakeEnabled]
  );

  // Web Speech API push-to-talk & optional wake phrase listener
  useEffect(() => {
    if (!speechCtor || (!isListening && !wakeEnabled)) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      return;
    }

    const rec = new speechCtor();
    rec.continuous = wakeEnabled && !isListening;
    rec.interimResults = false;
    rec.lang = "en-US";
    const wakePhrase = (settings?.voice_wake_phrase || "hey nexus").toLowerCase().trim();

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const res = event.results[i];
        if (!res.isFinal) continue;
        const transcript = res[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (isListening) {
          setIsListening(false);
          void handleSendMessage(transcript);
        } else if (wakeEnabled) {
          const low = transcript.toLowerCase();
          if (low.includes(wakePhrase)) {
            const stripped = low.replace(wakePhrase, "").trim();
            if (stripped.length > 1) {
              void handleSendMessage(stripped);
            } else {
              void speakText("Online and ready.");
              setIsListening(true);
            }
          }
        }
      }
    };

    rec.onerror = (e) => {
      setVoiceError(`Speech error: ${e.error}`);
      setIsListening(false);
    };

    rec.onend = () => {
      if (isListening) setIsListening(false);
      if (wakeEnabled && !isListening) {
        try {
          rec.start();
        } catch {
          // ignore restart race
        }
      }
    };

    try {
      rec.start();
      setVoiceError(null);
      setAiState(isListening ? "listening" : "wake_armed");
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "Could not start speech listener");
    }
    recognitionRef.current = rec;

    return () => {
      rec.onend = null;
      rec.stop();
    };
  }, [speechCtor, isListening, wakeEnabled, settings?.voice_wake_phrase, handleSendMessage, speakText]);

  const handleApproveAction = async (id: string) => {
    const res = await api.approveAction(id);
    setModalAction(null);
    await refreshPendingActions();
    setAiState(wakeEnabled ? "wake_armed" : "idle");
    if (activeConvId) {
      const msgs = await api.getMessages(activeConvId);
      setMessages(msgs);
    }
    void speakText(res.summary);
  };

  const handleRejectAction = async (id: string) => {
    await api.rejectAction(id);
    setModalAction(null);
    await refreshPendingActions();
    setAiState(wakeEnabled ? "wake_armed" : "idle");
  };

  const navItems: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Dashboard", icon: LayoutDashboard },
    { id: "chat", label: "Command Chat", icon: MessageSquare },
    { id: "workspace", label: "Workspace", icon: FolderGit2 },
    { id: "desktop", label: "Desktop Control", icon: MonitorCog },
    { id: "tools", label: "Tools & System", icon: Layers },
  ];

  const cpuPct = telemetry?.cpu_percent ?? 0;
  const ramPct = telemetry?.memory.percent ?? 0;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#04070f] text-slate-100 overflow-hidden">
      {/* Top Command Bar */}
      <header className="drag-region h-12 px-4 border-b border-sky-500/18 bg-slate-950/90 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/12 border border-sky-400/40 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-sky-300" fill="none" stroke="currentColor" strokeWidth="1.8">
              <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="font-display font-bold tracking-[0.18em] text-sm text-slate-100">
              NEXUS-AI
            </div>
            <div className="text-[10px] font-mono text-sky-400/80 uppercase tracking-wider">
              Personal Desktop Intelligence
            </div>
          </div>
        </div>

        {/* Right Telemetry, Pending & Controls */}
        <div className="no-drag flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400">ENGINE</span>
            <span className="text-sky-300 uppercase">{providerName}</span>
          </div>

          <div
            className="hidden md:block px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-slate-200"
            data-testid="hud-clock"
          >
            {clockText}
          </div>

          {pendingActions.length > 0 && (
            <button
              type="button"
              onClick={() => setModalAction(pendingActions[0])}
              data-testid="pending-badge-btn"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-mono cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>{pendingActions.length} Pending</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            data-testid="open-settings-btn"
            className="p-1.5 rounded-md bg-slate-900/90 hover:bg-sky-500/15 border border-slate-700 hover:border-sky-400/40 text-slate-300 hover:text-sky-200 transition cursor-pointer"
            title="NEXUS-AI Settings & Key Vault"
          >
            <Settings className="w-4 h-4" />
          </button>

          {window.nexusDesktop && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
              <button
                type="button"
                onClick={() => window.nexusDesktop?.windowControl("minimize")}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 cursor-pointer"
                aria-label="Minimize window"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => window.nexusDesktop?.windowControl("maximize")}
                className="p-1.5 rounded hover:bg-slate-800 text-slate-400 cursor-pointer"
                aria-label="Maximize window"
              >
                <Square className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => window.nexusDesktop?.windowControl("close")}
                className="p-1.5 rounded hover:bg-rose-500/25 text-slate-400 hover:text-rose-300 cursor-pointer"
                aria-label="Close window"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Application Shell */}
      <main className="flex-1 min-h-0 p-3 grid grid-cols-1 md:grid-cols-[264px_1fr] gap-3 overflow-hidden">
        {/* Left Navigation & Core Sidebar */}
        <aside className="flex flex-col gap-3 overflow-y-auto pr-0.5 min-h-0">
          <ArcCore state={aiState} providerName={providerName} />

          {/* Vertical Navigation */}
          <nav className="hud-panel rounded-lg p-2 space-y-1" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  data-testid={`nav-${item.id}`}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition cursor-pointer ${
                    active
                      ? "bg-sky-500/18 text-sky-100 border border-sky-400/40"
                      : "text-slate-300 hover:text-slate-100 hover:bg-slate-900/70 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-sky-300" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <VoiceWaveform
            ttsEnabled={ttsEnabled}
            wakeEnabled={wakeEnabled}
            wakePhrase={settings?.voice_wake_phrase || "hey nexus"}
            isListening={isListening}
            isSpeaking={isSpeaking}
            speechSupported={Boolean(speechCtor)}
            voiceError={voiceError}
            onToggleListen={() => setIsListening((v) => !v)}
            onToggleWake={() => {
              const next = !wakeEnabled;
              setWakeEnabled(next);
              void api.updateSettings({ voice_wake_enabled: next });
            }}
            onToggleTts={() => {
              const next = !ttsEnabled;
              setTtsEnabled(next);
              void api.updateSettings({ voice_tts_enabled: next });
            }}
          />

          {/* Compact Live Telemetry Strip */}
          <div className="hud-panel rounded-lg p-3 space-y-2 text-[11px] font-mono mt-auto">
            <div className="flex items-center justify-between text-slate-400 uppercase tracking-wider text-[10px]">
              <span>Compute Load</span>
              <span className="text-emerald-400">1 Hz</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>CPU</span>
                <span data-testid="cpu-readout">{cpuPct.toFixed(1)}%</span>
              </div>
              <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.min(100, cpuPct)}%` }} />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>RAM</span>
                <span data-testid="ram-readout">
                  {telemetry ? `${telemetry.memory.used_gb}/${telemetry.memory.total_gb} GB` : "—"}
                </span>
              </div>
              <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${ramPct > 85 ? "bg-amber-400" : "bg-blue-400"}`}
                  style={{ width: `${Math.min(100, ramPct)}%` }}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Active View Stage */}
        <section className="min-h-0 overflow-hidden">
          {activeTab === "overview" && (
            <DashboardView
              aiState={aiState}
              providerStatus={providerStatus}
              telemetry={telemetry}
              weather={weather}
              tools={tools}
              projects={projects}
              auditLogs={auditLogs}
              pendingActions={pendingActions}
              voiceTtsEnabled={ttsEnabled}
              voiceWakeEnabled={wakeEnabled}
              isListening={isListening}
              onRefreshWeather={async () => setWeather(await api.weather(undefined, true))}
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenSettings={() => setSettingsOpen(true)}
              onReviewPending={(act) => setModalAction(act)}
            />
          )}
          {activeTab === "chat" && (
            <ChatView
              conversations={conversations}
              activeConversationId={activeConvId}
              messages={messages}
              pendingActions={pendingActions}
              isSending={isSending}
              isListening={isListening}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewConversation}
              onDeleteConversation={handleDeleteConversation}
              onSendMessage={handleSendMessage}
              onToggleListen={() => setIsListening((v) => !v)}
              onApproveAction={handleApproveAction}
              onRejectAction={handleRejectAction}
            />
          )}
          {activeTab === "desktop" && (
            <DesktopControlView
              onActionQueued={async () => {
                await refreshPendingActions();
                const list = await api.listActions("pending");
                if (list.length > 0) setModalAction(list[0]);
              }}
            />
          )}
          {activeTab === "workspace" && (
            <WorkspaceView
              onActionQueued={async () => {
                await refreshPendingActions();
                const list = await api.listActions("pending");
                if (list.length > 0) setModalAction(list[0]);
              }}
            />
          )}
          {activeTab === "tools" && (
            <ToolsView tools={tools} telemetry={telemetry} weather={weather} />
          )}
        </section>
      </main>

      <ApprovalModal
        action={modalAction}
        onApprove={handleApproveAction}
        onReject={handleRejectAction}
        onClose={() => setModalAction(null)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdated={refreshAll}
      />
    </div>
  );
}
