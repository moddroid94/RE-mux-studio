import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  FileVideo,
  Gauge,
  Info,
  Layers,
  Link,
  Pause,
  Play,
  Sparkles,
  Terminal,
  XCircle
} from 'lucide-react';
import React, { useState } from 'react';
import { DownloadJob } from '../types/stream';

interface DownloadManagerProps {
  jobs: DownloadJob[];
  onControlJob: (jobId: string, action: 'pause' | 'resume' | 'cancel') => void;
  onOpenLogs: (job: DownloadJob) => void;
  onNewStreamClick: () => void;
}

export const DownloadManager: React.FC<DownloadManagerProps> = ({
  jobs,
  onControlJob,
  onOpenLogs,
  onNewStreamClick,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});
  const [copiedCommandId, setCopiedCommandId] = useState<string | null>(null);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);

  const toggleJobDetails = (id: string) => {
    setExpandedJobIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleCopyCommand = (id: string, cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCommandId(id);
    setTimeout(() => setCopiedCommandId(null), 2000);
  };

  const handleCopyUrl = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrlId(id);
    setTimeout(() => setCopiedUrlId(null), 2000);
  };

  const filteredJobs = jobs.filter((j) => {
    if (filterStatus === 'active')
      return j.status.includes('downloading') || j.status === 'muxing' || j.status === 'parsing';
    if (filterStatus === 'completed') return j.status === 'completed';
    if (filterStatus === 'failed') return j.status === 'failed';
    return true;
  });

  const activeCount = jobs.filter(
    (j) => j.status.includes('downloading') || j.status === 'muxing'
  ).length;

  const totalSpeedBps = jobs.reduce((sum, j) => sum + (j.currentSpeedBps || 0), 0);

  const formatSpeed = (bps: number) => {
    if (bps >= 1073741824) return `${(bps / 1073741824).toFixed(2)} GB/s`;
    if (bps >= 1048576) return `${(bps / 1048576).toFixed(2)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${bps} B/s`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 MB';
    if (bytes >= 1073741824) {
      const gb = bytes / 1073741824;
      return `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(2)} GB`;
    }
    if (bytes >= 1048576) {
      const mb = bytes / 1048576;
      return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatSeconds = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Dashboard Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Download className="w-5 h-5 text-cyan-400" />
              Download Task Runner & Queue
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time segment completion tracking, speed telemetry, and FFmpeg remuxing pipeline.
            </p>
          </div>

          <button
            onClick={onNewStreamClick}
            className="flex items-center gap-2 px-4 py-2.5 font-bold text-xs text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 transition-all whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            <span>+ Add New Stream Job</span>
          </button>
        </div>

        {/* Global Telemetry Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-800">
          <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Active Downloads
            </span>
            <div className="text-xl font-black text-white font-mono flex items-center gap-2">
              <span>{activeCount}</span>
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Aggregate Speed
            </span>
            <div className="text-xl font-black text-emerald-400 font-mono">
              {formatSpeed(totalSpeedBps)}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Tasks
            </span>
            <div className="text-xl font-black text-slate-200 font-mono">
              {jobs.length}
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Filter Queue
            </span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full text-xs font-bold bg-slate-900 border border-slate-700 text-slate-200 rounded-lg p-1 focus:outline-none"
            >
              <option value="all">All Tasks</option>
              <option value="active">Active Downloading</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed / Stopped</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task Queue Cards List */}
      {filteredJobs.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-600">
            <Download className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No active download tasks</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Analyze an HLS or DASH stream URL and click "Start Download" to launch a background runner.
            </p>
          </div>
          <button
            onClick={onNewStreamClick}
            className="px-5 py-2.5 font-bold text-xs text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all"
          >
            Analyze Stream Now
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const speedMb = (job.currentSpeedBps / (1024 * 1024)).toFixed(1);

            return (
              <div
                key={job.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 hover:border-slate-700/80 transition-all"
              >
                {/* Job Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {/* Status Badge */}
                      {job.status === 'completed' && (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </span>
                      )}
                      {job.status === 'failed' && (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/30 rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {job.error || 'Stopped'}
                        </span>
                      )}
                      {job.status === 'paused' && (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded flex items-center gap-1">
                          <Pause className="w-3 h-3" /> Paused
                        </span>
                      )}
                      {job.status === 'muxing' && (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded flex items-center gap-1 animate-pulse">
                          <Layers className="w-3 h-3" /> FFmpeg Muxing
                        </span>
                      )}
                      {job.status.includes('downloading') && (
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded flex items-center gap-1">
                          <Download className="w-3 h-3 animate-bounce" /> Downloading Segments
                        </span>
                      )}

                      <span className="text-xs font-mono text-slate-500">{job.id}</span>
                    </div>

                    <h3 className="text-base font-bold text-white">{job.title}</h3>
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center gap-2">
                    {job.status.includes('downloading') && (
                      <button
                        onClick={() => onControlJob(job.id, 'pause')}
                        className="px-3 py-1.5 text-xs font-bold text-amber-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5"
                      >
                        <Pause className="w-3.5 h-3.5" /> Pause
                      </button>
                    )}

                    {job.status === 'paused' && (
                      <button
                        onClick={() => onControlJob(job.id, 'resume')}
                        className="px-3 py-1.5 text-xs font-bold text-emerald-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5" /> Resume
                      </button>
                    )}

                    {(job.status.includes('downloading') || job.status === 'paused') && (
                      <button
                        onClick={() => onControlJob(job.id, 'cancel')}
                        className="px-3 py-1.5 text-xs font-bold text-red-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}

                    <button
                      onClick={() => onOpenLogs(job)}
                      className="px-3 py-1.5 text-xs font-bold text-cyan-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5"
                    >
                      <Terminal className="w-3.5 h-3.5" /> Terminal Logs
                    </button>

                    <button
                      onClick={() => toggleJobDetails(job.id)}
                      className={`px-3 py-1.5 text-xs font-bold border rounded-lg flex items-center gap-1.5 transition-colors ${
                        expandedJobIds[job.id]
                          ? 'text-cyan-300 bg-cyan-950/60 border-cyan-600/70'
                          : 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700'
                      }`}
                      title="Toggle detailed task info & command"
                    >
                      <Info className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Details</span>
                      {expandedJobIds[job.id] ? (
                        <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {job.status === 'completed' && (
                      <a
                        href={`/api/download/file/${encodeURIComponent(job.outputFile)}`}
                        download={job.outputFile}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-md flex items-center gap-1.5"
                      >
                        <FileVideo className="w-3.5 h-3.5" /> Download Muxed File
                      </a>
                    )}
                  </div>
                </div>

                {/* Segment Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300 font-bold">
                      Segment Progress: {job.currentSegment} / {job.totalSegments} segments
                    </span>
                    <span className="text-cyan-400 font-black">{job.progress}%</span>
                  </div>

                  <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        job.status === 'completed'
                          ? 'bg-emerald-400'
                          : job.status === 'failed'
                          ? 'bg-red-500'
                          : job.status === 'muxing'
                          ? 'bg-purple-400'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                </div>

                {/* Speed & Telemetry Stats Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono text-slate-300 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">CURRENT SPEED</span>
                      <strong className="text-emerald-400 font-bold">{formatSpeed(job.currentSpeedBps)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">ETA REMAINING</span>
                      <strong className="text-white">{formatSeconds(job.etaSeconds)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-blue-400" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">SIZE DOWNLOADED</span>
                      <strong className="text-white">
                        {formatBytes(job.downloadedBytes)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <div>
                      <span className="text-slate-500 block text-[10px]">OUTPUT FILE</span>
                      <strong className="text-purple-300 truncate block max-w-[120px]">
                        {job.outputFile}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Selections Summary Footer & Spoiler Toggle */}
                <div className="text-xs font-mono text-slate-400 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80">
                  <span>
                    Tracks: <strong className="text-cyan-300">{job.selectionsSummary.video}</strong> |{' '}
                    <strong className="text-emerald-300">{job.selectionsSummary.audio.length} Audio Tracks</strong> |{' '}
                    <strong className="text-purple-300">{job.selectionsSummary.subtitles.length} Subtitles</strong>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">Created: {job.createdAt.substring(11, 19)}</span>
                    <button
                      onClick={() => toggleJobDetails(job.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors py-0.5 px-2 rounded bg-slate-950 border border-slate-800 hover:border-slate-700"
                    >
                      <span>{expandedJobIds[job.id] ? 'Hide Info' : 'Show Info & Command'}</span>
                      {expandedJobIds[job.id] ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Details Spoiler Section */}
                {expandedJobIds[job.id] && (
                  <div className="pt-3 border-t border-slate-800 space-y-4 animate-in fade-in duration-150">
                    {/* Error Banner if task has failed */}
                    {job.error && (
                      <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-xl flex items-start gap-2.5 text-xs text-red-300 font-mono">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold block text-red-200">Error / Abort Details:</strong>
                          <span>{job.error}</span>
                        </div>
                      </div>
                    )}

                    {/* Source URL & Target File Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                      {/* Stream URL */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                            <Link className="w-3 h-3 text-cyan-400" /> Source Manifest URL
                          </span>
                          <button
                            onClick={() => handleCopyUrl(job.id, job.url)}
                            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors font-semibold"
                            title="Copy Manifest URL"
                          >
                            {copiedUrlId === job.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>{copiedUrlId === job.id ? 'Copied' : 'Copy URL'}</span>
                          </button>
                        </div>
                        <div className="text-slate-300 break-all select-all line-clamp-3 bg-slate-900/70 p-2 rounded-lg border border-slate-800/60 text-[11px]">
                          {job.url}
                        </div>
                      </div>

                      {/* Destination Target File */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                            <FileVideo className="w-3 h-3 text-purple-400" /> Output Target (.mp4 / .mkv)
                          </span>
                          <span className="text-[10px] text-slate-500">./downloads</span>
                        </div>
                        <div className="text-purple-300 font-bold break-all bg-slate-900/70 p-2 rounded-lg border border-slate-800/60 text-[11px]">
                          {job.outputFile}
                        </div>
                      </div>
                    </div>

                    {/* Stream Selections Detailed Breakdown */}
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-3 font-mono text-xs">
                      <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-cyan-400" /> Selected Stream Tracks Breakdown
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Video */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60 space-y-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">Video Resolution</span>
                          <span className="inline-block px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-bold text-[11px]">
                            {job.selectionsSummary.video || 'Best / Auto'}
                          </span>
                        </div>

                        {/* Audio */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60 space-y-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                            Audio Tracks ({job.selectionsSummary.audio.length})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {job.selectionsSummary.audio.length > 0 ? (
                              job.selectionsSummary.audio.map((aud, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
                                >
                                  {aud}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">All / Default audio</span>
                            )}
                          </div>
                        </div>

                        {/* Subtitles */}
                        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60 space-y-1.5">
                          <span className="text-[10px] text-slate-400 uppercase block font-semibold">
                            Subtitle Tracks ({job.selectionsSummary.subtitles.length})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {job.selectionsSummary.subtitles.length > 0 ? (
                              job.selectionsSummary.subtitles.map((sub, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[11px] font-semibold"
                                >
                                  {sub}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">None selected</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Executed CLI Command */}
                    {job.commandExecuted && (
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-2 font-mono text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-cyan-400" /> CLI Command Executed
                          </span>
                          <button
                            onClick={() => handleCopyCommand(job.id, job.commandExecuted)}
                            className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold transition-colors bg-slate-900 hover:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/80"
                            title="Copy Command to Clipboard"
                          >
                            {copiedCommandId === job.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedCommandId === job.id ? 'Copied' : 'Copy Command'}</span>
                          </button>
                        </div>
                        <div className="relative">
                          <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-cyan-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto selection:bg-cyan-500 selection:text-slate-950">
                            {job.commandExecuted}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Task Metadata & Timing Details */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 bg-slate-950/60 px-3.5 py-2.5 rounded-xl border border-slate-800/60">
                      <span>
                        Task ID: <strong className="text-slate-300 font-semibold">{job.id}</strong>
                      </span>
                      <span>
                        Status: <strong className="text-slate-300 font-semibold uppercase">{job.status}</strong>
                      </span>
                      <span>
                        Created: <strong className="text-slate-300 font-semibold">{job.createdAt}</strong>
                      </span>
                      <span>
                        Elapsed: <strong className="text-slate-300 font-semibold">{formatSeconds(job.elapsedSeconds)}</strong>
                      </span>
                      <span>
                        Segments: <strong className="text-slate-300 font-semibold">{job.currentSegment} / {job.totalSegments}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
