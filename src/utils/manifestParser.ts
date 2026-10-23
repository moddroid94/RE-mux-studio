import {
  AudioTrack,
  ManifestAnalysis,
  SubtitleTrack,
  VideoTrack,
} from '../types/stream';

export function parseStreamManifest(
  manifestText: string,
  url: string,
  customTitle?: string
): ManifestAnalysis {
  const isXml = manifestText.trim().startsWith('<') || url.endsWith('.mpd') || url.endsWith('.ism/Manifest');

  if (isXml) {
    return parseDASHOrMSSManifest(manifestText, url, customTitle);
  }

  return parseHLSManifest(manifestText, url, customTitle);
}

// Alias for backward compatibility
export const parseM3U8Manifest = parseStreamManifest;

/* =========================================================================
   1. HLS MASTER & MEDIA PLAYLIST PARSER
   ========================================================================= */
function parseHLSManifest(
  manifestText: string,
  url: string,
  customTitle?: string
): ManifestAnalysis {
  const lines = manifestText.split(/\r?\n/);

  const videoTracks: VideoTrack[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];

  let isMasterPlaylist = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
      isMasterPlaylist = true;
      const attrStr = line.substring(line.indexOf(':') + 1);
      const attributes = parseHLSAttributes(attrStr);

      const bandwidth = parseInt(attributes['BANDWIDTH'] || attributes['AVERAGE-BANDWIDTH'] || '0', 10);
      const resolution = attributes['RESOLUTION'] || '';
      const codecs = attributes['CODECS'] || 'h264';
      const fpsStr = attributes['FRAME-RATE'];
      const fps = fpsStr ? parseFloat(fpsStr) : undefined;
      const audioGroup = attributes['AUDIO'];
      const subGroup = attributes['SUBTITLES'];

      let width = 0;
      let height = 0;

      if (resolution.includes('x')) {
        const parts = resolution.split('x');
        width = parseInt(parts[0], 10) || 0;
        height = parseInt(parts[1], 10) || 0;
      }

      // Next line is often the variant stream URI
      let nextUri = '';
      if (i + 1 < lines.length && !lines[i + 1].trim().startsWith('#')) {
        nextUri = lines[i + 1].trim();
      }

      const bitrateFormatted = formatBitrate(bandwidth);
      const isHdr = detectHdrType(codecs);
      const resFormatted = resolution || (height ? `${width}x${height}` : 'Variant Stream');

      const trackId = `video-${videoTracks.length + 1}-${height ? `${height}p` : bandwidth}`;

      // Avoid exact duplicates
      if (!videoTracks.some((v) => v.bandwidth === bandwidth && v.resolution === resFormatted)) {
        videoTracks.push({
          id: trackId,
          resolution: resFormatted,
          width,
          height,
          bandwidth,
          bitrateFormatted,
          fps,
          codec: codecs.replace(/"/g, ''),
          hdr: isHdr,
          groupId: audioGroup || subGroup || 'main',
          isDefault: videoTracks.length === 0,
        });
      }
    } else if (line.startsWith('#EXT-X-MEDIA:')) {
      isMasterPlaylist = true;
      const attrStr = line.substring(line.indexOf(':') + 1);
      const attributes = parseHLSAttributes(attrStr);

      const type = (attributes['TYPE'] || '').toUpperCase();
      const groupId = attributes['GROUP-ID'] || 'default';
      const language = (attributes['LANGUAGE'] || attributes['ASSOC-LANGUAGE'] || 'und').toLowerCase();
      const name = (attributes['NAME'] || language.toUpperCase()).replace(/"/g, '');
      const isDefault = attributes['DEFAULT'] === 'YES';
      const isAutoSelect = attributes['AUTOSELECT'] === 'YES';
      const channels = attributes['CHANNELS'] || '2';

      if (type === 'AUDIO') {
        const audioId = `audio-${groupId}-${language}-${audioTracks.length + 1}`;
        const channelsFormatted = formatAudioChannels(channels);

        if (!audioTracks.some((a) => a.groupId === groupId && a.language === language && a.name === name)) {
          audioTracks.push({
            id: audioId,
            language,
            languageName: getLanguageName(language),
            name,
            channels: channelsFormatted,
            codec: 'aac / ac3',
            bitrate: 192000,
            bitrateFormatted: '192 kbps',
            groupId,
            isDefault,
            isAutoSelect,
          });
        }
      } else if (type === 'SUBTITLES' || type === 'CLOSED-CAPTIONS') {
        const subId = `sub-${groupId}-${language}-${subtitleTracks.length + 1}`;
        const isForced = attributes['FORCED'] === 'YES';

        if (!subtitleTracks.some((s) => s.groupId === groupId && s.language === language && s.name === name)) {
          subtitleTracks.push({
            id: subId,
            language,
            languageName: getLanguageName(language),
            name,
            format: 'vtt',
            groupId,
            isDefault,
            isForced,
          });
        }
      }
    }
  }

  // If Media Playlist (not master playlist with variants), generate single stream entry
  if (!isMasterPlaylist || videoTracks.length === 0) {
    videoTracks.push({
      id: 'video-direct-stream',
      resolution: 'Direct HLS Stream',
      width: 1920,
      height: 1080,
      bandwidth: 4000000,
      bitrateFormatted: '4.0 Mbps',
      fps: 30,
      codec: 'h264',
      hdr: 'SDR',
      isDefault: true,
    });
  }

  // Sort video tracks descending by bandwidth / height
  videoTracks.sort((a, b) => (b.height || 0) - (a.height || 0) || b.bandwidth - a.bandwidth);

  return {
    url,
    type: 'HLS (m3u8)',
    title: customTitle || 'HLS Stream Manifest',
    durationSeconds: 600,
    durationFormatted: 'Live / VOD',
    videoTracks,
    audioTracks,
    subtitleTracks,
    rawManifest: manifestText,
    drmProtected: manifestText.includes('#EXT-X-KEY:METHOD=SAMPLE-AES') || manifestText.includes('widevine') || manifestText.includes('KEYFORMAT'),
  };
}

