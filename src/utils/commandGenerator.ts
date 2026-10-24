import {
  CommandConfig,
  ManifestAnalysis,
  StreamSelections
} from '../types/stream';

export function generateNm3u8dlCommand(
  analysis: ManifestAnalysis,
  selections: StreamSelections,
  config: CommandConfig
): string {
  const parts: string[] = [];

  // 1. Binary Name
  const binary = config.binaryPath || 'N_m3u8DL-RE';
  parts.push(binary);

  // 2. Stream URL (quoted)
  parts.push(`"${analysis.url}"`);

  // 3. Video Selection Flag
  if (selections.autoBestVideo || selections.selectedVideoId === 'best') {
    parts.push(`-sv best`);
  } else if (selections.selectedVideoId === 'worst') {
    parts.push(`-sv worst`);
  } else if (selections.selectedVideoId) {
    const videoTrack = analysis.videoTracks.find(
      (v) => v.id === selections.selectedVideoId
    );
    if (videoTrack) {
      if (videoTrack.height > 0) {
        parts.push(`--select-video "res=${videoTrack.height}*"`);
      } else if (videoTrack.resolution) {
        parts.push(`--select-video "res=${videoTrack.resolution}"`);
      } else {
        parts.push(`--select-video "id=${videoTrack.id}"`);
      }
    } else {
      parts.push(`--select-video "id=${selections.selectedVideoId}"`);
    }
  } else {
    parts.push(`-sv best`);
  }

  // 4. Multi-Audio Selection Flags
  if (selections.autoAllAudio) {
    parts.push(`-sa all`);
  } else if (selections.selectedAudioIds.length > 0) {
    const selectedAudios = analysis.audioTracks.filter((a) =>
      selections.selectedAudioIds.includes(a.id)
    );
    if (selectedAudios.length > 0) {
      const langs = Array.from(
        new Set(selectedAudios.map((a) => a.language).filter(Boolean))
      );
      if (langs.length > 0) {
        const langPattern = langs.join('|');
        parts.push(`--select-audio "lang=${langPattern}"`);
      } else {
        parts.push(`-sa all`);
      }
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
    const selectedSubs = analysis.subtitleTracks.filter((s) =>
      selections.selectedSubtitleIds.includes(s.id)
    );
    if (selectedSubs.length > 0) {
      const langs = Array.from(
        new Set(selectedSubs.map((s) => s.language).filter(Boolean))
      );
      if (langs.length > 0) {
        const langPattern = langs.join('|');
        parts.push(`--select-subtitle "lang=${langPattern}"`);
      } else {
        parts.push(``);
      }
    }
  } else {
    parts.push(``);
  }

  // 6. Muxing Configuration
  if (config.muxer !== 'none') {
    const format = config.containerFormat || 'mkv';
    const muxerName = config.muxer || 'ffmpeg';
    parts.push(`-M format=${format}`);
  }

  // 7. Performance & Threads
  if (config.threadCount && config.threadCount > 1) {
    parts.push(`--thread-count ${config.threadCount}`);
  }
  if (config.retryCount) {
    parts.push(`--download-retry-count ${config.retryCount}`);
  }
  if (config.maxSpeed && config.maxSpeed !== '0') {
    parts.push(`--max-speed ${config.maxSpeed}`);
  }

  // 8. Output Directory & Name
  if (config.outputDir) {
    parts.push(`--save-dir "${config.outputDir}"`);
  }

  // Base title sanitized
  let baseTitle = (config.outputName || analysis.title || 'Stream')
    .replace(/\{title\}/gi, analysis.title || 'Stream')
    .replace(/\{res\}/gi, '1080p')
    .replace(/\{lang\}/gi, 'multi')
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');

  if (!baseTitle) baseTitle = 'Stream';

  // Extract selected video height/res tag
  let resTag = '';
  if (selections.selectedVideoId && selections.selectedVideoId !== 'best' && selections.selectedVideoId !== 'worst') {
    const vTrack = analysis.videoTracks.find((v) => v.id === selections.selectedVideoId);
    if (vTrack?.height) {
      resTag = `_${vTrack.height}p`;
    } else if (vTrack?.resolution) {
      resTag = `_${vTrack.resolution}`;
    }
  }

  // Extract selected audio languages tag
  const selectedAudios = analysis.audioTracks.filter((a) =>
    selections.selectedAudioIds.includes(a.id)
  );
  let audioLangs = Array.from(new Set(selectedAudios.map((a) => a.language).filter(Boolean)));
  if (audioLangs.length === 0 && selections.autoAllAudio && analysis.audioTracks.length > 0) {
    audioLangs = Array.from(new Set(analysis.audioTracks.map((a) => a.language).filter(Boolean)));
  }
  const audioTag = audioLangs.length > 0 ? `_audio-${audioLangs.join('-')}` : '';

  // Extract selected subtitle languages tag
  const selectedSubs = analysis.subtitleTracks.filter((s) =>
    selections.selectedSubtitleIds.includes(s.id)
  );
  let subLangs = Array.from(new Set(selectedSubs.map((s) => s.language).filter(Boolean)));
  if (subLangs.length === 0 && selections.autoAllSubtitles && analysis.subtitleTracks.length > 0) {
    subLangs = Array.from(new Set(analysis.subtitleTracks.map((s) => s.language).filter(Boolean)));
  }
  const subTag = subLangs.length > 0 ? `_subs-${subLangs.join('-')}` : '';

  const finalSaveName = `${baseTitle}${resTag}${audioTag}${subTag}`.replace(/_+/g, '_');
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

  // 14. Custom FFmpeg additional flags
  if (config.customFfmpegFlags) {
    parts.push(`--mux-import bin_path="ffmpeg":args="${config.customFfmpegFlags}"`);
  }

  // 15. Custom Raw Extra Flags
  if (config.customRawFlags) {
    parts.push(config.customRawFlags.trim());
  }

  return parts.join(' ');
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
