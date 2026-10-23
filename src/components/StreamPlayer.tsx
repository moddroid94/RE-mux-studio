import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Subtitles,
  Activity,
  Film,
  Sparkles,
  Download,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ManifestAnalysis, StreamSelections } from '../types/stream';

interface StreamPlayerProps {
  streamUrl: string;
  analysis: ManifestAnalysis | null;
  selections: StreamSelections;
  onStartDownload: () => void;
}

export const StreamPlayer: React.FC<StreamPlayerProps> = ({
  streamUrl,
  analysis,
  selections,
  onStartDownload,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // HLS stream metadata state
  const [levels, setLevels] = useState<{ id: number; name: string; height: number; bitrate: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = auto
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string; lang: string }[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(-1);
  const [subtitles, setSubtitles] = useState<{ id: number; name: string; lang: string }[]>([]);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1);

  // HUD Metrics
  const [hudBitrate, setHudBitrate] = useState<number>(0);
  const [hudBuffer, setHudBuffer] = useState<number>(0);
  const [isHlsSupported, setIsHlsSupported] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Initialize Hls.js
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    setPlayerError(null);

    // Proxy stream URL if needed to bypass CORS
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;

    if (Hls.isSupported()) {
      setIsHlsSupported(true);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsRef.current = hls;

      // Try proxying first or direct URL
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setDuration(video.duration || 0);

        // Quality levels
        const parsedLevels = data.levels.map((lvl, index) => ({
          id: index,
          name: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`,
          height: lvl.height || 0,
          bitrate: lvl.bitrate || 0,
        }));
        setLevels(parsedLevels);

        // Audio tracks
        const parsedAudio = hls.audioTracks.map((a, index) => ({
          id: index,
          name: a.name || a.lang || `Audio ${index + 1}`,
          lang: a.lang || 'und',
        }));
        setAudioTracks(parsedAudio);

        // Subtitles
        const parsedSubs = hls.subtitleTracks.map((s, index) => ({
          id: index,
          name: s.name || s.lang || `Sub ${index + 1}`,
          lang: s.lang || 'und',
        }));
        setSubtitles(parsedSubs);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const lvl = hls.levels[data.level];
        if (lvl) {
          setHudBitrate(lvl.bitrate);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // Try proxying if direct stream fails due to CORS
              console.warn('Network error, attempting CORS proxy stream...');
              hls.loadSource(proxyUrl);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setPlayerError(`HLS Playback Error: ${data.details}`);
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS support
      video.src = streamUrl;
    } else {
      setIsHlsSupported(false);
      setPlayerError('HLS is not supported in this browser.');
    }
  }, [streamUrl]);

  // Buffer calculation HUD loop
  useEffect(() => {
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (video && video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (
            video.buffered.start(i) <= video.currentTime &&
            video.currentTime <= video.buffered.end(i)
          ) {
            setHudBuffer(Math.max(0, video.buffered.end(i) - video.currentTime));
            break;
          }
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVol: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const changeQualityLevel = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
  };

  const changeAudioTrack = (trackIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.audioTrack = trackIndex;
    setCurrentAudioTrack(trackIndex);
  };

  const changeSubtitleTrack = (subIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.subtitleTrack = subIndex;
    setCurrentSubtitleTrack(subIndex);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Player Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-md uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Live HLS Player Preview
            </span>
            {analysis && (
              <span className="text-xs font-mono text-slate-400">
                {analysis.title}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-white">Interactive Stream Preview</h2>
          <p className="text-xs text-slate-400">
            Preview video resolutions, test multi-audio tracks, and check subtitle sync before initiating download.
          </p>
        </div>

        <button
          onClick={onStartDownload}
          className="flex items-center gap-2 px-5 py-2.5 font-bold text-xs text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl shadow-lg shadow-cyan-500/20 active:scale-95 transition-all whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span>Confirm & Start Download</span>
        </button>
      </div>

      {/* Main Video Screen & HUD Container */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative group">
        {/* Video Canvas Element */}
        <div className="relative aspect-video bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            onTimeUpdate={() => {
              if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) setDuration(videoRef.current.duration);
            }}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Telemetry HUD Overlay */}
          <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 text-[11px] font-mono space-y-1.5 shadow-2xl pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-800 pb-1">
              <Activity className="w-3.5 h-3.5" />
              <span>Stream Telemetry HUD</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-300">
              <span>Bitrate:</span>
              <strong className="text-white">
                {hudBitrate ? `${(hudBitrate / 1000000).toFixed(2)} Mbps` : 'Adaptive'}
              </strong>
              <span>Buffer Ahead:</span>
              <strong className="text-emerald-400">{hudBuffer.toFixed(1)}s</strong>
              <span>Audio Track:</span>
              <strong className="text-emerald-300">
                {audioTracks[currentAudioTrack]?.name || 'Default Track'}
              </strong>
              <span>Subtitle:</span>
              <strong className="text-purple-300">
                {currentSubtitleTrack === -1 ? 'Off' : subtitles[currentSubtitleTrack]?.name}
              </strong>
            </div>
          </div>

          {/* Play/Pause Center Indicator overlay when paused */}
          {!isPlaying && (
            <button
              onClick={togglePlay}
              className="absolute w-16 h-16 rounded-full bg-cyan-500/90 text-slate-950 flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform"
            >
              <Play className="w-8 h-8 fill-slate-950 ml-1" />
            </button>
          )}

          {/* Error Message banner */}
          {playerError && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-3">
              <AlertCircle className="w-12 h-12 text-red-400 animate-bounce" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Stream Playback Failed</h4>
                <p className="text-xs text-slate-400 max-w-md">{playerError}</p>
              </div>
              <button
                onClick={() => {
                  setPlayerError(null);
                  if (videoRef.current) videoRef.current.load();
                }}
                className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Stream
              </button>
            </div>
          )}
        </div>

        {/* Custom Video Controls Bar */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 space-y-3">
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = newTime;
                setCurrentTime(newTime);
              }}
              className="flex-1 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <span>{formatTime(duration)}</span>
          </div>

          {/* Player Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-2 text-white hover:text-cyan-400 transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-2 text-slate-300 hover:text-white"
                >
                  {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-slate-950 rounded appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>

            {/* Quality & Multi-Audio Selector Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Quality Levels Dropdown */}
              <div className="flex items-center gap-1.5 text-xs">
                <Film className="w-3.5 h-3.5 text-cyan-400" />
                <select
                  value={currentLevel}
                  onChange={(e) => changeQualityLevel(parseInt(e.target.value, 10))}
                  className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value={-1}>Auto Quality</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({(l.bitrate / 1000000).toFixed(1)} Mbps)
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-Audio Track Switcher */}
              <div className="flex items-center gap-1.5 text-xs">
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <select
                  value={currentAudioTrack}
                  onChange={(e) => changeAudioTrack(parseInt(e.target.value, 10))}
                  className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 font-mono"
                >
                  <option value={-1}>Default Audio</option>
                  {audioTracks.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} [{a.lang.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Subtitles Track Switcher */}
              <div className="flex items-center gap-1.5 text-xs">
                <Subtitles className="w-3.5 h-3.5 text-purple-400" />
                <select
                  value={currentSubtitleTrack}
                  onChange={(e) => changeSubtitleTrack(parseInt(e.target.value, 10))}
                  className="px-2.5 py-1 text-xs bg-slate-950 border border-slate-700 rounded-lg text-purple-300 font-bold focus:outline-none focus:border-purple-500 font-mono"
                >
                  <option value={-1}>Subtitles Off</option>
                  {subtitles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} [{s.lang.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={toggleFullscreen}
                className="p-2 text-slate-300 hover:text-white"
                title="Fullscreen"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
