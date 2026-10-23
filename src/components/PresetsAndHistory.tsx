import React, { useState } from 'react';
import {
  Bookmark,
  Plus,
  Play,
  Trash2,
  Check,
  History,
  Sparkles,
  Layers,
  Settings2,
} from 'lucide-react';
import { CommandConfig, DownloadJob, Preset } from '../types/stream';

interface PresetsAndHistoryProps {
  commandConfig: CommandConfig;
  setCommandConfig: React.Dispatch<React.SetStateAction<CommandConfig>>;
  jobs: DownloadJob[];
  onLoadPreset: (preset: Preset) => void;
}

const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'preset_multi_audio_mkv',
    name: 'Anime & Movie Multi-Audio Muxer',
    description: 'Downloads best video, ALL audio language tracks, and ALL subtitles, muxing into MKV via FFmpeg.',
    config: {
      muxer: 'ffmpeg',
      containerFormat: 'mkv',
      threadCount: 12,
      concurrentDownload: 6,
      checkSegmentsCount: true,
      autoSelect: true,
    },
    selections: {
      autoBestVideo: true,
      autoAllAudio: true,
      autoAllSubtitles: true,
    },
  },
  {
    id: 'preset_fast_mobile_720p',
    name: 'Fast 720p Single-Track MP4',
    description: 'Selects 720p video level with default audio track for fast lightweight streaming on mobile.',
    config: {
      muxer: 'ffmpeg',
      containerFormat: 'mp4',
      threadCount: 8,
      concurrentDownload: 4,
      customFfmpegFlags: '-c:v copy -c:a aac',
    },
    selections: {
      autoBestVideo: false,
      autoAllAudio: false,
      autoAllSubtitles: false,
    },
  },
  {
    id: 'preset_archival_4k',
    name: '4K Ultra Archival (--key & Shaka Support)',
    description: 'Highest bitrate video, lossless audio stream capture, 16 threads, and intermediate TS segment logging.',
    config: {
      muxer: 'ffmpeg',
      containerFormat: 'mkv',
      threadCount: 16,
      concurrentDownload: 8,
      keepTsFiles: false,
      checkSegmentsCount: true,
    },
    selections: {
      autoBestVideo: true,
      autoAllAudio: true,
      autoAllSubtitles: true,
    },
  },
];

export const PresetsAndHistory: React.FC<PresetsAndHistoryProps> = ({
  commandConfig,
  setCommandConfig,
  jobs,
  onLoadPreset,
}) => {
  const [customPresets, setCustomPresets] = useState<Preset[]>(BUILTIN_PRESETS);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

  const handleApplyPreset = (preset: Preset) => {
    onLoadPreset(preset);
    setAppliedPresetId(preset.id);
    setTimeout(() => setAppliedPresetId(null), 2000);
  };

  const handleSaveCurrentAsPreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: Preset = {
      id: 'preset_' + Date.now(),
      name: newPresetName,
      description: newPresetDesc || 'Custom user configuration preset',
      config: { ...commandConfig },
    };

    setCustomPresets((prev) => [newPreset, ...prev]);
    setNewPresetName('');
    setNewPresetDesc('');
  };

  const handleDeletePreset = (presetId: string) => {
    setCustomPresets((prev) => prev.filter((p) => p.id !== presetId));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Presets Manager Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bookmark className="w-5 h-5 text-purple-400" />
              N_m3u8DL-RE Command Presets
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Save reusable combinations of threads, muxers, container formats, and multi-track rules.
            </p>
          </div>
        </div>

        {/* Presets Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {customPresets.map((preset) => (
            <div
              key={preset.id}
              className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between gap-4 hover:border-slate-700 transition-all group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Preset
                  </span>
                  {!BUILTIN_PRESETS.some((b) => b.id === preset.id) && (
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <h3 className="text-sm font-bold text-white">{preset.name}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{preset.description}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-500">
                  {preset.config.muxer?.toUpperCase()} · {preset.config.containerFormat?.toUpperCase()}
                </span>
                <button
                  onClick={() => handleApplyPreset(preset)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    appliedPresetId === preset.id
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  }`}
                >
                  {appliedPresetId === preset.id ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Applied!
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> Apply Preset
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Save Current Configuration Form */}
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
              placeholder="Preset Description..."
              value={newPresetDesc}
              onChange={(e) => setNewPresetDesc(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleSaveCurrentAsPreset}
              disabled={!newPresetName.trim()}
              className="px-5 py-2 font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-xl transition-all"
            >
              Save Preset
            </button>
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
                  <th className="py-3 px-4">Segments</th>
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
                    <td className="py-3 px-4 text-slate-300">{j.totalSegments} segs</td>
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
