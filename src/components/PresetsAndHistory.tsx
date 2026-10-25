import {
  Bookmark,
  Check,
  Cpu,
  History,
  Layers,
  Play,
  Plus,
  Save,
  Settings2,
  Shield,
  Sparkles,
  Trash2
} from 'lucide-react';
import React, { useState } from 'react';
import { CommandConfig, DownloadJob, Preset } from '../types/stream';

interface PresetsAndHistoryProps {
  commandConfig: CommandConfig;
  setCommandConfig: React.Dispatch<React.SetStateAction<CommandConfig>>;
  presets: Preset[];
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  onSavePreset: (preset: Preset) => void;
  onDeletePreset: (presetId: string) => void;
  jobs: DownloadJob[];
}

export const PresetsAndHistory: React.FC<PresetsAndHistoryProps> = ({
  commandConfig,
  setCommandConfig,
  presets,
  selectedPresetId,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
  jobs,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const activePreset = presets.find((p) => p.id === selectedPresetId) || presets[0];

  const handleCreateNewPreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: Preset = {
      id: 'preset_' + Date.now(),
      name: newPresetName.trim(),
      description: newPresetDesc.trim() || 'Custom user configuration preset',
      config: { ...commandConfig },
      selections: activePreset?.selections || {
        autoBestVideo: true,
        autoAllAudio: true,
        autoAllSubtitles: true,
      },
    };

    onSavePreset(newPreset);
    setNewPresetName('');
    setNewPresetDesc('');
    setSaveSuccessMsg(`Created preset "${newPreset.name}"!`);
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };

  const handleUpdateActivePreset = () => {
    if (!activePreset) return;
    const updated: Preset = {
      ...activePreset,
      config: { ...commandConfig },
    };
    onSavePreset(updated);
    setSaveSuccessMsg(`Updated settings for "${activePreset.name}"!`);
    setTimeout(() => setSaveSuccessMsg(null), 2500);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Presets Gallery Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-purple-400" />
              Presets & Settings Hub
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage reusable download configurations, container formats, and muxing settings. Presets and settings automatically persist in browser storage.
            </p>
          </div>

          {saveSuccessMsg && (
            <span className="px-3 py-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-400" />
              {saveSuccessMsg}
            </span>
          )}
        </div>

        {/* Presets Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {presets.map((preset) => {
            const isSelected = preset.id === selectedPresetId;

            return (
              <div
                key={preset.id}
                className={`bg-slate-950 border rounded-xl p-5 shadow-lg flex flex-col justify-between gap-4 transition-all group ${
                  isSelected
                    ? 'border-purple-500/80 ring-1 ring-purple-500/50 bg-slate-950'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold flex items-center gap-1 ${
                        isSelected ? 'text-purple-400' : 'text-slate-400'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {isSelected ? 'Active Preset' : 'Preset'}
                    </span>

                    {/* Only allow deleting custom user presets (ids starting with preset_16... or preset_) */}
                    {!preset.id.startsWith('preset_multi_audio') &&
                      !preset.id.startsWith('preset_fast_mobile') &&
                      !preset.id.startsWith('preset_archival_4k') &&
                      !preset.id.startsWith('preset_audio_only') && (
                        <button
                          onClick={() => onDeletePreset(preset.id)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete custom preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                    {preset.name}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                    {preset.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-500">
                    {preset.config.muxer?.toUpperCase()} · {preset.config.containerFormat?.toUpperCase()} ·{' '}
                    {preset.config.threadCount || 8}T
                  </span>

                  <button
                    onClick={() => onSelectPreset(preset.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-purple-500 text-slate-950 font-black cursor-default'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Selected
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Select
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Save Current Configuration as New Preset */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-cyan-400" /> Save Active Settings as New Preset
          </h4>
          <div className="flex flex-col sm:flex-row items-stretch gap-3 font-mono text-xs">
            <input
              type="text"
              placeholder="Preset Name (e.g. 4K Dual Audio Remuxer)"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              placeholder="Preset Description (optional)..."
              value={newPresetDesc}
              onChange={(e) => setNewPresetDesc(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleCreateNewPreset}
              disabled={!newPresetName.trim()}
              className="px-5 py-2 font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-xl transition-all whitespace-nowrap"
            >
              Save New Preset
            </button>
          </div>
        </div>
      </div>

      {/* Preset Settings & Configuration Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-cyan-400" />
              Active Preset Settings & Flags
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure parameters for the active preset ({activePreset?.name}). Changes are automatically saved to your browser.
            </p>
          </div>

          <button
            onClick={handleUpdateActivePreset}
            className="px-4 py-2 text-xs font-bold text-slate-950 bg-purple-400 hover:bg-purple-300 rounded-xl shadow-md transition-all flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Save className="w-4 h-4" />
            <span>Save to "{activePreset?.name}"</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs font-mono">
          {/* Group 1: Container & Muxer */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" /> Output & Container
            </h4>

            {/* Muxer Engine */}
            <div className="space-y-1.5">
              <label className="text-slate-400 block font-semibold">Muxer Engine</label>
              <select
                value={commandConfig.muxer}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    muxer: e.target.value as any,
                  }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="ffmpeg">FFmpeg (Recommended)</option>
                <option value="mkvmerge">mkvmerge (MKVToolNix)</option>
                <option value="none">None (Raw elementary streams)</option>
              </select>
            </div>

            {/* Container Format */}
            <div className="space-y-1.5">
              <label className="text-slate-400 block font-semibold">Container Format</label>
              <select
                value={commandConfig.containerFormat}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    containerFormat: e.target.value as any,
                  }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="mkv">MKV (.mkv) - Best for multi-audio & subtitles</option>
                <option value="mp4">MP4 (.mp4) - Universal web & mobile</option>
                <option value="m4a">M4A (.m4a) - Audio-only stream</option>
                <option value="ts">TS (.ts) - Transport Stream</option>
              </select>
            </div>

            {/* Save Name Template */}
            <div className="space-y-1.5">
              <label className="text-slate-400 block font-semibold">Save Name Format</label>
              <input
                type="text"
                value={commandConfig.outputName}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    outputName: e.target.value,
                  }))
                }
                placeholder="{title}"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Group 2: Download Performance & Threads */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-emerald-400" /> Performance & Threads
            </h4>

            {/* Thread Count */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-semibold">Thread Count</span>
                <span className="text-emerald-400 font-bold">{commandConfig.threadCount} threads</span>
              </div>
              <input
                type="range"
                min="1"
                max="32"
                step="1"
                value={commandConfig.threadCount}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    threadCount: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-emerald-400"
              />
            </div>

            {/* Concurrent Download */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-slate-400">
                <span className="font-semibold">Concurrent Segments</span>
                <span className="text-emerald-400 font-bold">{commandConfig.concurrentDownload} chunks</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                step="1"
                value={commandConfig.concurrentDownload}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    concurrentDownload: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full accent-emerald-400"
              />
            </div>

            {/* Max Speed */}
            <div className="space-y-1.5">
              <label className="text-slate-400 block font-semibold">Speed Limit (0 for unlimited)</label>
              <input
                type="text"
                value={commandConfig.maxSpeed}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    maxSpeed: e.target.value,
                  }))
                }
                placeholder="0 or 20M"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Group 3: Network & Integrity Flags */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-amber-400" /> Integrity & Toggles
            </h4>

            {/* Retry count */}
            <div className="space-y-1.5">
              <label className="text-slate-400 block font-semibold">Network Retry Count</label>
              <input
                type="number"
                min="1"
                max="15"
                value={commandConfig.retryCount}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    retryCount: parseInt(e.target.value, 10) || 3,
                  }))
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Checkboxes */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={commandConfig.checkSegmentsCount}
                  onChange={(e) =>
                    setCommandConfig((prev) => ({
                      ...prev,
                      checkSegmentsCount: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-0"
                />
                <span>Strict Segment Count Check</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={commandConfig.autoSelect}
                  onChange={(e) =>
                    setCommandConfig((prev) => ({
                      ...prev,
                      autoSelect: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-0"
                />
                <span>Auto Select Streams (--auto-select)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={commandConfig.keepTsFiles}
                  onChange={(e) =>
                    setCommandConfig((prev) => ({
                      ...prev,
                      keepTsFiles: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-900 text-amber-400 focus:ring-0"
                />
                <span>Keep TS Intermediate Chunks</span>
              </label>
            </div>
          </div>
        </div>

        {/* Group 4: Custom Flags Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono pt-2">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <label className="text-slate-300 block font-semibold">
              Custom CLI Flags (Appended to N_m3u8DL-RE)
            </label>
            <input
              type="text"
              placeholder="--no-log --write-meta-json"
              value={commandConfig.customRawFlags}
              onChange={(e) =>
                setCommandConfig((prev) => ({
                  ...prev,
                  customRawFlags: e.target.value,
                }))
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <label className="text-slate-300 block font-semibold">
              Custom FFmpeg Muxer Flags
            </label>
            <input
              type="text"
              placeholder="-c:v copy -c:a aac"
              value={commandConfig.customFfmpegFlags}
              onChange={(e) =>
                setCommandConfig((prev) => ({
                  ...prev,
                  customFfmpegFlags: e.target.value,
                }))
              }
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Download History Log Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <History className="w-4 h-4 text-cyan-400" />
          Stream Download History Log
        </h3>

        {jobs.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-slate-950 p-4 rounded-xl border border-slate-800">
            No past download tasks recorded in this session.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Task ID</th>
                  <th className="py-3 px-4">Stream Title</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Output File</th>
                  <th className="py-3 px-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                {jobs.map((j) => (
                  <tr key={j.id} className="text-slate-300 hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-cyan-400 font-bold">{j.id}</td>
                    <td className="py-3 px-4 text-white font-semibold">{j.title}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase ${
                          j.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : j.status === 'failed'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-cyan-500/20 text-cyan-400'
                        }`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-purple-300">{j.outputFile}</td>
                    <td className="py-3 px-4 text-slate-500">{j.createdAt.substring(11, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