/* =========================================================================
   2. DASH MPD & MSS XML MANIFEST PARSER
   ========================================================================= */
function parseDASHOrMSSManifest(
  xmlText: string,
  url: string,
  customTitle?: string
): ManifestAnalysis {
  const videoTracks: VideoTrack[] = [];
  const audioTracks: AudioTrack[] = [];
  const subtitleTracks: SubtitleTrack[] = [];

  // Regex-based robust XML Tag Extractor
  const adaptationSetRegex = /<AdaptationSet[\s\S]*?<\/AdaptationSet>/gi;
  let adaptMatch;

  let adaptIndex = 0;
  while ((adaptMatch = adaptationSetRegex.exec(xmlText)) !== null) {
    adaptIndex++;
    const setXml = adaptMatch[0];

    const contentType = getXmlAttr(setXml, 'contentType') || getXmlAttr(setXml, 'mimeType') || '';
    const lang = (getXmlAttr(setXml, 'lang') || getXmlAttr(setXml, 'xml:lang') || 'und').toLowerCase();
    const isVideo = contentType.includes('video') || setXml.includes('width=') || setXml.includes('height=');
    const isAudio = contentType.includes('audio') || setXml.includes('audioSamplingRate');
    const isSubtitle = contentType.includes('text') || contentType.includes('vtt') || contentType.includes('ttml') || setXml.includes('subtitle');

    // Parse Representations inside this AdaptationSet
    const repRegex = /<Representation[\s\S]*?(?:\/>|<\/Representation>)/gi;
    let repMatch;

    while ((repMatch = repRegex.exec(setXml)) !== null) {
      const repXml = repMatch[0];
      const id = getXmlAttr(repXml, 'id') || `rep_${adaptIndex}_${videoTracks.length + 1}`;
      const bandwidth = parseInt(getXmlAttr(repXml, 'bandwidth') || '0', 10);
      const width = parseInt(getXmlAttr(repXml, 'width') || getXmlAttr(setXml, 'width') || '0', 10);
      const height = parseInt(getXmlAttr(repXml, 'height') || getXmlAttr(setXml, 'height') || '0', 10);
      const codecs = getXmlAttr(repXml, 'codecs') || getXmlAttr(setXml, 'codecs') || '';
      const frameRateStr = getXmlAttr(repXml, 'frameRate') || getXmlAttr(setXml, 'frameRate');
      const fps = frameRateStr ? parseFloat(frameRateStr) : undefined;

      if (isVideo) {
        const resFormatted = width && height ? `${width}x${height}` : height ? `${height}p` : `DASH ${id}`;
        videoTracks.push({
          id: `dash_v_${id}`,
          resolution: resFormatted,
          width,
          height,
          bandwidth,
          bitrateFormatted: formatBitrate(bandwidth),
          fps,
          codec: codecs || 'h264',
          hdr: detectHdrType(codecs),
          groupId: `video_${adaptIndex}`,
          isDefault: videoTracks.length === 0,
        });
      } else if (isAudio) {
        const audioSamplingRate = getXmlAttr(repXml, 'audioSamplingRate') || '44100';
        audioTracks.push({
          id: `dash_a_${id}`,
          language: lang,
          languageName: getLanguageName(lang),
          name: `DASH Audio (${lang.toUpperCase()}) - ${Math.round(parseInt(audioSamplingRate, 10) / 1000)}kHz`,
          channels: '2.0 Stereo',
          codec: codecs || 'aac',
          bitrate: bandwidth || 128000,
          bitrateFormatted: formatBitrate(bandwidth || 128000),
          groupId: `audio_${adaptIndex}`,
          isDefault: audioTracks.length === 0,
        });
      } else if (isSubtitle) {
        subtitleTracks.push({
          id: `dash_s_${id}`,
          language: lang,
          languageName: getLanguageName(lang),
          name: `DASH Subtitles (${lang.toUpperCase()})`,
          format: contentType.includes('vtt') ? 'vtt' : 'ttml',
          groupId: `subs_${adaptIndex}`,
          isDefault: subtitleTracks.length === 0,
        });
      }
    }
  }

  // Fallback if no adaptation sets matched
  if (videoTracks.length === 0) {
    videoTracks.push({
      id: 'dash-main-video',
      resolution: 'DASH Main Video Stream',
      width: 1920,
      height: 1080,
      bandwidth: 4500000,
      bitrateFormatted: '4.5 Mbps',
      fps: 30,
      codec: 'h264',
      hdr: 'SDR',
      isDefault: true,
    });
  }

  videoTracks.sort((a, b) => (b.height || 0) - (a.height || 0) || b.bandwidth - a.bandwidth);

  return {
    url,
    type: url.endsWith('.ism/Manifest') ? 'MSS (ism)' : 'DASH (mpd)',
    title: customTitle || 'DASH Manifest',
    durationSeconds: 600,
    durationFormatted: 'Live / VOD',
    videoTracks,
    audioTracks,
    subtitleTracks,
    rawManifest: xmlText,
    drmProtected: xmlText.includes('ContentProtection') || xmlText.includes('Widevine') || xmlText.includes('PlayReady'),
  };
}

