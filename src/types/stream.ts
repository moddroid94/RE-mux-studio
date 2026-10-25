export interface VideoTrack {
  id: string;
  resolution: string; // e.g., "1920x1080"
  width: number;
  height: number;
  bandwidth: number; // bps
  bitrateFormatted: string; // e.g., "4.8 Mbps"
  fps?: number;
  codec: string; // e.g., "avc1.64002a" or "h265"
  hdr?: 'HDR10' | 'Dolby Vision' | 'HLG' | 'SDR';
  groupId?: string;
  isDefault?: boolean;
}

export interface AudioTrack {
  id: string;
  language: string; // e.g., "en", "es", "ja"
  languageName: string; // e.g., "English", "Spanish", "Japanese"
  name: string; // e.g., "English 5.1 Surround"
  channels: string; // e.g., "5.1", "2.0 Stereo", "7.1 Atmos"
  codec: string; // e.g., "mp4a.40.2" or "eac3"
  bitrate: number; // bps
  bitrateFormatted: string; // e.g., "384 kbps"
  groupId: string;
  isDefault?: boolean;
  isAutoSelect?: boolean;
}

export interface SubtitleTrack {
  id: string;
  language: string; // e.g., "en"
  languageName: string; // e.g., "English"
  name: string; // e.g., "English [SDH]"
  format: 'vtt' | 'ttml' | 'srt' | 'ass';
  groupId: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface ManifestAnalysis {
  url: string;
  type: 'HLS (m3u8)' | 'DASH (mpd)' | 'MSS (ism)';
  title: string;
  durationSeconds?: number;
  durationFormatted?: string;
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  rawManifest?: string;
  headersUsed?: Record<string, string>;
  drmProtected?: boolean;
}

export interface StreamSelections {
  selectedVideoId: string | 'best' | 'worst';
  selectedAudioIds: string[]; // empty means all or default
  selectedSubtitleIds: string[]; // empty means none or selected
  autoBestVideo: boolean;
  autoAllAudio: boolean;
  autoAllSubtitles: boolean;
}

export interface DRMKey {
  kid: string;
  key: string;
}

export interface CustomHeader {
  id: string;
  key: string;
  value: string;
}

export interface CommandConfig {
  binaryPath: string; // e.g. "N_m3u8DL-RE" or "./bin/N_m3u8DL-RE"
  outputDir: string; // e.g. "./downloads"
  outputName: string; // e.g. "{title}_{res}_{lang}"
  muxer: 'ffmpeg' | 'mkvmerge' | 'none';
  containerFormat: 'mkv' | 'mp4' | 'ts' | 'm4a';
  threadCount: number; // e.g. 8 or 16
  concurrentDownload: number; // e.g. 5
  maxSpeed: string; // e.g. "20M" or "0"
  retryCount: number; // e.g. 5
  checkSegmentsCount: boolean;
  autoSelect: boolean;
  keepTsFiles: boolean;
  useShakaPackager: boolean;
  shakaPackagerPath: string;
  keys: DRMKey[];
  headers: CustomHeader[];
  proxy: string;
  customRawFlags: string;
  customFfmpegFlags: string;
}

export interface LogMessage {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'muxer';
  message: string;
}

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  status:
    | 'queued'
    | 'parsing'
    | 'downloading_video'
    | 'downloading_audio'
    | 'downloading_subtitles'
    | 'muxing'
    | 'completed'
    | 'failed'
    | 'paused';
  progress: number;
  lastTerminalLine?: string;
  terminalLines?: string[];
  currentSegment: number;
  totalSegments: number;
  currentSpeedBps: number;
  downloadedBytes: number;
  totalBytes: number;
  elapsedSeconds: number;
  etaSeconds: number;
  speedHistory: number[];
  commandExecuted: string;
  selectionsSummary: {
    video: string;
    audio: string[];
    subtitles: string[];
  };
  logs: LogMessage[];
  outputFile: string;
  error?: string;
  createdAt: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  config: Partial<CommandConfig>;
  selections?: Partial<StreamSelections>;
}
