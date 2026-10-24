import { useEffect, useState } from 'react';
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
import { generateNm3u8dlCommand } from './utils/commandGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'analyzer' | 'player' | 'builder' | 'queue' | 'history'
  >('analyzer');

  const [streamUrl, setStreamUrl] = useState<string>('');
  const [analysis, setAnalysis] = useState<ManifestAnalysis | null>(null);

  // Selections state
  const [selections, setSelections] = useState<StreamSelections>({
    selectedVideoId: 'best',
    selectedAudioIds: [],
    selectedSubtitleIds: [],
    autoBestVideo: true,
    autoAllAudio: true,
    autoAllSubtitles: true,
  });

  // Command configuration state
  const [commandConfig, setCommandConfig] = useState<CommandConfig>({
    binaryPath: 'N_m3u8DL-RE',
    outputDir: './downloads',
    outputName: 'HLS_stream',
    muxer: 'ffmpeg',
    containerFormat: 'mp4',
    threadCount: 8,
    concurrentDownload: 5,
    maxSpeed: '0',
    retryCount: 3,
    checkSegmentsCount: false,
    autoSelect: false,
    keepTsFiles: false,
    useShakaPackager: false,
    shakaPackagerPath: '',
    keys: [],
    headers: [],
    proxy: '',
    customRawFlags: '',
    customFfmpegFlags: '',
  });

  // Active Jobs and Active Log Modal Job ID
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [activeLogsJobId, setActiveLogsJobId] = useState<string | null>(null);

  // Derive active modal job from jobs array
  const activeLogsJob = jobs.find((j) => j.id === activeLogsJobId) || null;

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
  }, []); // Empty dependency array -> Created ONCE on mount

  // Launch Download Runner Task
  const handleStartDownload = async () => {
    if (!analysis) return;

    const commandExecuted = generateNm3u8dlCommand(
      analysis,
      selections,
      commandConfig
    );

    const selectedAudioLangs = analysis.audioTracks
      .filter((a) => selections.selectedAudioIds.includes(a.id))
      .map((a) => `${a.language.toUpperCase()} (${a.channels})`);

    const selectedSubLangs = analysis.subtitleTracks
      .filter((s) => selections.selectedSubtitleIds.includes(s.id))
      .map((s) => s.language.toUpperCase());

    const videoName = selections.autoBestVideo
      ? 'Best Video (1080p+)'
      : analysis.videoTracks.find((v) => v.id === selections.selectedVideoId)
          ?.resolution || '1080p';

    try {
      const res = await fetch('/api/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: analysis.url,
          title: analysis.title,
          commandExecuted,
          commandConfig,
          selectionsSummary: {
            video: videoName,
            audio: selectedAudioLangs.length ? selectedAudioLangs : ['Default'],
            subtitles: selectedSubLangs.length ? selectedSubLangs : ['None'],
          },
        }),
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

  // Load Preset Handler
  const handleLoadPreset = (preset: Preset) => {
    if (preset.config) {
      setCommandConfig((prev) => ({
        ...prev,
        ...preset.config,
      }));
    }
    if (preset.selections && analysis) {
      setSelections((prev) => ({
        ...prev,
        ...preset.selections,
      }));
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
            setCommandConfig={setCommandConfig}
            onStartDownload={handleStartDownload}
            onPreviewInPlayer={() => setActiveTab('player')}
            onGoToBuilder={() => setActiveTab('builder')}
          />
        )}

        {activeTab === 'player' && (
          <StreamPlayer
            streamUrl={streamUrl}
            analysis={analysis}
            selections={selections}
            onStartDownload={handleStartDownload}
          />
        )}

        {activeTab === 'builder' && (
          <CommandBuilder
            analysis={analysis}
            selections={selections}
            commandConfig={commandConfig}
            setCommandConfig={setCommandConfig}
            onStartDownload={handleStartDownload}
          />
        )}

        {activeTab === 'queue' && (
          <DownloadManager
            jobs={jobs}
            onControlJob={handleControlJob}
            onOpenLogs={(job) => setActiveLogsJobId(job.id)}
            onNewStreamClick={() => setActiveTab('analyzer')}
          />
        )}

        {activeTab === 'history' && (
          <PresetsAndHistory
            commandConfig={commandConfig}
            setCommandConfig={setCommandConfig}
            jobs={jobs}
            onLoadPreset={handleLoadPreset}
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
