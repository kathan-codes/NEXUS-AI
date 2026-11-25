import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  Copy,
  MessageSquarePlus,
  Mic,
  Send,
  ShieldAlert,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import type { ChatMessage, Conversation, PendingAction } from "../types";

interface ChatViewProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  pendingActions: PendingAction[];
  isSending: boolean;
  isListening: boolean;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onSendMessage: (text: string) => Promise<void>;
  onToggleListen: () => void;
  onApproveAction: (id: string) => Promise<void>;
  onRejectAction: (id: string) => Promise<void>;
}

const QUICK_PROMPTS = [
  "system status",
  "weather",
  "list projects",
  "search files README",
  "open notepad",
];

function FormattedText({ text }: { text: string }) {
  const segments = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      {segments.map((seg, i) => {
        if (seg.startsWith("```") && seg.endsWith("```")) {
          const inner = seg.slice(3, -3).replace(/^[a-zA-Z0-9_+-]+\n/, "");
          return (
            <pre
              key={i}
              className="p-3 rounded-lg bg-slate-950/90 border border-sky-500/20 text-xs font-mono text-sky-100 overflow-x-auto"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        return (
          <div key={i} className="whitespace-pre-wrap">
            {seg.split("\n").map((line, li) => (
              <div key={li}>
                {line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, pi) => {
                  if (part.startsWith("`") && part.endsWith("`")) {
                    return (
                      <code
                        key={pi}
                        className="px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 font-mono text-xs"
                      >
                        {part.slice(1, -1)}
                      </code>
                    );
                  }
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return (
                      <strong key={pi} className="text-sky-100 font-semibold">
                        {part.slice(2, -2)}
                      </strong>
                    );
                  }
                  return <span key={pi}>{part}</span>;
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function ChatView({
  conversations,
  activeConversationId,
  messages,
  pendingActions,
  isSending,
  isListening,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onSendMessage,
  onToggleListen,
  onApproveAction,
  onRejectAction,
}: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pendingActions.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = draft.trim();
    if (!msg || isSending) return;
    setDraft("");
    await onSendMessage(msg);
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-3 h-full min-h-0">
      {/* Conversation History Rail */}
      <aside className="hud-panel rounded-lg p-3 flex flex-col min-h-0">
        <button
          type="button"
          onClick={onNewConversation}
          data-testid="new-chat-btn"
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/40 text-sky-100 text-xs font-medium transition cursor-pointer"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Session</span>
        </button>

        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mt-3 mb-2">
          Sessions ({conversations.length})
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {conversations.length === 0 ? (
            <div className="text-xs text-slate-500 py-4 text-center">No saved sessions yet.</div>
          ) : (
            conversations.map((c) => {
              const active = c.id === activeConversationId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center justify-between gap-1 px-2.5 py-2 rounded-lg text-xs transition cursor-pointer ${
                    active
                      ? "bg-sky-500/15 border border-sky-400/35 text-sky-100"
                      : "hover:bg-slate-800/60 text-slate-300 border border-transparent"
                  }`}
                  onClick={() => onSelectConversation(c.id)}
                >
                  <div className="truncate flex-1">{c.title}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition p-0.5 cursor-pointer"
                    title="Delete session"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Main Conversation Stream */}
      <section className="hud-panel rounded-lg flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-sky-500/15 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-semibold text-slate-100 tracking-wide">
              NEXUS-AI COMMAND CONSOLE
            </h2>
            <p className="text-[11px] text-slate-400">
              Natural language dialogue, context memory, and approval-gated orchestration
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp}
                type="button"
                onClick={() => onSendMessage(qp)}
                className="px-2 py-1 rounded bg-slate-900/90 hover:bg-sky-500/15 border border-slate-700/80 hover:border-sky-400/40 text-[11px] font-mono text-slate-300 hover:text-sky-200 transition cursor-pointer"
              >
                {qp}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
              <div className="w-12 h-12 rounded-lg bg-sky-500/10 border border-sky-400/30 flex items-center justify-center mb-3">
                <Bot className="w-6 h-6 text-sky-300" />
              </div>
              <h3 className="text-base font-display font-semibold text-slate-100">
                NEXUS-AI Online and Standing By
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Request live diagnostics, weather briefings, scoped file searches, workspace inspection, or launch
                applications and websites with explicit security confirmation.
              </p>
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-sky-300" />
                  </div>
                )}

                <div
                  className={`group max-w-[82%] rounded-lg px-4 py-3 ${
                    isUser
                      ? "bg-blue-600/20 border border-blue-400/30 text-slate-100"
                      : "bg-slate-900/85 border border-sky-500/20 text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{isUser ? "Operator" : "NEXUS-AI"}</span>
                      {m.provider && <span className="text-sky-400">· {m.provider}</span>}
                      {m.model && <span className="text-slate-500">({m.model})</span>}
                    </div>
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleCopy(m.id, m.content)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-300 transition cursor-pointer"
                        title="Copy response"
                      >
                        {copiedId === m.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  <FormattedText text={m.content} />
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-blue-300" />
                  </div>
                )}
              </div>
            );
          })}

          {pendingActions.length > 0 && (
            <div className="space-y-2 pt-2">
              {pendingActions.map((act) => (
                <div
                  key={act.id}
                  data-testid="inline-pending-action"
                  className="hud-panel-amber rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider text-amber-300">
                        Confirmation Required · {act.tool_name}
                      </div>
                      <div className="text-sm font-medium text-slate-100">{act.title}</div>
                      <div className="text-xs text-slate-300">{act.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveAction(act.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 text-xs font-medium cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectAction(act.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-200 text-xs font-medium cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isSending && (
            <div className="text-xs font-mono text-sky-300 animate-pulse">
              NEXUS-AI is processing request...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-sky-500/15 bg-slate-950/70 flex gap-2">
          <button
            type="button"
            onClick={onToggleListen}
            title="Voice input"
            className={`px-3 rounded-lg border transition cursor-pointer ${
              isListening
                ? "bg-emerald-500/25 border-emerald-400 text-emerald-200"
                : "bg-slate-900 border-slate-700 text-slate-300 hover:border-sky-400/50"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Issue a command or ask NEXUS-AI anything..."
            data-testid="chat-input"
            className="flex-1 bg-slate-900/90 border border-slate-700/90 focus:border-sky-400/60 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isSending}
            data-testid="chat-send-btn"
            className="px-4 py-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-40 border border-sky-400/50 text-sky-100 text-sm font-medium flex items-center gap-2 transition cursor-pointer"
          >
            <span>Send</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </section>
    </div>
  );
}