/* =========================================================================
   HELPERS & UTILITIES
   ========================================================================= */
function parseHLSAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Regex to extract key=value pairs handling quoted strings with commas
  const pattern = /([A-Z0-9-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,\s]+))/gi;
  let match;
  while ((match = pattern.exec(attrString)) !== null) {
    const key = match[1].toUpperCase();
    const val = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
    attrs[key] = val;
  }
  return attrs;
}

function getXmlAttr(xmlSnippet: string, attrName: string): string {
  const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = regex.exec(xmlSnippet);
  return m ? m[1] : '';
}

function formatBitrate(bps: number): string {
  if (!bps || bps <= 0) return 'Auto Bitrate';
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
  return `${Math.round(bps / 1000)} kbps`;
}

function detectHdrType(codecs: string): 'HDR10' | 'Dolby Vision' | 'HLG' | 'SDR' {
  const c = codecs.toLowerCase();
  if (c.includes('dvh1') || c.includes('dvhe')) return 'Dolby Vision';
  if (c.includes('hvc1.2') || c.includes('hev1.2') || c.includes('vp09.02')) return 'HDR10';
  return 'SDR';
}

function formatAudioChannels(chStr: string): string {
  const clean = chStr.replace(/"/g, '').trim();
  if (clean === '6' || clean.includes('6')) return '5.1 Surround';
  if (clean === '8' || clean.includes('8')) return '7.1 Atmos';
  if (clean === '1') return '1.0 Mono';
  return `${clean} Stereo`;
}

export function getLanguageName(code: string): string {
  if (!code) return 'Undetermined';
  const codeLower = code.toLowerCase().split('-')[0];
  const map: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    ja: 'Japanese',
    zh: 'Chinese',
    it: 'Italian',
    ru: 'Russian',
    pt: 'Portuguese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    nl: 'Dutch',
    pl: 'Polish',
    tr: 'Turkish',
    sv: 'Swedish',
    fi: 'Finnish',
    da: 'Danish',
    no: 'Norwegian',
    cs: 'Czech',
    hu: 'Hungarian',
    ro: 'Romanian',
    el: 'Greek',
    he: 'Hebrew',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    und: 'Undetermined',
  };
  return map[codeLower] || code.toUpperCase();
}
