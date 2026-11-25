import { useEffect, useState } from "react";
import {
  CheckSquare,
  Code2,
  FileCode,
  FolderGit2,
  FolderPlus,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import type { ProjectInspection, ProjectSummary } from "../types";

interface WorkspaceViewProps {
  onActionQueued: () => Promise<void>;
}

export function WorkspaceView({ onActionQueued }: WorkspaceViewProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<ProjectInspection | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    content: string;
    language: string;
    line_count: number;
  } | null>(null);

  const [newProjName, setNewProjName] = useState("");
  const [newProjPath, setNewProjPath] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [assistMode, setAssistMode] = useState<"summarize" | "debug" | "generate_code" | "generate_docs">("summarize");
  const [assistPrompt, setAssistPrompt] = useState("Summarize the architecture and key responsibilities of this file.");
  const [assistOutput, setAssistOutput] = useState("");
  const [assistRunning, setAssistRunning] = useState(false);
  const [saveRelPath, setSaveRelPath] = useState("GENERATED_DOC.md");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadProjects = async (selectFirst = false) => {
    const list = await api.listProjects();
    setProjects(list);
    if (selectFirst && list.length > 0 && !selectedId) {
      setSelectedId(list[0].id);
    }
  };

  const loadInspection = async (id: string) => {
    try {
      setErrorMsg(null);
      const data = await api.inspectProject(id);
      setInspection(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to inspect project");
    }
  };

  useEffect(() => {
    void loadProjects(true);
  }, []);

  useEffect(() => {
    if (selectedId) {
      setSelectedFile(null);
      void loadInspection(selectedId);
    }
  }, [selectedId]);

  const handlePickFolder = async () => {
    if (window.jarvisDesktop) {
      const chosen = await window.jarvisDesktop.pickFolder();
      if (chosen) {
        setNewProjPath(chosen);
        if (!newProjName) {
          const parts = chosen.split(/[\\/]/).filter(Boolean);
          setNewProjName(parts[parts.length - 1] || "Project");
        }
      }
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim() || !newProjPath.trim()) return;
    try {
      setErrorMsg(null);
      const created = await api.addProject(newProjName.trim(), newProjPath.trim());
      setNewProjName("");
      setNewProjPath("");
      setShowAddForm(false);
      await loadProjects();
      setSelectedId(created.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add project");
    }
  };

  const handleOpenFile = async (relPath: string) => {
    if (!selectedId) return;
    try {
      setErrorMsg(null);
      const f = await api.readProjectFile(selectedId, relPath);
      setSelectedFile(f);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Cannot read file");
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newTaskTitle.trim()) return;
    await api.createTask(selectedId, newTaskTitle.trim(), "medium");
    setNewTaskTitle("");
    await loadInspection(selectedId);
    await loadProjects();
  };

  const handleCycleTask = async (taskId: string, cur: "todo" | "in_progress" | "done") => {
    const next = cur === "todo" ? "in_progress" : cur === "in_progress" ? "done" : "todo";
    await api.updateTask(taskId, next);
    if (selectedId) await loadInspection(selectedId);
    await loadProjects();
  };

  const handleRunAssist = async () => {
    if (!assistPrompt.trim()) return;
    setAssistRunning(true);
    setErrorMsg(null);
    try {
      const res = await api.workspaceAssist({
        project_id: selectedId ?? undefined,
        relative_path: selectedFile?.path,
        mode: assistMode,
        prompt: assistPrompt.trim(),
      });
      setAssistOutput(res.output);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Assist failed");
    } finally {
      setAssistRunning(false);
    }
  };

  const handleProposeSave = async () => {
    if (!selectedId || !assistOutput.trim() || !saveRelPath.trim()) return;
    await api.proposeWrite(selectedId, saveRelPath.trim(), assistOutput);
    await onActionQueued();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3 h-full min-h-0">
      {/* Project List Sidebar */}
      <aside className="hud-panel rounded-xl p-3 flex flex-col min-h-0 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
            Projects ({projects.length})
          </span>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            data-testid="add-project-toggle"
            className="p-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
            title="Register project folder"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddProject} className="p-2.5 rounded-lg bg-slate-900/90 border border-cyan-500/25 space-y-2">
            <input
              type="text"
              value={newProjName}
              onChange={(e) => setNewProjName(e.target.value)}
              placeholder="Project Name"
              data-testid="project-name-input"
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 outline-none"
            />
            <div className="flex gap-1">
              <input
                type="text"
                value={newProjPath}
                onChange={(e) => setNewProjPath(e.target.value)}
                placeholder="Folder path (e.g., e:\my-app)"
                data-testid="project-path-input"
                className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100 outline-none"
              />
              {window.jarvisDesktop && (
                <button
                  type="button"
                  onClick={handlePickFolder}
                  className="px-2 rounded bg-slate-800 border border-slate-700 text-xs text-cyan-300 cursor-pointer"
                >
                  Browse
                </button>
              )}
            </div>
            <button
              type="submit"
              data-testid="project-submit-btn"
              className="w-full py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-medium cursor-pointer"
            >
              Register Project
            </button>
          </form>
        )}

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {projects.map((p) => {
            const active = p.id === selectedId;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`group p-2.5 rounded-lg border cursor-pointer transition ${
                  active
                    ? "bg-cyan-500/15 border-cyan-400/45"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-100 truncate">{p.name}</span>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.deleteProject(p.id);
                      if (selectedId === p.id) {
                        setSelectedId(null);
                        setInspection(null);
                      }
                      await loadProjects();
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{p.path}</div>
                <div className="mt-2 h-1 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{ width: `${p.progress_percent ?? 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-6">
              Add a local project directory to inspect files, track progress, and assist with code/docs.
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Area */}
      <section className="hud-panel rounded-xl p-4 overflow-y-auto space-y-4">
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-400/40 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {!inspection ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Select or register a project to open the Intelligent Workspace.
          </div>
        ) : (
          <>
            {/* Project Header & Stats */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/15 pb-3">
              <div>
                <h2 className="text-base font-display font-semibold text-cyan-100 flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-cyan-400" />
                  {inspection.project.name}
                </h2>
                <p className="text-xs font-mono text-slate-400">{inspection.project.path}</p>
              </div>
              {inspection.summary && (
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-cyan-200">
                    {inspection.summary.file_count} files ({inspection.summary.total_kb} KB)
                  </span>
                  {inspection.git?.is_repo && (
                    <span className="px-2.5 py-1 rounded bg-blue-500/15 border border-blue-400/35 text-blue-200">
                      git:{inspection.git.branch} ({inspection.git.changed_count} modified)
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-400/35 text-emerald-200">
                    Progress: {inspection.progress?.percent ?? 0}%
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {/* Project Progress Checklist */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-cyan-500/15 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Project Milestones
                  </span>
                  <span className="text-xs font-mono text-emerald-300">
                    {inspection.progress?.done ?? 0}/{inspection.progress?.total ?? 0} Done
                  </span>
                </div>

                <form onSubmit={handleAddTask} className="flex gap-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Add milestone or engineering task..."
                    data-testid="new-task-input"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 outline-none"
                  />
                  <button
                    type="submit"
                    data-testid="add-task-btn"
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </form>

                <div className="max-h-40 overflow-y-auto space-y-1">
                  {inspection.tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => handleCycleTask(t.id, t.status)}
                        className="flex items-center gap-2 text-left flex-1 cursor-pointer"
                        title="Click to cycle status (todo -> in_progress -> done)"
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] uppercase ${
                            t.status === "done"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : t.status === "in_progress"
                              ? "bg-cyan-500/20 text-cyan-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {t.status}
                        </span>
                        <span className={t.status === "done" ? "line-through text-slate-500" : "text-slate-200"}>
                          {t.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.deleteTask(t.id);
                          if (selectedId) await loadInspection(selectedId);
                        }}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Project Files Explorer */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-cyan-500/15 space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" /> Project Files
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {(inspection.files ?? []).map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => handleOpenFile(f.path)}
                      className={`w-full text-left flex items-center justify-between px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
                        selectedFile?.path === f.path
                          ? "bg-cyan-500/20 text-cyan-200"
                          : "hover:bg-slate-900 text-slate-300"
                      }`}
                    >
                      <span className="truncate">{f.path}</span>
                      <span className="text-[10px] text-slate-500 shrink-0 ml-2">{f.language}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected File Viewer & AI Code/Doc/Debug Workbench */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-cyan-500/15 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                    {selectedFile ? selectedFile.path : "Select a file above to inspect"}
                  </span>
                  {selectedFile && (
                    <span className="text-slate-500">
                      {selectedFile.language} · {selectedFile.line_count} lines
                    </span>
                  )}
                </div>
                <pre className="h-56 overflow-auto p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-200">
                  {selectedFile ? selectedFile.content : "// File preview appears here"}
                </pre>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/70 border border-cyan-500/15 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-cyan-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> AI Engineering Assistant
                  </span>
                  <select
                    value={assistMode}
                    onChange={(e) =>
                      setAssistMode(
                        e.target.value as "summarize" | "debug" | "generate_code" | "generate_docs"
                      )
                    }
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none"
                  >
                    <option value="summarize">Summarize Document / File</option>
                    <option value="debug">Debug Code</option>
                    <option value="generate_code">Generate Code</option>
                    <option value="generate_docs">Generate Documentation</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assistPrompt}
                    onChange={(e) => setAssistPrompt(e.target.value)}
                    placeholder="Describe what to analyze, debug, or generate..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    disabled={assistRunning}
                    onClick={handleRunAssist}
                    data-testid="workspace-assist-btn"
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-100 text-xs font-medium cursor-pointer"
                  >
                    {assistRunning ? "Running..." : "Run"}
                  </button>
                </div>

                <pre
                  data-testid="workspace-assist-output"
                  className="h-36 overflow-auto p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap"
                >
                  {assistOutput || "Output from file summarization, debugging, or code/doc generation appears here."}
                </pre>

                {assistOutput && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={saveRelPath}
                      onChange={(e) => setSaveRelPath(e.target.value)}
                      placeholder="Target relative path..."
                      className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-200 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleProposeSave}
                      className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" /> Propose Save (Confirm)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
