import { useEffect, useState } from "react";
import {
  AppWindow,
  Folder,
  FileText,
  Globe,
  Search,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { api } from "../api";
import type { AuditLogEntry, DesktopApp, SearchMatch } from "../types";

interface DesktopControlViewProps {
  onActionQueued: () => Promise<void>;
}

export function DesktopControlView({ onActionQueued }: DesktopControlViewProps) {
  const [apps, setApps] = useState<DesktopApp[]>([]);
  const [appFilter, setAppFilter] = useState("");
  const [urlInput, setUrlInput] = useState("https://github.com");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searchRoots, setSearchRoots] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [appList, logs] = await Promise.all([api.listApps(), api.listAuditLogs()]);
      setApps(appList);
      setAuditLogs(logs);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Failed to load desktop catalog");
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleLaunchApp = async (app: DesktopApp) => {
    const res = await api.invokeTool("open_application", { app_name: app.id });
    setStatusBanner(res.summary);
    await onActionQueued();
    await loadData();
  };

  const handleOpenUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    const res = await api.invokeTool("open_website", { url: urlInput.trim() });
    setStatusBanner(res.summary);
    await onActionQueued();
    await loadData();
  };

  const handleFileSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.searchFiles(searchQuery.trim());
      const data = res.data as { results?: SearchMatch[]; roots?: string[] } | undefined;
      setSearchResults(data?.results ?? []);
      setSearchRoots(data?.roots ?? []);
      setStatusBanner(res.summary);
      await loadData();
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const filteredApps = apps.filter(
    (a) =>
      a.name.toLowerCase().includes(appFilter.toLowerCase()) ||
      a.category.toLowerCase().includes(appFilter.toLowerCase())
  );

  return (
    <div className="space-y-3 h-full overflow-y-auto pr-1">
      {statusBanner && (
        <div className="hud-panel rounded-xl px-4 py-2.5 text-xs font-mono text-cyan-200 flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* Application Launcher */}
        <section className="hud-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AppWindow className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-display font-semibold text-cyan-100">
                APPLICATION LAUNCHER
              </h3>
            </div>
            <span className="text-[11px] font-mono text-amber-300 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" /> Approval Gated
            </span>
          </div>

          <input
            type="text"
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            placeholder="Filter installed applications..."
            className="w-full bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400/50"
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {filteredApps.map((app) => (
              <button
                key={app.id}
                type="button"
                disabled={!app.available}
                onClick={() => handleLaunchApp(app)}
                data-testid={`app-btn-${app.id}`}
                className="text-left p-2.5 rounded-lg bg-slate-900/80 hover:bg-cyan-500/15 border border-slate-700/80 hover:border-cyan-400/40 disabled:opacity-35 transition cursor-pointer"
              >
                <div className="text-xs font-medium text-slate-100 truncate">{app.name}</div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">{app.category}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Website Launcher & File Search */}
        <div className="space-y-3">
          <section className="hud-panel rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-display font-semibold text-cyan-100">
                  WEB NAVIGATION
                </h3>
              </div>
              <span className="text-[11px] font-mono text-amber-300">Approval Gated</span>
            </div>

            <form onSubmit={handleOpenUrl} className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://..."
                data-testid="url-launcher-input"
                className="flex-1 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 outline-none focus:border-cyan-400/50"
              />
              <button
                type="submit"
                data-testid="url-launcher-btn"
                className="px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/40 text-blue-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open
              </button>
            </form>
          </section>

          <section className="hud-panel rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-display font-semibold text-cyan-100">
                  SCOPED FILE & FOLDER SEARCH
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-300">Safe Read-Only</span>
            </div>

            <form onSubmit={handleFileSearch} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search filenames or folders (e.g., report, architecture)..."
                data-testid="file-search-input"
                className="flex-1 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400/50"
              />
              <button
                type="submit"
                disabled={searching}
                data-testid="file-search-btn"
                className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-medium cursor-pointer"
              >
                {searching ? "Scanning..." : "Search"}
              </button>
            </form>

            {searchRoots.length > 0 && (
              <div className="text-[10px] font-mono text-slate-500 truncate">
                Roots: {searchRoots.join(" | ")}
              </div>
            )}

            <div className="max-h-44 overflow-y-auto space-y-1 pr-1" data-testid="file-search-results">
              {searchResults.map((m) => (
                <div
                  key={m.path}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {m.type === "folder" ? (
                      <Folder className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-slate-100 font-medium truncate">{m.name}</div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">{m.path}</div>
                    </div>
                  </div>
                  {m.size !== null && (
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {(m.size / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Security Audit Trail */}
      <section className="hud-panel rounded-xl p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-display font-semibold text-cyan-100">
              SECURITY AUDIT LOG
            </h3>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-200 cursor-pointer"
          >
            Refresh
          </button>
        </div>

        <div className="max-h-52 overflow-y-auto divide-y divide-slate-800/80 text-xs">
          {auditLogs.length === 0 ? (
            <div className="text-slate-500 py-3">No desktop control events recorded yet.</div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-cyan-300">{log.tool_name}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-slate-200 truncate">{log.target}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                  <span
                    className={`px-2 py-0.5 rounded ${
                      log.decision.includes("rejected")
                        ? "bg-rose-500/20 text-rose-300"
                        : log.decision.includes("pending")
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {log.decision}
                  </span>
                  <span className="text-slate-500">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
