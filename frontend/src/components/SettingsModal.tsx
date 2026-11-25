import { useEffect, useState } from "react";
import { KeyRound, MapPin, Save, Shield, X } from "lucide-react";
import { api } from "../api";
import type { ProviderStatus, SecretsStatus, SettingsData } from "../types";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function SettingsModal({ open, onClose, onUpdated }: SettingsModalProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [secrets, setSecrets] = useState<SecretsStatus>({});
  const [providers, setProviders] = useState<ProviderStatus | null>(null);

  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    Promise.all([api.getSettings(), api.getSecretsStatus(), api.getProvidersStatus()]).then(
      ([s, sec, prov]) => {
        setSettings(s);
        setCityQuery(s.weather_city);
        setSecrets(sec);
        setProviders(prov);
      }
    );
  }, [open]);

  if (!open || !settings) return null;

  const handleSaveSettings = async () => {
    await api.updateSettings(settings);
    const prov = await api.getProvidersStatus();
    setProviders(prov);
    setFeedback("Settings saved.");
    await onUpdated();
  };

  const handleSaveKey = async (keyName: string, value: string, clearInput: () => void) => {
    const updated = await api.setSecret(keyName, value);
    setSecrets(updated);
    clearInput();
    const prov = await api.getProvidersStatus();
    setProviders(prov);
    setFeedback(`Encrypted ${keyName} updated via Windows DPAPI.`);
    await onUpdated();
  };

  const handleSetCity = async () => {
    if (!cityQuery.trim()) return;
    try {
      const geo = await api.geocodeCity(cityQuery.trim());
      setSettings({
        ...settings,
        weather_city: geo.name,
        weather_lat: geo.latitude,
        weather_lon: geo.longitude,
      });
      setFeedback(`Weather location updated to ${geo.name}, ${geo.country}.`);
      await onUpdated();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "City lookup failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        data-testid="settings-modal"
        className="hud-panel rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-sky-500/20 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-sky-100">
              NEXUS-AI CONFIGURATION & KEY VAULT
            </h2>
            <p className="text-xs text-slate-400">
              AI providers, Windows DPAPI encrypted keys, weather location, voice, and system info
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {feedback && (
            <div className="p-2.5 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 font-mono">
              {feedback}
            </div>
          )}

          {/* AI Provider Selection */}
          <div className="space-y-2.5">
            <h3 className="font-mono uppercase tracking-wider text-cyan-300">AI Provider Hub</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-slate-400">Active Provider Mode</span>
                <select
                  value={settings.active_provider}
                  onChange={(e) => setSettings({ ...settings, active_provider: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 outline-none"
                >
                  <option value="auto">Auto (Configured Cloud → Local Ollama → Command Router)</option>
                  <option value="openai">OpenAI / Compatible</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="ollama">Ollama (Local LLM)</option>
                  <option value="local_router">Local Command Router Only</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">Resolved Active Engine</span>
                <div className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 font-mono text-cyan-300">
                  {providers?.active_provider ?? "—"}
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">OpenAI Model</span>
                <input
                  type="text"
                  value={settings.openai_model}
                  onChange={(e) => setSettings({ ...settings, openai_model: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">Gemini Model</span>
                <input
                  type="text"
                  value={settings.gemini_model}
                  onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">Ollama URL</span>
                <input
                  type="text"
                  value={settings.ollama_url}
                  onChange={(e) => setSettings({ ...settings, ollama_url: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-400">Ollama Model</span>
                <input
                  type="text"
                  value={settings.ollama_model}
                  onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                />
              </label>
            </div>
          </div>

          {/* Encrypted API Key Vault */}
          <div className="space-y-2.5 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4" /> Encrypted API Key Vault
              </h3>
              <span className="text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Windows DPAPI Protected
              </span>
            </div>

            {[
              {
                id: "openai_api_key",
                label: "OpenAI API Key",
                val: openaiKey,
                setVal: setOpenaiKey,
              },
              {
                id: "gemini_api_key",
                label: "Google Gemini API Key",
                val: geminiKey,
                setVal: setGeminiKey,
              },
              {
                id: "anthropic_api_key",
                label: "Anthropic API Key",
                val: anthropicKey,
                setVal: setAnthropicKey,
              },
            ].map((item) => {
              const info = secrets[item.id];
              return (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="w-44 shrink-0">
                    <div className="text-slate-200 font-medium">{item.label}</div>
                    <div className="font-mono text-[10px] text-slate-400">
                      {info?.configured ? `Stored: ${info.masked}` : "Not configured"}
                    </div>
                  </div>
                  <input
                    type="password"
                    value={item.val}
                    onChange={(e) => item.setVal(e.target.value)}
                    placeholder="Enter new key (or leave blank & Clear)"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveKey(item.id, item.val, () => item.setVal(""))}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 cursor-pointer"
                  >
                    {item.val.trim() ? "Encrypt & Save" : "Clear"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Weather & Voice Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
            <div className="space-y-2">
              <h3 className="font-mono uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> Weather Location
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="City name..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleSetCity}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-400/40 text-blue-200 cursor-pointer"
                >
                  Locate
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-mono uppercase tracking-wider text-cyan-300">Voice & Wake Phrase</h3>
              <div className="flex gap-2">
                <select
                  value={settings.voice_tts_engine}
                  onChange={(e) =>
                    setSettings({ ...settings, voice_tts_engine: e.target.value as "browser" | "sapi" })
                  }
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                >
                  <option value="browser">Browser SpeechSynthesis</option>
                  <option value="sapi">Windows SAPI Native</option>
                </select>
                <input
                  type="text"
                  value={settings.voice_wake_phrase}
                  onChange={(e) => setSettings({ ...settings, voice_wake_phrase: e.target.value })}
                  placeholder="Wake phrase (e.g. hey nexus)"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* About NEXUS-AI */}
          <div className="pt-3 border-t border-slate-800 space-y-1.5">
            <h3 className="font-mono uppercase tracking-wider text-sky-300">About NEXUS-AI</h3>
            <div className="p-3 rounded-lg bg-slate-950/75 border border-slate-800 text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="font-display font-semibold text-slate-100">NEXUS-AI Desktop Assistant v1.0.0</div>
                <div className="text-[11px] text-slate-400">
                  Local-first FastAPI + React + Electron intelligence platform with DPAPI key encryption and approval-gated desktop control.
                </div>
              </div>
              <span className="font-mono text-[10px] px-2 py-1 rounded bg-sky-500/15 border border-sky-400/30 text-sky-300 shrink-0">
                LOCAL-FIRST · ZERO-TRUST
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-cyan-500/20 flex justify-end gap-2 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSaveSettings}
            data-testid="save-settings-btn"
            className="px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" /> Save Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
