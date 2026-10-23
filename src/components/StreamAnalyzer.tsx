import React, { useState, useEffect } from 'react';
import {
  Film,
  Search,
  Key,
  ShieldAlert,
  CheckCircle2,
  Volume2,
  Subtitles,
  Sparkles,
  Play,
  Terminal,
  Download,
  Sliders,
  Plus,
  Trash2,
  Globe,
  Copy,
  Check,
  History,
  Info,
} from 'lucide-react';
import {
  CommandConfig,
  ManifestAnalysis,
  StreamSelections,
} from '../types/stream';
import {
  clearUrlHistory,
  getUrlHistory,
  saveUrlToHistory,
} from '../utils/sampleStreams';

interface StreamAnalyzerProps {
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  analysis: ManifestAnalysis | null;
  setAnalysis: (analysis: ManifestAnalysis | null) => void;
  selections: StreamSelections;
  setSelections: React.Dispatch<React.SetStateAction<StreamSelections>>;
  commandConfig: CommandConfig;
  setCommandConfig: React.Dispatch<React.SetStateAction<CommandConfig>>;
  onStartDownload: () => void;
  onPreviewInPlayer: () => void;
  onGoToBuilder: () => void;
}

export const StreamAnalyzer: React.FC<StreamAnalyzerProps> = ({
  streamUrl,
  setStreamUrl,
  analysis,
  setAnalysis,
  selections,
  setSelections,
  commandConfig,
  setCommandConfig,
  onStartDownload,
  onPreviewInPlayer,
  onGoToBuilder,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAdvancedHeaders, setShowAdvancedHeaders] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [historyUrls, setHistoryUrls] = useState<string[]>([]);
  const [systemStatus, setSystemStatus] = useState<{
    hasNm3u8dl: boolean;
    hasFfmpeg: boolean;
    isDocker: boolean;
  } | null>(null);

  useEffect(() => {
    setHistoryUrls(getUrlHistory());
    fetch('/api/system-status')
      .then((r) => r.json())
      .then((data) => setSystemStatus(data))
      .catch(() => {});
  }, []);

  const handleAnalyze = async (targetUrl?: string) => {
    const urlToProbe = targetUrl || streamUrl;
    if (!urlToProbe.trim()) return;

    saveUrlToHistory(urlToProbe);
    setHistoryUrls(getUrlHistory());

    setIsAnalyzing(true);
    try {
      const headersMap: Record<string, string> = {};
      commandConfig.headers.forEach((h) => {
        if (h.key && h.value) headersMap[h.key] = h.value;
      });

      const response = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToProbe,
          headers: headersMap,
        }),
      });

      const data = await response.json();
      if (data.success && data.analysis) {
        setAnalysis(data.analysis);

        const defaultVideo = data.analysis.videoTracks[0]?.id || 'best';
        const defaultAudios = data.analysis.audioTracks.map((a: any) => a.id);
        const defaultSubs = data.analysis.subtitleTracks.map((s: any) => s.id);

        setSelections({
          selectedVideoId: defaultVideo,
          selectedAudioIds: defaultAudios,
          selectedSubtitleIds: defaultSubs,
          autoBestVideo: true,
          autoAllAudio: true,
          autoAllSubtitles: true,
        });
      }
    } catch (err) {
      console.error('Probe failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePresetSelectAll = () => {
    if (!analysis) return;
    setSelections({
      selectedVideoId: analysis.videoTracks[0]?.id || 'best',
      selectedAudioIds: analysis.audioTracks.map((a) => a.id),
      selectedSubtitleIds: analysis.subtitleTracks.map((s) => s.id),
      autoBestVideo: true,
      autoAllAudio: true,
      autoAllSubtitles: true,
    });
  };

  const handlePresetAudioCollector = () => {
    if (!analysis) return;
    setSelections((prev) => ({
      ...prev,
      selectedAudioIds: analysis.audioTracks.map((a) => a.id),
      autoAllAudio: true,
    }));
  };

  const handlePresetSubtitlesArchival = () => {
    if (!analysis) return;
    setSelections((prev) => ({
      ...prev,
      selectedSubtitleIds: analysis.subtitleTracks.map((s) => s.id),
      autoAllSubtitles: true,
    }));
  };

  const handlePresetSingleTrack = () => {
    if (!analysis) return;
    const defaultAudio =
      analysis.audioTracks.find((a) => a.isDefault)?.id ||
      analysis.audioTracks[0]?.id;
    const defaultSub = analysis.subtitleTracks.find((s) => s.isDefault)?.id;
    setSelections({
      selectedVideoId: analysis.videoTracks[0]?.id || 'best',
      selectedAudioIds: defaultAudio ? [defaultAudio] : [],
      selectedSubtitleIds: defaultSub ? [defaultSub] : [],
      autoBestVideo: false,
      autoAllAudio: false,
      autoAllSubtitles: false,
    });
  };

  const toggleAudioTrack = (trackId: string) => {
    setSelections((prev) => {
      const exists = prev.selectedAudioIds.includes(trackId);
      const updated = exists
        ? prev.selectedAudioIds.filter((id) => id !== trackId)
        : [...prev.selectedAudioIds, trackId];
      return {
        ...prev,
        selectedAudioIds: updated,
        autoAllAudio: updated.length === analysis?.audioTracks.length,
      };
    });
  };

  const toggleSubtitleTrack = (trackId: string) => {
    setSelections((prev) => {
      const exists = prev.selectedSubtitleIds.includes(trackId);
      const updated = exists
        ? prev.selectedSubtitleIds.filter((id) => id !== trackId)
        : [...prev.selectedSubtitleIds, trackId];
      return {
        ...prev,
        selectedSubtitleIds: updated,
        autoAllSubtitles: updated.length === analysis?.subtitleTracks.length,
      };
    });
  };

  const addHeader = () => {
    setCommandConfig((prev) => ({
      ...prev,
      headers: [
        ...prev.headers,
        { id: 'h_' + Date.now(), key: 'User-Agent', value: '' },
      ],
    }));
  };

  const removeHeader = (id: string) => {
    setCommandConfig((prev) => ({
      ...prev,
      headers: prev.headers.filter((h) => h.id !== id),
    }));
  };

  const updateHeader = (id: string, field: 'key' | 'value', val: string) => {
    setCommandConfig((prev) => ({
      ...prev,
      headers: prev.headers.map((h) =>
        h.id === id ? { ...h, [field]: val } : h
      ),
    }));
  };

  const addDRMKey = () => {
    setCommandConfig((prev) => ({
      ...prev,
      keys: [...prev.keys, { kid: '', key: '' }],
    }));
  };

  const removeDRMKey = (index: number) => {
    setCommandConfig((prev) => ({
      ...prev,
      keys: prev.keys.filter((_, i) => i !== index),
    }));
  };

  const updateDRMKey = (index: number, field: 'kid' | 'key', val: string) => {
    setCommandConfig((prev) => ({
      ...prev,
      keys: prev.keys.map((k, i) => (i === index ? { ...k, [field]: val } : k)),
    }));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* System Status Banner */}
      {systemStatus && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 px-5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemStatus.hasNm3u8dl ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              N_m3u8DL-RE CLI:{' '}
              <strong className={systemStatus.hasNm3u8dl ? 'text-emerald-400' : 'text-amber-400'}>
                {systemStatus.hasNm3u8dl ? 'Available in PATH' : 'Container / Simulation Active'}
              </strong>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  systemStatus.hasFfmpeg ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              FFmpeg:{' '}
              <strong className={systemStatus.hasFfmpeg ? 'text-emerald-400' : 'text-amber-400'}>
                {systemStatus.hasFfmpeg ? 'Available' : 'Docker / Host Muxer'}
              </strong>
            </span>
          </div>

          <div className="text-slate-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Dockerized setup available with `docker-compose up`</span>
          </div>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-cyan-400" />
              Stream Manifest Probe & Analyzer
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste your HLS (.m3u8), DASH (.mpd), or MSS (.ism) manifest URL below.
            </p>
          </div>

          {/* History Selector Dropdown */}
          {historyUrls.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap flex items-center gap-1">
                <History className="w-3.5 h-3.5 text-cyan-400" /> Recent URLs:
              </span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    setStreamUrl(e.target.value);
                    handleAnalyze(e.target.value);
                  }
                }}
                className="px-3 py-1.5 text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors max-w-xs truncate"
              >
                <option value="">Select recent URL...</option>
                {historyUrls.map((u, idx) => (
                  <option key={idx} value={u}>
                    {u.length > 45 ? u.substring(0, 45) + '...' : u}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Main Search Input Form */}
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://example.com/live/master.m3u8 or .mpd URL..."
              className="w-full pl-10 pr-10 py-3 text-sm bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600"
            />
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            {streamUrl && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(streamUrl);
                  setCopiedUrl(true);
                  setTimeout(() => setCopiedUrl(false), 2000);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                title="Copy URL"
              >
                {copiedUrl ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          <button
            onClick={() => handleAnalyze()}
            disabled={isAnalyzing || !streamUrl.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 font-bold text-sm text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:hover:bg-cyan-400 rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 transition-all whitespace-nowrap"
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Parsing Manifest...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Analyze Stream</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowAdvancedHeaders(!showAdvancedHeaders)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold rounded-xl border transition-all ${
              showAdvancedHeaders
                ? 'bg-slate-800 text-cyan-400 border-cyan-500/50'
                : 'bg-slate-950 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Headers & DRM</span>
          </button>
        </div>

        {/* Advanced Headers & DRM Drawer */}
        {showAdvancedHeaders && (
          <div className="pt-4 border-t border-slate-800 space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Custom HTTP Headers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    Custom HTTP Request Headers
                  </span>
                  <button
                    onClick={addHeader}
                    className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3 h-3" /> Add Header
                  </button>
                </div>

                {commandConfig.headers.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-950/50 p-3 rounded-lg border border-slate-800/80">
                    No custom headers added. Standard User-Agent will be used.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {commandConfig.headers.map((h) => (
                      <div key={h.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Header Name (e.g. Referer)"
                          value={h.key}
                          onChange={(e) =>
                            updateHeader(h.id, 'key', e.target.value)
                          }
                          className="w-1/3 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <input
                          type="text"
                          placeholder="Header Value"
                          value={h.value}
                          onChange={(e) =>
                            updateHeader(h.id, 'value', e.target.value)
                          }
                          className="flex-1 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          onClick={() => removeHeader(h.id)}
                          className="p-1 text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* DRM Decryption Keys (--key) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    DRM Decryption Keys (--key KID:KEY)
                  </span>
                  <button
                    onClick={addDRMKey}
                    className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3 h-3" /> Add Key
                  </button>
                </div>

                {commandConfig.keys.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-950/50 p-3 rounded-lg border border-slate-800/80">
                    No DRM keys specified. Clear Key / CENC streams do not require key input.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {commandConfig.keys.map((k, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="KID (Hex)"
                          value={k.kid}
                          onChange={(e) =>
                            updateDRMKey(idx, 'kid', e.target.value)
                          }
                          className="w-1/2 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                        <input
                          type="text"
                          placeholder="KEY (Hex)"
                          value={k.key}
                          onChange={(e) =>
                            updateDRMKey(idx, 'key', e.target.value)
                          }
                          className="w-1/2 px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={() => removeDRMKey(idx)}
                          className="p-1 text-slate-500 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Proxy Input */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                HTTP / SOCKS Proxy:
              </span>
              <input
                type="text"
                placeholder="http://127.0.0.1:7890 or socks5://proxy:1080"
                value={commandConfig.proxy}
                onChange={(e) =>
                  setCommandConfig((prev) => ({
                    ...prev,
                    proxy: e.target.value,
                  }))
                }
                className="flex-1 px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Manifest Analysis Summary & Track Matrices */}
      {analysis ? (
        <div className="space-y-6">
          {/* Stream Overview Header Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-md">
                    {analysis.type}
                  </span>
                  {analysis.drmProtected && (
                    <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-md flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> DRM Protected
                    </span>
                  )}
                  <span className="text-xs font-mono text-slate-400">
                    Duration: {analysis.durationFormatted || 'Live / VOD'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">{analysis.title}</h3>
              </div>

              {/* Quick Matrix Selection Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400 mr-1">
                  Track Presets:
                </span>
                <button
                  onClick={handlePresetSelectAll}
                  className="px-3 py-1.5 text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Select All Tracks
                </button>
                <button
                  onClick={handlePresetAudioCollector}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5" /> All Audio Languages
                </button>
                <button
                  onClick={handlePresetSubtitlesArchival}
                  className="px-3 py-1.5 text-xs font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Subtitles className="w-3.5 h-3.5" /> All Subtitles
                </button>
                <button
                  onClick={handlePresetSingleTrack}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors"
                >
                  Single Best Track
                </button>
              </div>
            </div>

            {/* Track Counts Summary Pill Matrix */}
            <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-800 text-xs font-mono text-slate-300">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                <span>Video Tracks:</span>
                <strong className="text-white">
                  {analysis.videoTracks.length}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span>Audio Tracks:</span>
                <strong className="text-white">
                  {analysis.audioTracks.length}
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                <span>Subtitle Tracks:</span>
                <strong className="text-white">
                  {analysis.subtitleTracks.length}
                </strong>
              </div>
            </div>
          </div>

          {/* Video Streams Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-cyan-400" />
                Video Streams Quality Selector
              </h4>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selections.autoBestVideo}
                  onChange={(e) =>
                    setSelections((prev) => ({
                      ...prev,
                      autoBestVideo: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500"
                />
                <span className="font-semibold">
                  Auto Select Best Video (--select-video for=best)
                </span>
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">Select</th>
                    <th className="py-3 px-4">Resolution</th>
                    <th className="py-3 px-4">Bitrate</th>
                    <th className="py-3 px-4">Codec</th>
                    <th className="py-3 px-4">FPS</th>
                    <th className="py-3 px-4">HDR / Dynamic Range</th>
                    <th className="py-3 px-4">Track ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                  {analysis.videoTracks.map((v) => {
                    const isSelected =
                      selections.autoBestVideo ||
                      selections.selectedVideoId === v.id;
                    return (
                      <tr
                        key={v.id}
                        onClick={() =>
                          setSelections((prev) => ({
                            ...prev,
                            selectedVideoId: v.id,
                            autoBestVideo: false,
                          }))
                        }
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-500/10 text-white font-semibold'
                            : 'text-slate-300 hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-3 px-4 text-center">
                          <input
                            type="radio"
                            name="video_select"
                            checked={isSelected}
                            onChange={() => {}}
                            className="text-cyan-500 bg-slate-950 border-slate-700 focus:ring-cyan-500"
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-cyan-300">
                          {v.resolution}
                          {v.isDefault && (
                            <span className="ml-2 px-1.5 py-0.2 text-[10px] bg-cyan-500/20 text-cyan-400 rounded">
                              DEFAULT
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          {v.bitrateFormatted}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{v.codec}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {v.fps ? `${v.fps} fps` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded font-bold ${
                              v.hdr === 'HDR10' || v.hdr === 'Dolby Vision'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {v.hdr || 'SDR'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{v.id}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audio Streams Multi-Select Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                Multi-Audio Stream Selection Matrix
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-emerald-400 font-mono font-semibold">
                  {selections.selectedAudioIds.length} of{' '}
                  {analysis.audioTracks.length} Audio Tracks Selected
                </span>
                <button
                  onClick={() =>
                    setSelections((prev) => ({
                      ...prev,
                      selectedAudioIds:
                        prev.selectedAudioIds.length ===
                        analysis.audioTracks.length
                          ? []
                          : analysis.audioTracks.map((a) => a.id),
                    }))
                  }
                  className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  Toggle All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 w-10 text-center">Select</th>
                    <th className="py-3 px-4">Language</th>
                    <th className="py-3 px-4">Track Name</th>
                    <th className="py-3 px-4">Channels</th>
                    <th className="py-3 px-4">Bitrate</th>
                    <th className="py-3 px-4">Codec</th>
                    <th className="py-3 px-4">Group ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                  {analysis.audioTracks.map((a) => {
                    const isSelected = selections.selectedAudioIds.includes(
                      a.id
                    );
                    return (
                      <tr
                        key={a.id}
                        onClick={() => toggleAudioTrack(a.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-500/10 text-white font-semibold'
                            : 'text-slate-300 hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-3 px-4 text-emerald-300 font-bold uppercase">
                          {a.language} ({a.languageName})
                        </td>
                        <td className="py-3 px-4 text-slate-200">
                          {a.name}
                          {a.isDefault && (
                            <span className="ml-2 px-1.5 py-0.2 text-[10px] bg-emerald-500/20 text-emerald-400 rounded">
                              DEFAULT
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-300 font-bold">
                          {a.channels}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {a.bitrateFormatted}
                        </td>
                        <td className="py-3 px-4 text-slate-400">{a.codec}</td>
                        <td className="py-3 px-4 text-slate-500">{a.groupId}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subtitle Streams Multi-Select Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Subtitles className="w-4 h-4 text-purple-400" />
                Subtitle Stream Selection Matrix
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-purple-400 font-mono font-semibold">
                  {selections.selectedSubtitleIds.length} of{' '}
                  {analysis.subtitleTracks.length} Subtitles Selected
                </span>
                <button
                  onClick={() =>
                    setSelections((prev) => ({
                      ...prev,
                      selectedSubtitleIds:
                        prev.selectedSubtitleIds.length ===
                        analysis.subtitleTracks.length
                          ? []
                          : analysis.subtitleTracks.map((s) => s.id),
                    }))
                  }
                  className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  Toggle All
                </button>
              </div>
            </div>

            {analysis.subtitleTracks.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-slate-950 p-4 rounded-xl border border-slate-800">
                No external subtitle tracks detected in this manifest.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 w-10 text-center">Select</th>
                      <th className="py-3 px-4">Language</th>
                      <th className="py-3 px-4">Track Name</th>
                      <th className="py-3 px-4">Format</th>
                      <th className="py-3 px-4">Flags</th>
                      <th className="py-3 px-4">Group ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                    {analysis.subtitleTracks.map((s) => {
                      const isSelected =
                        selections.selectedSubtitleIds.includes(s.id);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => toggleSubtitleTrack(s.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-purple-500/10 text-white font-semibold'
                              : 'text-slate-300 hover:bg-slate-800/50'
                          }`}
                        >
                          <td className="py-3 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-purple-500"
                            />
                          </td>
                          <td className="py-3 px-4 text-purple-300 font-bold uppercase">
                            {s.language} ({s.languageName})
                          </td>
                          <td className="py-3 px-4 text-slate-200">{s.name}</td>
                          <td className="py-3 px-4 uppercase text-slate-300 font-bold">
                            {s.format}
                          </td>
                          <td className="py-3 px-4 space-x-1">
                            {s.isDefault && (
                              <span className="px-1.5 py-0.2 text-[10px] bg-purple-500/20 text-purple-300 rounded">
                                DEFAULT
                              </span>
                            )}
                            {s.isForced && (
                              <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 rounded">
                                FORCED
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500">{s.groupId}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Persistent Action Footer Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-4 z-30">
            <div className="text-xs font-mono space-y-0.5">
              <div className="text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <strong className="text-white">Active Selection Payload:</strong>
              </div>
              <p className="text-slate-400">
                1 Video Track ({selections.autoBestVideo ? 'Auto Best' : selections.selectedVideoId}) ·{' '}
                <span className="text-emerald-400 font-bold">
                  {selections.selectedAudioIds.length} Audio Tracks
                </span>{' '}
                ·{' '}
                <span className="text-purple-400 font-bold">
                  {selections.selectedSubtitleIds.length} Subtitles
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <button
                onClick={onPreviewInPlayer}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
              >
                <Play className="w-4 h-4 text-emerald-400" />
                <span>Test in Player</span>
              </button>

              <button
                onClick={onGoToBuilder}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
              >
                <Terminal className="w-4 h-4 text-amber-400" />
                <span>Customize Flags</span>
              </button>

              <button
                onClick={onStartDownload}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Start Download & Mux Job</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-cyan-400">
            <Film className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Enter a Stream URL to Begin</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Paste an HLS (`.m3u8`), DASH (`.mpd`), or MSS (`.ism`) stream link above and click "Analyze Stream" to retrieve video, multi-audio, and subtitle tracks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
