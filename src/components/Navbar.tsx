import { Bookmark, Download, Film, Play, Plus, Terminal } from 'lucide-react';
import React from 'react';

interface NavbarProps {
  activeTab: 'analyzer' | 'player' | 'builder' | 'queue' | 'history';
  setActiveTab: (tab: 'analyzer' | 'player' | 'builder' | 'queue' | 'history') => void;
  activeJobCount: number;
  onNewStreamClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  activeJobCount,
  onNewStreamClick,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      {/* Zone 1: Single element brand wordmark */}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          setActiveTab('analyzer');
        }}
        className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2.5 hover:text-cyan-400 transition-colors"
      >
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-cyan-500/20">
          RE
        </span>
        <span>RE-Mux Studio</span>
      </a>

      {/* Zone 2: 5 single-line clean text nav links */}
      <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-300">
        <button
          onClick={() => setActiveTab('analyzer')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'analyzer'
              ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60'
              : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Film className="w-4 h-4 text-cyan-400" />
          <span>Stream Analyzer</span>
        </button>

        <button
          onClick={() => setActiveTab('player')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'player'
              ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60'
              : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Play className="w-4 h-4 text-emerald-400" />
          <span>Live Preview Player</span>
        </button>

        <button
          onClick={() => setActiveTab('builder')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'builder'
              ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60'
              : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Terminal className="w-4 h-4 text-amber-400" />
          <span>Command Editor</span>
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 relative ${
            activeTab === 'queue'
              ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60'
              : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Download className="w-4 h-4 text-blue-400" />
          <span>Download Queue</span>
          {activeJobCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-cyan-500 text-slate-950 font-mono text-[10px] font-bold rounded-full">
              {activeJobCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'history'
              ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/60'
              : 'hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Bookmark className="w-4 h-4 text-purple-400" />
          <span>Presets & Settings</span>
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onNewStreamClick}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg shadow-md shadow-cyan-500/20 active:scale-95 transition-all whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Analyze Stream</span>
        </button>
      </div>
    </header>
  );
};
