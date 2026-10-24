import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileVideo,
  Gauge,
  Layers,
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

                {/* Selections Summary */}
                <div className="text-xs font-mono text-slate-400 pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80">
                  <span>
                    Tracks: <strong className="text-cyan-300">{job.selectionsSummary.video}</strong> |{' '}
                    <strong className="text-emerald-300">{job.selectionsSummary.audio.length} Audio Tracks</strong> |{' '}
                    <strong className="text-purple-300">{job.selectionsSummary.subtitles.length} Subtitles</strong>
                  </span>
                  <span className="text-slate-500">Created: {job.createdAt.substring(11, 19)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
