import React, { useEffect, useState } from 'react';
import { CommandBuilder } from './components/CommandBuilder';
import { DownloadManager } from './components/DownloadManager';
import { Navbar } from './components/Navbar';
import { PresetsAndHistory } from './components/PresetsAndHistory';
import { StreamAnalyzer } from './components/StreamAnalyzer';
import { StreamPlayer } from './components/StreamPlayer';
import { TerminalConsole } from './components/TerminalConsole';
import {
  CommandConfig,
  DownloadJob,
  ManifestAnalysis,
  Preset,
  StreamSelections,
} from './types/stream';
import {
  buildDownloadJobPlan,
} from './utils/commandGenerator';
import {
  getSavedSelectedPresetId,
  loadSavedCommandConfig,
  loadSavedPresets,
  saveCommandConfig,
  savePresets,
  saveSelectedPresetId,
} from './utils/presetStorage';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'analyzer' | 'player' | 'builder' | 'queue' | 'history'
  >('analyzer');

  const [streamUrl, setStreamUrl] = useState<string>('');
  const [analysis, setAnalysis] = useState<ManifestAnalysis | null>(null);

  // Persistent Presets State
  const [presets, setPresets] = useState<Preset[]>(() => loadSavedPresets());
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() =>
    getSavedSelectedPresetId(loadSavedPresets())
  );

  // Persistent Command Configuration State
  const [commandConfig, setCommandConfig] = useState<CommandConfig>(() =>
    loadSavedCommandConfig()
  );

  // Stream Selections state
  const [selections, setSelections] = useState<StreamSelections>({
    selectedVideoId: 'best',
    selectedAudioIds: [],
    selectedSubtitleIds: [],
    autoBestVideo: true,
    autoAllAudio: true,
    autoAllSubtitles: true,
  });

  // Active Jobs and Active Log Modal Job ID
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [activeLogsJobId, setActiveLogsJobId] = useState<string | null>(null);

  // Derive active modal job from jobs array
  const activeLogsJob = jobs.find((j) => j.id === activeLogsJobId) || null;

  // Active preset object
  const activePreset =
    presets.find((p) => p.id === selectedPresetId) || presets[0];

  // Helper to update command config and persist to localStorage
  const handleUpdateCommandConfig: React.Dispatch<
    React.SetStateAction<CommandConfig>
  > = (action) => {
    setCommandConfig((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      saveCommandConfig(next);
      return next;
    });
  };

  // Select Preset Handler (syncs config, selections, and localStorage)
  const handleSelectPreset = (presetId: string) => {
    const target = presets.find((p) => p.id === presetId);
    if (!target) return;

    setSelectedPresetId(presetId);
    saveSelectedPresetId(presetId);

    if (target.config) {
      setCommandConfig((prev) => {
        const next = { ...prev, ...target.config };
        saveCommandConfig(next);
        return next;
      });
    }

    if (target.selections) {
      setSelections((prev) => ({
        ...prev,
        ...target.selections,
      }));
    }
  };

  // Save Preset Handler (create or update)
  const handleSavePreset = (presetToSave: Preset) => {
    setPresets((prev) => {
      const exists = prev.some((p) => p.id === presetToSave.id);
      const updated = exists
        ? prev.map((p) => (p.id === presetToSave.id ? presetToSave : p))
        : [presetToSave, ...prev];
      savePresets(updated);
      return updated;
    });

    handleSelectPreset(presetToSave.id);
  };

  // Delete Preset Handler
  const handleDeletePreset = (presetId: string) => {
    setPresets((prev) => {
      const updated = prev.filter((p) => p.id !== presetId);
      savePresets(updated);
      if (selectedPresetId === presetId && updated.length > 0) {
        handleSelectPreset(updated[0].id);
      }
      return updated;
    });
  };

  // Stable Single EventSource SSE Stream for all active jobs
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let fallbackPoll: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/download/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.jobs) {
            setJobs(data.jobs);
          }
        } catch (err) {
          console.error('[SSE Error] Data parse failed:', err);
        }
      };

      eventSource.onerror = () => {
        console.warn('[SSE Connection] Connection lost or reconnecting...');
        eventSource?.close();
      };
    };

    connectSSE();

    // Fallback polling backup if SSE connection drops
    fallbackPoll = setInterval(async () => {
      if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
        try {
          const res = await fetch('/api/download/jobs');
          if (res.ok) {
            const data = await res.json();
            if (data.jobs) setJobs(data.jobs);
          }
        } catch (e) {}
      }
    }, 2000);

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackPoll) clearInterval(fallbackPoll);
    };
  }, []);

  // Launch Download Runner Task (supports optional explicit edited command from Command Editor)
  const handleStartDownload = async (customCommand?: string) => {
    if (!analysis) return;

    const plan = buildDownloadJobPlan({
      url: analysis.url,
      title: analysis.title,
      analysis,
      selections,
      config: commandConfig,
      explicitCommand: customCommand,
    });

    try {
      const res = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });

      const data = await res.json();
      if (data.success && data.job) {
        setJobs((prev) => [data.job, ...prev]);
        setActiveTab('queue');
      }
    } catch (err) {
      console.error('Failed to start download job:', err);
    }
  };

  // Job Control (Pause / Resume / Cancel)
  const handleControlJob = async (
    jobId: string,
    action: 'pause' | 'resume' | 'cancel'
  ) => {
    try {
      const res = await fetch('/api/download/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, action }),
      });
      const data = await res.json();
      if (data.success && data.job) {
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? data.job : j))
        );
      }
    } catch (err) {
      console.error('Job control failed:', err);
    }
  };

  // Delete Job and Output File from Disk
  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/download/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (data.success) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      }
    } catch (err) {
      console.error('Job deletion failed:', err);
    }
  };

  const activeJobCount = jobs.filter(
    (j) => j.status.includes('downloading') || j.status === 'muxing'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeJobCount={activeJobCount}
        onNewStreamClick={() => setActiveTab('analyzer')}
      />

      {/* Main Container Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'analyzer' && (
          <StreamAnalyzer
            streamUrl={streamUrl}
            setStreamUrl={setStreamUrl}
            analysis={analysis}
            setAnalysis={setAnalysis}
            selections={selections}
            setSelections={setSelections}
            commandConfig={commandConfig}
            setCommandConfig={handleUpdateCommandConfig}
            presets={presets}
            selectedPresetId={selectedPresetId}
            onSelectPreset={handleSelectPreset}
            onStartDownload={() => handleStartDownload()}
            onPreviewInPlayer={() => setActiveTab('player')}
            onGoToBuilder={() => setActiveTab('builder')}
            onGoToPresets={() => setActiveTab('history')}
          />
        )}

        {activeTab === 'player' && (
          <StreamPlayer
            streamUrl={streamUrl}
            analysis={analysis}
            selections={selections}
            onStartDownload={() => handleStartDownload()}
          />
        )}

        {activeTab === 'builder' && (
          <CommandBuilder
            analysis={analysis}
            selections={selections}
            commandConfig={commandConfig}
            activePresetName={activePreset?.name}
            onStartDownload={(cmd) => handleStartDownload(cmd)}
            onGoToPresets={() => setActiveTab('history')}
          />
        )}

        {activeTab === 'queue' && (
          <DownloadManager
            jobs={jobs}
            onControlJob={handleControlJob}
            onDeleteJob={handleDeleteJob}
            onOpenLogs={(job) => setActiveLogsJobId(job.id)}
            onNewStreamClick={() => setActiveTab('analyzer')}
          />
        )}

        {activeTab === 'history' && (
          <PresetsAndHistory
            commandConfig={commandConfig}
            setCommandConfig={handleUpdateCommandConfig}
            presets={presets}
            selectedPresetId={selectedPresetId}
            onSelectPreset={handleSelectPreset}
            onSavePreset={handleSavePreset}
            onDeletePreset={handleDeletePreset}
            jobs={jobs}
          />
        )}
      </main>

      {/* Terminal Output Modal Console */}
      <TerminalConsole
        job={activeLogsJob}
        onClose={() => setActiveLogsJobId(null)}
      />

      {/* Clean Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 px-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>RE-Mux Studio · Stream Downloader & Muxer GUI for N_m3u8DL-RE and FFmpeg</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Real-time SSE Active</span>
            <span>·</span>
            <span>Multi-Audio Remux</span>
            <span>·</span>
            <span>VTT / TTML Subtitles</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
