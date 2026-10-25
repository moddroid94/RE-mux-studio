import {
  CommandConfig,
  CustomHeader,
  ManifestAnalysis,
  StreamSelections,
} from '../types/stream';

export const DEFAULT_COMMAND_CONFIG: CommandConfig = {
  binaryPath: 'N_m3u8DL-RE',
  outputDir: './downloads',
  outputName: '{title}',
  muxer: 'ffmpeg',
  containerFormat: 'mp4',
  threadCount: 8,
  concurrentDownload: 5,
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
};

export const DEFAULT_STREAM_SELECTIONS: StreamSelections = {
  selectedVideoId: 'best',
  selectedAudioIds: [],
  selectedSubtitleIds: [],
  autoBestVideo: true,
  autoAllAudio: true,
  autoAllSubtitles: true,
};

/**
 * Universal header parser supporting raw string ('Key: Value'), array, or key-value object.
 */
export function parseHeaders(input: any): CustomHeader[] {
  if (!input) return [];
  const results: CustomHeader[] = [];

  const addHeader = (k: string, v: string) => {
    const key = k.trim();
    const value = v.trim();
    if (key && value) {
      results.push({ id: `h_${results.length + 1}`, key, value });
    }
  };

  if (typeof input === 'string') {
    input.split(/\r?\n/).forEach((line) => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        addHeader(line.substring(0, idx), line.substring(idx + 1));
      }
    });
  } else if (Array.isArray(input)) {
    input.forEach((item) => {
      if (typeof item === 'string') {
        const idx = item.indexOf(':');
        if (idx > 0) addHeader(item.substring(0, idx), item.substring(idx + 1));
      } else if (item && typeof item === 'object') {
        const k = item.key || item.name || item.header;
        const v = item.value || item.val;
        if (k && v) addHeader(String(k), String(v));
      }
    });
  } else if (typeof input === 'object' && input !== null) {
    for (const [k, v] of Object.entries(input)) {
      if (k && v) addHeader(k, String(v));
    }
  }

  return results;
}

/**
 * Sanitizes a title string into a filesystem-safe base name.
 */
