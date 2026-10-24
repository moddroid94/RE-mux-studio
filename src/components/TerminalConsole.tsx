import {
  ArrowDown,
  Check,
  Copy,
  Download,
  Filter,
  Search,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { DownloadJob } from '../types/stream';

interface TerminalConsoleProps {
  job: DownloadJob | null;
  onClose: () => void;
}

export const TerminalConsole: React.FC<TerminalConsoleProps> = ({
  job,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const lastLogId = job?.logs[job.logs.length - 1]?.id;

  // Auto-scroll to bottom of terminal output as new log lines arrive
  useEffect(() => {
    if (logContainerRef.current && !userScrolledUp) {
      const el = logContainerRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [job?.logs, lastLogId, searchQuery, levelFilter, userScrolledUp]);

  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
      const isBottom = scrollHeight - scrollTop - clientHeight < 30;
      setUserScrolledUp(!isBottom);
    }
  };

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      setUserScrolledUp(false);
    }
  };

  if (!job) return null;

  const filteredLogs = job.logs.filter((log) => {
    const matchesQuery = log.message
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    return matchesQuery && matchesLevel;
  });

  const handleCopyLogs = () => {
    const text = job.logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogFile = () => {
    const text = job.logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remux_${job.id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Terminal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-xs font-mono font-bold text-slate-300 ml-2 flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-cyan-400" />
              N_m3u8DL-RE Execution Output Log ({job.id})
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" title="Live Terminal Feed Active" />
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLogs}
              className="p-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Copy All Logs"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleDownloadLogFile}
              className="p-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Download Log File"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export .log</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-3 bg-slate-900 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter terminal output..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none"
            >
              <option value="all">All Levels</option>
              <option value="info">INFO</option>
              <option value="muxer">FFMPEG MUXER</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
            </select>
          </div>
        </div>

        {/* Main Log Lines Terminal Output */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            className="h-full bg-slate-950 p-6 font-mono text-xs overflow-y-auto space-y-1.5 selection:bg-cyan-500 selection:text-slate-950 leading-relaxed"
          >
            {filteredLogs.length === 0 ? (
              <p className="text-slate-600 italic">No log lines matching current filter.</p>
            ) : (
              filteredLogs.map((log) => {
                let colorClass = 'text-slate-300';
                if (log.level === 'error') colorClass = 'text-red-400 font-bold';
                else if (log.level === 'warn') colorClass = 'text-amber-300';
                else if (log.level === 'muxer') colorClass = 'text-purple-400 font-semibold';
                else if (log.level === 'info') colorClass = 'text-cyan-300';

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 hover:bg-slate-900/50 p-0.5 rounded"
                  >
                    <span className="text-slate-600 shrink-0 select-none">
                      [{log.timestamp}]
                    </span>
                    <span
                      className={`uppercase font-bold shrink-0 text-[10px] px-1 rounded ${
                        log.level === 'error'
                          ? 'bg-red-500/20 text-red-400'
                          : log.level === 'warn'
                          ? 'bg-amber-500/20 text-amber-300'
                          : log.level === 'muxer'
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-cyan-500/20 text-cyan-300'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className={`${colorClass} break-all`}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>

          {userScrolledUp && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 right-6 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-full shadow-lg flex items-center gap-1.5 animate-bounce transition-all"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Scroll to Bottom</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
