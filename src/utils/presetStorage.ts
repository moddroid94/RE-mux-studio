import { CommandConfig, Preset } from '../types/stream';
import { DEFAULT_COMMAND_CONFIG } from './commandGenerator';

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'preset_multi_audio_mkv',
    name: 'Anime & Movie Multi-Audio Muxer (MKV)',
    description:
      'Downloads best video, ALL audio language tracks, and ALL subtitles, muxing into MKV via FFmpeg.',
    config: {
      binaryPath: 'N_m3u8DL-RE',
      outputDir: './downloads',
      outputName: '{title}',
      muxer: 'ffmpeg',
      containerFormat: 'mkv',
      threadCount: 12,
      concurrentDownload: 6,
      maxSpeed: '0',
      retryCount: 3,
      checkSegmentsCount: true,
      autoSelect: true,
      keepTsFiles: false,
      useShakaPackager: false,
      shakaPackagerPath: '',
      keys: [],
      headers: [],
      proxy: '',
      customRawFlags: '',
      customFfmpegFlags: '',
    },
    selections: {
      selectedVideoId: 'best',
      selectedAudioIds: [],
      selectedSubtitleIds: [],
      autoBestVideo: true,
      autoAllAudio: true,
      autoAllSubtitles: true,
    },
  },
  {
    id: 'preset_fast_mobile_mp4',
    name: 'Fast Single-Track MP4 (Mobile / Web)',
    description:
      'Selects best video stream with default audio, remuxing directly into universally compatible MP4.',
    config: {
      binaryPath: 'N_m3u8DL-RE',
      outputDir: './downloads',
      outputName: '{title}',
      muxer: 'ffmpeg',
      containerFormat: 'mp4',
      threadCount: 8,
      concurrentDownload: 4,
      maxSpeed: '0',
      retryCount: 3,
      checkSegmentsCount: true,
      autoSelect: true,
      keepTsFiles: false,
      useShakaPackager: false,
      shakaPackagerPath: '',
      keys: [],
      headers: [],
      proxy: '',
      customRawFlags: '',
      customFfmpegFlags: '-c:v copy -c:a aac',
    },
    selections: {
      selectedVideoId: 'best',
      selectedAudioIds: [],
      selectedSubtitleIds: [],
      autoBestVideo: true,
      autoAllAudio: false,
      autoAllSubtitles: false,
    },
  },
  {
    id: 'preset_archival_4k_mkv',
    name: '4K Ultra Archival & High Bitrate (MKV)',
    description:
      'Highest quality stream capture with 16 download threads, integrity segment checks, and full multi-audio remux.',
    config: {
      binaryPath: 'N_m3u8DL-RE',
      outputDir: './downloads',
      outputName: '{title}',
      muxer: 'ffmpeg',
      containerFormat: 'mkv',
      threadCount: 16,
      concurrentDownload: 8,
      maxSpeed: '0',
      retryCount: 5,
      checkSegmentsCount: true,
      autoSelect: true,
      keepTsFiles: false,
      useShakaPackager: false,
      shakaPackagerPath: '',
      keys: [],
      headers: [],
      proxy: '',
      customRawFlags: '',
      customFfmpegFlags: '',
    },
    selections: {
      selectedVideoId: 'best',
      selectedAudioIds: [],
      selectedSubtitleIds: [],
      autoBestVideo: true,
      autoAllAudio: true,
      autoAllSubtitles: true,
    },
  },
  {
    id: 'preset_audio_only_m4a',
    name: 'Audio-Only Music / Podcast (M4A)',
    description:
      'Extracts all audio tracks and muxes directly to M4A without downloading heavy video segments.',
    config: {
      binaryPath: 'N_m3u8DL-RE',
      outputDir: './downloads',
      outputName: '{title}_audio',
      muxer: 'ffmpeg',
      containerFormat: 'm4a',
      threadCount: 8,
      concurrentDownload: 4,
      maxSpeed: '0',
      retryCount: 3,
      checkSegmentsCount: true,
      autoSelect: true,
      keepTsFiles: false,
      useShakaPackager: false,
      shakaPackagerPath: '',
      keys: [],
      headers: [],
      proxy: '',
      customRawFlags: '',
      customFfmpegFlags: '-c:a copy',
    },
    selections: {
      selectedVideoId: 'worst',
      selectedAudioIds: [],
      selectedSubtitleIds: [],
      autoBestVideo: false,
      autoAllAudio: true,
      autoAllSubtitles: false,
    },
  },
];

const STORAGE_KEY_PRESETS = 'remux_presets_v1';
const STORAGE_KEY_SELECTED_PRESET_ID = 'remux_selected_preset_id';
const STORAGE_KEY_CONFIG = 'remux_command_config_v1';

/**
 * Load all presets from browser localStorage. Defaults to BUILTIN_PRESETS.
 */
export function loadSavedPresets(): Preset[] {
  if (typeof window === 'undefined') return BUILTIN_PRESETS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRESETS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(BUILTIN_PRESETS));
      return BUILTIN_PRESETS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return BUILTIN_PRESETS;
  } catch (err) {
    console.warn('[Preset Storage] Failed to load presets from localStorage:', err);
    return BUILTIN_PRESETS;
  }
}

/**
 * Save all presets to browser localStorage.
 */
export function savePresets(presets: Preset[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
  } catch (err) {
    console.error('[Preset Storage] Failed to save presets to localStorage:', err);
  }
}

/**
 * Get currently selected preset ID from localStorage. Defaults to first builtin preset.
 */
export function getSavedSelectedPresetId(availablePresets: Preset[]): string {
  if (typeof window === 'undefined') return BUILTIN_PRESETS[0].id;
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SELECTED_PRESET_ID);
    if (saved && availablePresets.some((p) => p.id === saved)) {
      return saved;
    }
    return availablePresets[0]?.id || BUILTIN_PRESETS[0].id;
  } catch {
    return BUILTIN_PRESETS[0].id;
  }
}

/**
 * Save currently selected preset ID to localStorage.
 */
export function saveSelectedPresetId(presetId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SELECTED_PRESET_ID, presetId);
  } catch (err) {
    console.error('[Preset Storage] Failed to save selected preset ID:', err);
  }
}

/**
 * Load active CommandConfig from localStorage, merging with defaults.
 */
export function loadSavedCommandConfig(): CommandConfig {
  if (typeof window === 'undefined') return DEFAULT_COMMAND_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_COMMAND_CONFIG, ...parsed };
    }
    // Default to the first preset's config
    const defaultPreset = BUILTIN_PRESETS[0];
    const initialConfig = { ...DEFAULT_COMMAND_CONFIG, ...defaultPreset.config };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(initialConfig));
    return initialConfig;
  } catch {
    return DEFAULT_COMMAND_CONFIG;
  }
}

/**
 * Save active CommandConfig to localStorage.
 */
export function saveCommandConfig(config: CommandConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.error('[Preset Storage] Failed to save command config:', err);
  }
}