export function sanitizeSaveName(title?: string): string {
  const clean = (title || 'Stream')
    .replace(/[/\\?%*:|"<>']/g, '_')
    .trim()
    .replace(/[\s]+/g, '_')
    .replace(/_+/g, '_');
  return clean || 'Stream';
}

/**
 * Helper to extract clean language codes (e.g. "eng", "ita", "en", "it") from selected track IDs or analysis.
 * Ensures internal synthetic IDs (like "sub-subs-eng-1") are never passed to the CLI.
 */
export function extractLanguageCodes(
  selectedIds: string[],
  tracks: Array<{ id: string; language?: string; name?: string; languageName?: string }>
): string[] {
  const langs = new Set<string>();

  selectedIds.forEach((id) => {
    if (!id) return;

    // 1. Look up track in analysis
    const track = tracks.find(
      (t) =>
        t.id === id ||
        (t.language && t.language.toLowerCase() === id.toLowerCase())
    );

    if (track && track.language && track.language.trim()) {
      langs.add(track.language.trim().toLowerCase());
    } else if (
      !id.startsWith('sub-') &&
      !id.startsWith('dash_s_') &&
      !id.startsWith('aud-') &&
      !id.startsWith('dash_a_')
    ) {
      // 2. Direct language code passed (e.g. "eng", "ita", "en", "it", "es")
      langs.add(id.trim().toLowerCase());
    } else {
      // 3. Synthetic ID like "sub-subs-eng-1" -> parse language code "eng" from ID string
      const match = id.match(/(?:sub|dash_s|aud|dash_a)[-_](?:[^-_\s]+[-_])?([a-zA-Z]{2,3})(?:[-_]|$)/i);
      if (match && match[1]) {
        langs.add(match[1].toLowerCase());
      }
    }
  });

  return Array.from(langs).filter(Boolean);
}

/**
 * Generates an N_m3u8DL-RE CLI command from analysis, selections, and config.
 */
export function generateNm3u8dlCommand(
  analysis: ManifestAnalysis,
  selections: StreamSelections,
  config: CommandConfig
): string {
  const parts: string[] = [];

  // 1. Binary Name
  const binary = config.binaryPath || 'N_m3u8DL-RE';
  parts.push(binary);

  // 2. Stream URL
  parts.push(`"${analysis.url}"`);

  // 3. Video Selection Flag
  if (selections.autoBestVideo || selections.selectedVideoId === 'best') {
    parts.push(`-sv best`);
  } else if (selections.selectedVideoId === 'worst') {
    parts.push(`-sv worst`);
  } else if (selections.selectedVideoId) {
    const selected = selections.selectedVideoId;
    const videoTrack = analysis.videoTracks.find(
      (v) =>
        v.id === selected ||
        v.resolution === selected ||
        (v.height && `${v.height}` === selected) ||
        (v.height && `${v.height}p` === selected)
    );

    let resPattern = '';

    if (videoTrack) {
      if (videoTrack.resolution && videoTrack.resolution.includes('x')) {
        resPattern = videoTrack.resolution.trim();
      } else if (videoTrack.width && videoTrack.height) {
        resPattern = `${videoTrack.width}x${videoTrack.height}`;
      } else if (videoTrack.height) {
        resPattern = `${videoTrack.height}`;
      } else if (videoTrack.resolution) {
        resPattern = videoTrack.resolution.trim();
      }
    }

    if (!resPattern && selected) {
      const matchX = selected.match(/\d+x\d+/);
      if (matchX) {
        resPattern = matchX[0];
      } else {
        const numMatch = selected.match(/\d{3,4}/);
        if (numMatch) {
          resPattern = numMatch[0];
        }
      }
    }

    if (resPattern) {
      parts.push(`-sv "res=${resPattern}"`);
    } else {
      parts.push(`-sv best`);
    }
  } else {
    parts.push(`-sv best`);
  }

  // 4. Multi-Audio Selection Flags
  if (selections.autoAllAudio) {
    parts.push(`-sa all`);
  } else if (selections.selectedAudioIds.length > 0) {
    const audioLangs = extractLanguageCodes(
      selections.selectedAudioIds,
      analysis.audioTracks
    );
    if (audioLangs.length > 0) {
      parts.push(`--select-audio "for=all:lang=${audioLangs.join('|')}"`);
    } else {
      parts.push(`-sa all`);
    }
  } else {
    parts.push(`-sa all`);
  }

  // 5. Multi-Subtitle Selection Flags
  if (selections.autoAllSubtitles) {
    parts.push(`-ss all`);
  } else if (selections.selectedSubtitleIds.length > 0) {
    const subLangs = extractLanguageCodes(
      selections.selectedSubtitleIds,
      analysis.subtitleTracks
    );
    if (subLangs.length > 0) {
      parts.push(`-ss "for=all:lang=${subLangs.join('|')}"`);
    } else {
      parts.push(`-ss all`);
    }
  }

  // 6. Muxing Configuration
  if (config.muxer !== 'none') {
    const format = config.containerFormat || 'mp4';
    parts.push(`-M format=${format}`);
  }

  // 7. Performance & Thread Flags
  if (config.threadCount && config.threadCount > 1) {
    parts.push(`--thread-count ${config.threadCount}`);
  }
  if (config.retryCount) {
    parts.push(`--download-retry-count ${config.retryCount}`);
  }
  if (config.maxSpeed && config.maxSpeed !== '0') {
    parts.push(`--max-speed ${config.maxSpeed}`);
  }

  // 8. Output Directory & Safe Save Name
  if (config.outputDir) {
    parts.push(`--save-dir "${config.outputDir}"`);
  }

  const finalSaveName = sanitizeSaveName(config.outputName || analysis.title);
  parts.push(`--save-name "${finalSaveName}"`);

  // 9. DRM Decryption Keys
  if (config.keys && config.keys.length > 0) {
    config.keys.forEach((k) => {
      if (k.kid && k.key) {
        parts.push(`--key ${k.kid}:${k.key}`);
      }
    });
  }

  // 10. HTTP Headers
  if (config.headers && config.headers.length > 0) {
    config.headers.forEach((h) => {
      if (h.key && h.value) {
        parts.push(`-H "${h.key}: ${h.value}"`);
      }
    });
  }

  // 11. Proxy
  if (config.proxy) {
    parts.push(`--custom-proxy "${config.proxy}"`);
  }

  // 12. Segment & File Flags
  if (config.checkSegmentsCount) {
    parts.push(`--check-segments-count true`);
  }
  if (config.keepTsFiles) {
    parts.push(`--keep-ts-files`);
  }

  // 13. Shaka Packager
  if (config.useShakaPackager) {
    if (config.shakaPackagerPath) {
      parts.push(`--use-shaka-packager --shaka-packager-exe "${config.shakaPackagerPath}"`);
    } else {
      parts.push(`--use-shaka-packager`);
    }
  }

  // 14. Custom Flags
  if (config.customFfmpegFlags) {
    parts.push(`--mux-import bin_path="ffmpeg":args="${config.customFfmpegFlags}"`);
  }
  if (config.customRawFlags) {
    parts.push(config.customRawFlags.trim());
  }

  return parts.filter(Boolean).join(' ');
}

export interface DownloadJobPlan {
  url: string;
  title: string;
  saveName: string;
  outputFile: string;
  commandExecuted: string;
  selectionsSummary: {
    video: string;
    audio: string[];
    subtitles: string[];
  };
  config: CommandConfig;
  selections: StreamSelections;
}

/**
 * Unified plan builder used by both UI download start and API automated tasks.
 * Single source of truth for command flags, output filenames, and track summaries.
 */
export function buildDownloadJobPlan(params: {
  url: string;
  title?: string;
  analysis?: ManifestAnalysis | null;
  selections?: Partial<StreamSelections>;
  config?: Partial<CommandConfig>;
  headers?: any;
  explicitCommand?: string;
  commandExecuted?: string;
  explicitSelectionsSummary?: { video: string; audio: string[]; subtitles: string[] };
}): DownloadJobPlan {
  const url = params.url.trim();
  const title = params.title || params.analysis?.title || 'Stream';
  const saveName = sanitizeSaveName(title);

  // Merge headers into config
  const customHeaders = parseHeaders(params.headers || params.config?.headers);
  const config: CommandConfig = {
    ...DEFAULT_COMMAND_CONFIG,
    ...params.config,
    outputName: saveName,
    headers: customHeaders,
  };

  const containerFormat = config.containerFormat || 'mp4';
  const outputFile = `${saveName}.${containerFormat}`;

  // Build or infer stream selections
  const selections: StreamSelections = {
    ...DEFAULT_STREAM_SELECTIONS,
    ...params.selections,
  };

  const analysis: ManifestAnalysis = params.analysis || {
    url,
    type: 'HLS (m3u8)',
    title,
    videoTracks: [],
    audioTracks: [],
    subtitleTracks: [],
  };

  // Generate or preserve explicit command string without reprocessing
  const explicitCmd =
    params.explicitCommand ||
    params.commandExecuted ||
    (params as any).commandExecuted;

  const commandExecuted = explicitCmd || generateNm3u8dlCommand(analysis, selections, config);

  // Compute selections summary
  let selectionsSummary = params.explicitSelectionsSummary;
  if (!selectionsSummary) {
    const videoSummary = selections.autoBestVideo
      ? 'Best Video Quality'
      : (analysis.videoTracks.find((v) =>
          v.id === selections.selectedVideoId ||
          v.resolution === selections.selectedVideoId ||
          (v.height && `${v.height}p` === selections.selectedVideoId)
        )?.resolution || selections.selectedVideoId || 'Best Video Quality');

    const selectedAudioTracks = analysis.audioTracks.filter((a) =>
      selections.selectedAudioIds.includes(a.id)
    );
    const audioSummary =
      selectedAudioTracks.length > 0
        ? selectedAudioTracks.map((a) => a.languageName || a.language || a.name)
        : selections.autoAllAudio
        ? (analysis.audioTracks.length > 0 ? analysis.audioTracks.map((a) => a.languageName || a.language || a.name) : ['All Audio Tracks'])
        : ['Default Audio'];

    const selectedSubTracks = analysis.subtitleTracks.filter((s) =>
      selections.selectedSubtitleIds.includes(s.id)
    );
    const subSummary =
      selectedSubTracks.length > 0
        ? selectedSubTracks.map((s) => s.languageName || s.language || s.name)
        : selections.autoAllSubtitles
        ? ['All Subtitles']
        : ['None'];

    selectionsSummary = {
      video: videoSummary,
      audio: audioSummary,
      subtitles: subSummary,
    };
  }

  return {
    url,
    title,
    saveName,
    outputFile,
    commandExecuted,
    selectionsSummary,
    config,
    selections,
  };
}

export function generateFFmpegStandaloneCommand(
  videoFile: string,
  audioFiles: string[],
  subtitleFiles: string[],
  outputFile: string,
  container: string = 'mkv'
): string {
  const inputs: string[] = [];
  const mappings: string[] = [];

  inputs.push(`-i "${videoFile}"`);
  mappings.push(`-map 0:v`);

  audioFiles.forEach((aFile, idx) => {
    inputs.push(`-i "${aFile}"`);
    mappings.push(`-map ${idx + 1}:a`);
  });

  subtitleFiles.forEach((sFile, idx) => {
    const inputIdx = audioFiles.length + idx + 1;
    inputs.push(`-i "${sFile}"`);
    mappings.push(`-map ${inputIdx}:s`);
  });

  const codecFlag = container === 'mp4' ? '-c:v copy -c:a aac -c:s mov_text' : '-c copy';

  return `ffmpeg ${inputs.join(' ')} ${mappings.join(' ')} ${codecFlag} "${outputFile}"`;
}
