import { CheckCircle2, ShieldAlert, X, XCircle } from "lucide-react";
import type { PendingAction } from "../types";

interface ApprovalModalProps {
  action: PendingAction | null;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onClose: () => void;
}

export function ApprovalModal({ action, onApprove, onReject, onClose }: ApprovalModalProps) {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        data-testid="approval-modal"
        className="hud-panel-amber rounded-2xl max-w-lg w-full p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-widest text-amber-300">
                Security Confirmation Gate
              </div>
              <h3 className="text-base font-display font-semibold text-slate-100">
                {action.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-slate-200 leading-relaxed">{action.description}</p>

        <div className="p-3 rounded-xl bg-slate-950/85 border border-amber-500/25">
          <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
            Tool & Exact Parameters
          </div>
          <pre className="text-xs font-mono text-amber-100 overflow-x-auto max-h-40">
            {JSON.stringify({ tool: action.tool_name, params: action.params }, null, 2)}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onReject(action.id)}
            data-testid="modal-reject-btn"
            className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <XCircle className="w-4 h-4" /> Deny Action
          </button>
          <button
            type="button"
            onClick={() => onApprove(action.id)}
            data-testid="modal-approve-btn"
            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" /> Approve & Execute
          </button>
        </div>
      </div>
    </div>
  );
}
