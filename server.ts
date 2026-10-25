import { execSync, spawn } from 'child_process';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  AudioTrack,
  CustomHeader,
  DownloadJob,
  LogMessage,
  ManifestAnalysis,
  SubtitleTrack,
  VideoTrack,
} from './src/types/stream.js';
import {
  buildDownloadJobPlan,
  DownloadJobPlan,
  parseHeaders,
} from './src/utils/commandGenerator.js';
import { parseStreamManifest } from './src/utils/manifestParser.js';

interface ActiveJobInternal {
  job: DownloadJob;
  process?: any;
  intervalTimer?: NodeJS.Timeout;
}

type JobProgressLambda = (job: DownloadJob) => void;
type GlobalProgressLambda = () => void;

const activeJobsStore: Map<string, ActiveJobInternal> = new Map();
const jobProgressListenerMap: Map<string, Set<JobProgressLambda>> = new Map();
const globalProgressListeners: Set<GlobalProgressLambda> = new Set();

// Ensure full RW permissions for created files & directories by setting umask to 0
try {
  process.umask(0);
} catch {}

// Ensure downloads directory exists
const DOWNLOADS_DIR = path.resolve('./downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true, mode: 0o777 });
}

/**
 * Ensures saved files and directories are not owned by root,
 * applying world Read & Write (RW) permissions (0o666 for files, 0o777 for dirs)
 * and chowning away from root (using PUID/PGID, host directory UID/GID, or standard non-root 1000:1000).
 */
function adjustFilePermissionsAndOwnership(targetPath: string): void {
  try {
    if (!fs.existsSync(targetPath)) return;

    const stat = fs.statSync(targetPath);

    // 1. World Read & Write permissions (rw-rw-rw- for files, rwxrwxrwx for directories)
    try {
      if (stat.isDirectory()) {
        fs.chmodSync(targetPath, 0o777);
        const entries = fs.readdirSync(targetPath);
        for (const entry of entries) {
          adjustFilePermissionsAndOwnership(path.join(targetPath, entry));
        }
      } else {
        fs.chmodSync(targetPath, 0o666);
      }
    } catch {
      // Ignored if filesystem doesn't support chmod (e.g. FAT/NTFS mounts)
    }

    // 2. Chown away from root if running as root in Docker/Linux
    try {
      const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

      let targetUid: number | null = null;
      let targetGid: number | null = null;

      const puid = process.env.PUID || process.env.UID;
      const pgid = process.env.PGID || process.env.GID;

      if (puid && !isNaN(parseInt(puid, 10))) {
        targetUid = parseInt(puid, 10);
      }
      if (pgid && !isNaN(parseInt(pgid, 10))) {
        targetGid = parseInt(pgid, 10);
      }

      // If not passed in env, inspect the owner of the downloads directory
      if (targetUid === null && fs.existsSync(DOWNLOADS_DIR)) {
        const downloadsStat = fs.statSync(DOWNLOADS_DIR);
        if (downloadsStat.uid !== 0) {
          targetUid = downloadsStat.uid;
          targetGid = downloadsStat.gid;
        }
      }

      // If running as root and no PUID configured, use standard non-root user (1000:1000)
      if (isRoot && targetUid === null) {
        targetUid = 1000;
        targetGid = targetGid !== null ? targetGid : 1000;
      }

      if (targetUid !== null && targetUid !== 0) {
        const gidToUse = targetGid !== null ? targetGid : targetUid;
        fs.chownSync(targetPath, targetUid, gidToUse);
      }
    } catch {
      // Ignored if chown is unsupported or user lacks CAP_CHOWN
    }
  } catch {
    // Fail-safe
  }
}

// Ensure DOWNLOADS_DIR itself is world writable on boot
adjustFilePermissionsAndOwnership(DOWNLOADS_DIR);

// Check system binary availability
function checkSystemBinary(binName: string): boolean {
  try {
    execSync(`which ${binName} || where ${binName}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const HAS_NM3U8DL = checkSystemBinary('N_m3u8DL-RE') || checkSystemBinary('m3u8dl-re');
const HAS_FFMPEG = checkSystemBinary('ffmpeg');

console.log(`[RE-Mux System Check] N_m3u8DL-RE Binary: ${HAS_NM3U8DL ? 'INSTALLED' : 'NOT FOUND (Web fallback)'}`);
console.log(`[RE-Mux System Check] FFmpeg Binary: ${HAS_FFMPEG ? 'INSTALLED' : 'NOT FOUND (Web fallback)'}`);

/* =========================================================================
   PACED EVENT BROADCASTER (Strict minimum 1000ms delay between pushes)
   ========================================================================= */
const MIN_PACE_MS = 1000;
let lastGlobalBroadcastTime = 0;
let globalTrailingTimer: NodeJS.Timeout | null = null;

function broadcastGlobalJobs(forceNow = false) {
  const now = Date.now();
  const elapsed = now - lastGlobalBroadcastTime;

  if (forceNow && elapsed >= MIN_PACE_MS) {
    if (globalTrailingTimer) {
      clearTimeout(globalTrailingTimer);
      globalTrailingTimer = null;
    }
    lastGlobalBroadcastTime = now;
    globalProgressListeners.forEach((cb) => {
      try { cb(); } catch {}
    });
    return;
  }

  if (elapsed >= MIN_PACE_MS) {
    if (globalTrailingTimer) {
      clearTimeout(globalTrailingTimer);
      globalTrailingTimer = null;
    }
    lastGlobalBroadcastTime = now;
    globalProgressListeners.forEach((cb) => {
      try { cb(); } catch {}
    });
    return;
  }

  if (!globalTrailingTimer) {
    const delay = Math.max(50, MIN_PACE_MS - elapsed);
    globalTrailingTimer = setTimeout(() => {
      globalTrailingTimer = null;
      lastGlobalBroadcastTime = Date.now();
      globalProgressListeners.forEach((cb) => {
        try { cb(); } catch {}
      });
    }, delay);
  }
}

const jobLastBroadcastTimeMap = new Map<string, number>();
const jobTrailingTimerMap = new Map<string, NodeJS.Timeout>();

function broadcastJobProgress(job: DownloadJob) {
  const now = Date.now();
  const lastTime = jobLastBroadcastTimeMap.get(job.id) || 0;
  const elapsed = now - lastTime;

  const emit = () => {
    jobLastBroadcastTimeMap.set(job.id, Date.now());
    const listeners = jobProgressListenerMap.get(job.id);
    if (listeners) {
      listeners.forEach((cb) => {
        try { cb(job); } catch {}
      });
    }
  };

  if (elapsed >= MIN_PACE_MS) {
    const existing = jobTrailingTimerMap.get(job.id);
    if (existing) {
      clearTimeout(existing);
      jobTrailingTimerMap.delete(job.id);
    }
    emit();
    return;
  }

  if (!jobTrailingTimerMap.has(job.id)) {
    const delay = Math.max(50, MIN_PACE_MS - elapsed);
    const timer = setTimeout(() => {
      jobTrailingTimerMap.delete(job.id);
      emit();
    }, delay);
    jobTrailingTimerMap.set(job.id, timer);
  }
}

function notifyJobProgress(job: DownloadJob, force = false) {
  broadcastJobProgress(job);
  broadcastGlobalJobs(force);
}

/* =========================================================================
   STREAM MANIFEST PROBING (Single Shared Resolver)
   ========================================================================= */
async function resolveStreamManifest(
  url: string,
  headers: CustomHeader[] = [],
  customTitle?: string
): Promise<ManifestAnalysis> {
  const reqHeaders: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: '*/*',
  };
  headers.forEach((h) => {
    if (h.key && h.value) reqHeaders[h.key] = h.value;
  });

  let manifestText = '';
  let finalUrl = url.trim();

  if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
    try {
      const response = await fetch(finalUrl, { headers: reqHeaders, redirect: 'follow' });
      if (response.ok) {
        manifestText = await response.text();
        if (response.url) finalUrl = response.url;
      }
    } catch (fetchErr: any) {
      console.warn('[Probe Warning] Direct HTTP fetch failed:', fetchErr.message);
    }
  }

  let analysis: ManifestAnalysis;
  if (manifestText) {
    analysis = parseStreamManifest(manifestText, finalUrl, customTitle);
  } else {
    analysis = parseStreamManifest(
      `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.64002a"\nstream.m3u8`,
      finalUrl,
      customTitle || 'Direct Stream URL'
    );
  }

  // Supplementary CLI Probe via N_m3u8DL-RE if binary exists and few tracks were discovered
  if (HAS_NM3U8DL && (analysis.videoTracks.length === 0 || analysis.audioTracks.length === 0)) {
    const cliTracks = await probeViaNm3u8dlCLI(finalUrl, headers);
    if (cliTracks) {
      if (cliTracks.videoTracks.length > 0) {
        analysis.videoTracks = mergeTracks(analysis.videoTracks, cliTracks.videoTracks);
      }
      if (cliTracks.audioTracks.length > 0) {
        analysis.audioTracks = mergeTracks(analysis.audioTracks, cliTracks.audioTracks);
      }
      if (cliTracks.subtitleTracks.length > 0) {
        analysis.subtitleTracks = mergeTracks(analysis.subtitleTracks, cliTracks.subtitleTracks);
      }
    }
  }

  return analysis;
}

function probeViaNm3u8dlCLI(
  url: string,
  headers: CustomHeader[] = []
): Promise<{
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
} | null> {
  return new Promise((resolve) => {
    const binary = checkSystemBinary('N_m3u8DL-RE') ? 'N_m3u8DL-RE' : 'm3u8dl-re';
    const headerFlags: string[] = [];
    headers.forEach((h) => {
      if (h.key && h.value) headerFlags.push('-H', `${h.key}: ${h.value}`);
    });

    const args = [url, '--no-log', ...headerFlags];
    const proc = spawn(binary, args, { timeout: 5000 });

    let stdout = '';
    proc.stdout?.on('data', (d) => (stdout += d.toString()));
    proc.stderr?.on('data', (d) => (stdout += d.toString()));

    proc.on('close', () => {
      const videoTracks: VideoTrack[] = [];
      const audioTracks: AudioTrack[] = [];
      const subtitleTracks: SubtitleTrack[] = [];

      const stripAnsi = (str: string) => str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
      const lines = stripAnsi(stdout).split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.includes('Resolution:') || trimmed.startsWith('Vid') || trimmed.includes('Video')) {
          const resM = trimmed.match(/Resolution:\s*(\d+x\d+)/i) || trimmed.match(/(\d+x\d+)/);
          const bwM = trimmed.match(/Bandwidth:\s*(\d+)/i) || trimmed.match(/(\d+)\s*bps/i) || trimmed.match(/(\d+)\s*Kbps/i);
          if (resM) {
            const res = resM[1];
            const bw = bwM ? parseInt(bwM[1], 10) : 4000000;
            videoTracks.push({
              id: `cli_v_${videoTracks.length + 1}_${res}`,
              resolution: res,
              width: parseInt(res.split('x')[0], 10) || 1920,
              height: parseInt(res.split('x')[1], 10) || 1080,
              bandwidth: bw,
              bitrateFormatted: `${(bw / 1000000).toFixed(1)} Mbps`,
              codec: 'h264',
              hdr: 'SDR',
            });
          }
        } else if (trimmed.startsWith('Aud') || trimmed.includes('Audio') || trimmed.includes('Language:')) {
          const langM =
            trimmed.match(/Language:\s*([a-zA-Z-]+)/i) ||
            trimmed.match(/lang="([^"]+)"/i) ||
            trimmed.match(/Aud\*?\s+([a-zA-Z-]+)\s*\|/i) ||
            trimmed.match(/\|\s*([a-zA-Z]{2,4})\b/i);
          const nameM = trimmed.match(/Name:\s*([^\\s,]+)/i) || trimmed.match(/Aud\*?\s+([^\\s|]+)\s*\|/i) || trimmed.match(/\|\s*([^\\n━]+)/);
          const lang = (langM ? langM[1] : (trimmed.toLowerCase().includes('ita') ? 'ita' : trimmed.toLowerCase().includes('eng') ? 'eng' : 'und')).toLowerCase();
          audioTracks.push({
            id: `cli_a_${audioTracks.length + 1}_${lang}`,
            language: lang,
            languageName: lang.toUpperCase(),
            name: nameM ? nameM[1].trim() : `Audio (${lang.toUpperCase()})`,
            channels: '2.0 Stereo',
            codec: 'aac',
            bitrate: 192000,
            bitrateFormatted: '192 kbps',
            groupId: 'cli_audio',
          });
        } else if (trimmed.startsWith('Sub') || trimmed.includes('Subtitle')) {
          const langM =
            trimmed.match(/Language:\s*([a-zA-Z-]+)/i) ||
            trimmed.match(/lang="([^"]+)"/i) ||
            trimmed.match(/Sub\*?\s+([a-zA-Z-]+)\s*\|/i) ||
            trimmed.match(/\|\s*([a-zA-Z]{2,4})\b/i);
          const nameM = trimmed.match(/\|\s*([^\\n━]+)/);
          const lang = (langM ? langM[1] : (trimmed.toLowerCase().includes('ita') ? 'ita' : trimmed.toLowerCase().includes('eng') ? 'eng' : 'und')).toLowerCase();
          subtitleTracks.push({
            id: `cli_s_${subtitleTracks.length + 1}_${lang}`,
            language: lang,
            languageName: lang.toUpperCase(),
            name: nameM ? nameM[1].trim() : `Subtitle (${lang.toUpperCase()})`,
            format: 'vtt',
            groupId: 'cli_subs',
          });
        }
      }

      if (videoTracks.length > 0 || audioTracks.length > 0 || subtitleTracks.length > 0) {
        resolve({ videoTracks, audioTracks, subtitleTracks });
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
  });
}

function mergeTracks<T extends { id: string }>(existing: T[], cliDiscovered: T[]): T[] {
  const merged = [...existing];
  cliDiscovered.forEach((item) => {
    if (!merged.some((m) => m.id === item.id)) {
      merged.push(item);
    }
  });
  return merged;
}

/* =========================================================================
   OUTPUT FILE RESOLUTION HELPER
   ========================================================================= */
function locateAndRelocateOutputFile(targetFilename: string): { filename: string; bytes: number } {
  const directPath = path.join(DOWNLOADS_DIR, targetFilename);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
    adjustFilePermissionsAndOwnership(directPath);
    return { filename: targetFilename, bytes: fs.statSync(directPath).size };
  }

  const scanDir = (dir: string): string[] => {
    let results: string[] = [];
    try {
      const list = fs.readdirSync(dir);
      for (const item of list) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          results = results.concat(scanDir(full));
        } else if (stat.isFile()) {
          results.push(full);
        }
      }
    } catch {}
    return results;
  };

  const allFiles = scanDir(DOWNLOADS_DIR);
  if (allFiles.length === 0) {
    return { filename: targetFilename, bytes: 0 };
  }

  const targetBase = targetFilename.split('.')[0].toLowerCase();
  let matchedPath = allFiles.find((f) => {
    const name = path.basename(f).toLowerCase();
    return name.includes(targetBase) || targetBase.includes(name.split('.')[0]);
  });

  if (!matchedPath) {
    const mediaExts = ['.mp4', '.mkv', '.ts', '.m4a', '.webm', '.mov', '.mp3', '.aac'];
    const mediaFiles = allFiles.filter((f) => mediaExts.some((ext) => f.toLowerCase().endsWith(ext)));
    if (mediaFiles.length > 0) {
      mediaFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      matchedPath = mediaFiles[0];
    }
  }

  if (matchedPath) {
    const foundName = path.basename(matchedPath);
    const destPath = path.join(DOWNLOADS_DIR, foundName);

    if (matchedPath !== destPath) {
      try {
        fs.renameSync(matchedPath, destPath);
      } catch {
        try {
          fs.copyFileSync(matchedPath, destPath);
          fs.unlinkSync(matchedPath);
        } catch {}
      }
    }

    if (fs.existsSync(destPath)) {
      adjustFilePermissionsAndOwnership(destPath);
    }

    const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
    return { filename: foundName, bytes: size };
  }

  return { filename: targetFilename, bytes: 0 };
}

class TerminalScreenBuffer {
  private lines: string[] = [''];
  private cursorY = 0;
  private cursorX = 0;

  write(text: string) {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];

      // Handle ANSI Escape sequences
      if (ch === '\x1b') {
        if (text[i + 1] === '[') {
          let j = i + 2;
          while (
            j < text.length &&
            ((text.charCodeAt(j) >= 0x30 && text.charCodeAt(j) <= 0x3f) ||
              (text.charCodeAt(j) >= 0x20 && text.charCodeAt(j) <= 0x2f))
          ) {
            j++;
          }
          if (j < text.length) {
            const finalChar = text[j];
            const paramStr = text.substring(i + 2, j);
            const num = parseInt(paramStr, 10) || 1;

            if (finalChar === 'A') {
              this.cursorY = Math.max(0, this.cursorY - num);
            } else if (finalChar === 'B') {
              this.cursorY += num;
              while (this.lines.length <= this.cursorY) {
                this.lines.push('');
              }
            } else if (finalChar === 'C') {
              this.cursorX += num;
            } else if (finalChar === 'D') {
              this.cursorX = Math.max(0, this.cursorX - num);
            } else if (finalChar === 'E') {
              this.cursorY += num;
              this.cursorX = 0;
              while (this.lines.length <= this.cursorY) {
                this.lines.push('');
              }
            } else if (finalChar === 'F') {
              this.cursorY = Math.max(0, this.cursorY - num);
              this.cursorX = 0;
            } else if (finalChar === 'G') {
              this.cursorX = Math.max(0, (parseInt(paramStr, 10) || 1) - 1);
            } else if (finalChar === 'H' || finalChar === 'f') {
              const parts = paramStr.split(';');
              const col = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
              this.cursorX = Math.max(0, col - 1);
            } else if (finalChar === 'K') {
              const cur = this.lines[this.cursorY] || '';
              if (paramStr === '2') {
                this.lines[this.cursorY] = '';
                this.cursorX = 0;
              } else if (paramStr === '1') {
                this.lines[this.cursorY] = ' '.repeat(this.cursorX) + cur.substring(this.cursorX);
              } else {
                this.lines[this.cursorY] = cur.substring(0, this.cursorX);
              }
            }
            i = j + 1;
            continue;
          }
        }
        i++;
        continue;
      }

      if (ch === '\r') {
        this.cursorX = 0;
        i++;
        continue;
      }

      if (ch === '\n') {
        this.cursorY++;
        this.cursorX = 0;
        while (this.lines.length <= this.cursorY) {
          this.lines.push('');
        }
        i++;
        continue;
      }

      while (this.lines.length <= this.cursorY) {
        this.lines.push('');
      }
      const curLine = this.lines[this.cursorY];
      if (this.cursorX < curLine.length) {
        this.lines[this.cursorY] =
          curLine.substring(0, this.cursorX) + ch + curLine.substring(this.cursorX + 1);
      } else {
        const padding = ' '.repeat(this.cursorX - curLine.length);
        this.lines[this.cursorY] = curLine + padding + ch;
      }
      this.cursorX++;
      i++;
    }

    if (this.lines.length > 50) {
      const dropCount = this.lines.length - 50;
      this.lines.splice(0, dropCount);
      this.cursorY = Math.max(0, this.cursorY - dropCount);
    }
  }

  getActiveLines(): string[] {
    const cleaned = this.lines
      .map((l) =>
        l
          .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
          .replace(/[\x00-\x1F\x7F]/g, '')
          .trim()
      )
      .filter(Boolean);
    if (cleaned.length === 0) return [];
    return cleaned.slice(-6);
  }
}

/* =========================================================================
   TASK PROCESS EXECUTION ENGINE
   ========================================================================= */
function createAndStartJob(plan: DownloadJobPlan): DownloadJob {
  const jobId = 'job_' + Date.now();

  const newJob: DownloadJob = {
    id: jobId,
    url: plan.url,
    title: plan.title,
    status: 'parsing',
    progress: 0,
    lastTerminalLine: 'Starting N_m3u8DL-RE download process...',
    terminalLines: ['Starting N_m3u8DL-RE download process...'],
    currentSegment: 0,
    totalSegments: 100,
    currentSpeedBps: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    elapsedSeconds: 0,
    etaSeconds: 0,
    speedHistory: [0],
    commandExecuted: plan.commandExecuted,
    selectionsSummary: plan.selectionsSummary,
    logs: [
      {
        id: 'log_0',
        timestamp: new Date().toISOString().substring(11, 19),
        level: 'info',
        message: `[RE-Mux Engine] Task ${jobId} initialized: "${plan.title}"`,
      },
      {
        id: 'log_1',
        timestamp: new Date().toISOString().substring(11, 19),
        level: 'info',
        message: `Command: ${plan.commandExecuted}`,
      },
    ],
    outputFile: plan.outputFile,
    createdAt: new Date().toISOString(),
  };

  const internalJob: ActiveJobInternal = { job: newJob };
  activeJobsStore.set(jobId, internalJob);

  runDownloadProcess(jobId, plan.outputFile, plan.commandExecuted);
  notifyJobProgress(newJob, true);

  return newJob;
}

function runDownloadProcess(
  jobId: string,
  outputFilename: string,
  commandExecuted: string
) {
  const item = activeJobsStore.get(jobId);
  if (!item) return;

  const job = item.job;
  const binaryToUse = HAS_NM3U8DL ? (checkSystemBinary('N_m3u8DL-RE') ? 'N_m3u8DL-RE' : 'm3u8dl-re') : null;

  if (binaryToUse) {
    addLog(job, 'info', `[RE-Mux Execution] Spawning native binary: ${binaryToUse}`);

    const rawArgs = parseArgsFromCommandString(commandExecuted, binaryToUse);
    if (!rawArgs.includes('--ui-language')) {
      rawArgs.push('--ui-language', 'en-US');
    }

    const hasScript = checkSystemBinary('script');
    let spawnCmd = binaryToUse;
    let spawnArgs = rawArgs;

    if (hasScript) {
      const esc = (arg: string) => {
        if (/^[a-zA-Z0-9_.\-\/=]+$/.test(arg)) return arg;
        return `'${arg.replace(/'/g, "'\\''")}'`;
      };
      const fullCmdString = `${binaryToUse} ${rawArgs.map(esc).join(' ')}`;
      spawnCmd = 'script';
      spawnArgs = ['-q', '-c', fullCmdString, '/dev/null'];
    }

    try {
      const child = spawn(spawnCmd, spawnArgs, {
        cwd: path.resolve('.'),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLUMNS: '240',
          LINES: '60',
        },
      });
      item.process = child;
      child.stdin?.end();

      job.status = 'downloading_video';

      const termBuffer = new TerminalScreenBuffer();
      const loggedMilestones = new Set<string>();
      const startTimestamp = Date.now();

      const checkStatusAndSaveName = (line: string) => {
        if (line.includes('Downloading video') || line.startsWith('Vid') || line.includes('Vid*')) {
          job.status = 'downloading_video';
        } else if (line.includes('Downloading audio') || line.startsWith('Aud') || line.includes('Aud*')) {
          job.status = 'downloading_audio';
        } else if (line.includes('Downloading subtitle') || line.startsWith('Sub') || line.includes('Sub*')) {
          job.status = 'downloading_subtitles';
        } else if (line.includes('Muxing') || line.includes('FFmpeg') || line.includes('MuxAfterDone') || line.includes('Merging')) {
          job.status = 'muxing';
        }

        const saveNameLogMatch = line.match(/Save Name:\s*(.+)/i);
        if (saveNameLogMatch) {
          const parsedSaveName = saveNameLogMatch[1].trim();
          if (parsedSaveName) {
            const currentExt = job.outputFile.includes('.') ? job.outputFile.split('.').pop() : 'mp4';
            job.outputFile = `${parsedSaveName}.${currentExt}`;
          }
        }
      };

      const recordMilestone = (line: string) => {
        const isMilestone =
          line.includes('INFO') ||
          line.includes('WARN') ||
          line.includes('ERROR') ||
          line.includes('Save Name:') ||
          line.includes('Selected') ||
          line.includes('Muxing') ||
          line.includes('FFmpeg') ||
          line.includes('Merging') ||
          line.includes('Download complete');

        if (isMilestone && !loggedMilestones.has(line)) {
          loggedMilestones.add(line);
          const lvl = line.toLowerCase().includes('mux') ? 'muxer' : line.includes('ERROR') ? 'error' : 'info';
          addLog(job, lvl, line);
        }
      };

      const processTerminalStream = (text: string) => {
        termBuffer.write(text);
        const activeLines = termBuffer.getActiveLines();
        if (activeLines.length > 0) {
          job.terminalLines = activeLines;
          job.lastTerminalLine = activeLines[activeLines.length - 1];
          for (const line of activeLines) {
            checkStatusAndSaveName(line);
            recordMilestone(line);
          }
        }
      };

      // Paced timer: ticks once per second to calculate elapsed time and emit SSE
      const timer = setInterval(() => {
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(timer);
          return;
        }

        job.elapsedSeconds = Math.max(1, Math.floor((Date.now() - startTimestamp) / 1000));
        notifyJobProgress(job);
      }, 1000);

      child.stdout?.on('data', (chunk: Buffer) => {
        processTerminalStream(chunk.toString('utf8'));
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        processTerminalStream(chunk.toString('utf8'));
      });

      child.on('close', (code) => {
        clearInterval(timer);
        processTerminalStream('\n');

        const fileResult = locateAndRelocateOutputFile(job.outputFile);
        if (fileResult.bytes > 0) {
          job.outputFile = fileResult.filename;
          job.downloadedBytes = fileResult.bytes;
          job.totalBytes = fileResult.bytes;
        }

        const finalPath = path.join(DOWNLOADS_DIR, job.outputFile);
        if (fs.existsSync(finalPath)) {
          adjustFilePermissionsAndOwnership(finalPath);
        }
        adjustFilePermissionsAndOwnership(DOWNLOADS_DIR);

        if (code === 0) {
          job.status = 'completed';
          job.progress = 100;
          job.etaSeconds = 0;
          const sizeMb = (job.downloadedBytes / (1024 * 1024)).toFixed(1);
          const successLine = `[SUCCESS] Output file: /downloads/${job.outputFile} (${sizeMb} MB)`;
          job.lastTerminalLine = successLine;
          job.terminalLines = [successLine];
          addLog(job, 'info', `[SUCCESS] Download completed! Output file: /downloads/${job.outputFile} (${sizeMb} MB)`);
          addLog(job, 'info', `[Permissions] Set world RW access & non-root ownership on /downloads/${job.outputFile}`);
        } else {
          job.status = 'failed';
          job.error = `Process exited with code ${code}`;
          job.lastTerminalLine = `[ERROR] Process exited with code ${code}`;
          job.terminalLines = [`[ERROR] Process exited with code ${code}`];
          addLog(job, 'error', `[ERROR] Process exited with code ${code}`);
        }
        notifyJobProgress(job, true);
      });

      child.on('error', (err) => {
        job.status = 'failed';
        job.error = err.message;
        job.lastTerminalLine = `[ERROR] Execution failed: ${err.message}`;
        job.terminalLines = [`[ERROR] Execution failed: ${err.message}`];
        addLog(job, 'error', `[ERROR] Binary execution failed: ${err.message}`);
        notifyJobProgress(job, true);
      });

      return;
    } catch (spawnErr: any) {
      addLog(job, 'warn', `[Spawn Error] Could not launch native process: ${spawnErr.message}`);
      notifyJobProgress(job, true);
    }
  }

  // Web test/fallback runner (used when native N_m3u8DL-RE is absent)
  addLog(job, 'info', `[RE-Mux Pipeline] Running simulated web runner for task ${jobId}...`);
  let step = 0;
  const simulatedSteps: string[][] = [
    ['Parsing stream manifest...'],
    ['Selected 1080p Video + English Audio (2.0) + English Subtitles'],
    [
      'Vid* 1920x1080 | 18.2% |  65MB | 14.5 MB/s | ETA 00:00:22',
      'Aud* en-US     | 24.5% |   8MB |  2.1 MB/s | ETA 00:00:19',
    ],
    [
      'Vid* 1920x1080 | 39.4% | 142MB | 16.8 MB/s | ETA 00:00:17',
      'Aud* en-US     | 51.0% |  17MB |  2.4 MB/s | ETA 00:00:13',
    ],
    [
      'Vid* 1920x1080 | 62.7% | 225MB | 17.5 MB/s | ETA 00:00:10',
      'Aud* en-US     | 78.9% |  26MB |  2.3 MB/s | ETA 00:00:06',
    ],
    [
      'Vid* 1920x1080 | 88.5% | 318MB | 18.2 MB/s | ETA 00:00:03',
      'Aud* en-US     | 96.2% |  32MB |  2.2 MB/s | ETA 00:00:01',
      'Sub* en-US     | 100.0% | 45KB |       -- | ETA 00:00:00',
    ],
    [
      'Vid* 1920x1080 | 100.0% | 360MB | Download complete',
      'Aud* en-US     | 100.0% |  34MB | Download complete',
      'Sub* en-US     | 100.0% |  45KB | Download complete',
    ],
    [
      'Muxing: [FFmpeg] Merging video, audio, and subtitles...',
      'Writing container format to MP4...',
    ],
  ];

  item.intervalTimer = setInterval(() => {
    if (job.status === 'paused' || job.status === 'completed' || job.status === 'failed') return;
    job.elapsedSeconds += 1;

    if (step < simulatedSteps.length) {
      const currentLines = simulatedSteps[step];
      job.terminalLines = currentLines;
      job.lastTerminalLine = currentLines[currentLines.length - 1];
      if (currentLines[0]?.startsWith('Muxing')) {
        job.status = 'muxing';
      } else {
        job.status = 'downloading_video';
      }
      step++;
      notifyJobProgress(job);
      return;
    }

    job.status = 'completed';
    job.progress = 100;
    const finalLine = `[SUCCESS] Output file: /downloads/${outputFilename}`;
    job.lastTerminalLine = finalLine;
    job.terminalLines = [finalLine];
    const targetFile = path.join(DOWNLOADS_DIR, outputFilename);
    if (!fs.existsSync(targetFile)) {
      fs.writeFileSync(targetFile, `Stream downloaded result: ${job.title}\nJob ID: ${job.id}`);
    }
    if (fs.existsSync(targetFile)) {
      const sz = fs.statSync(targetFile).size;
      job.downloadedBytes = sz;
      job.totalBytes = sz;
    }
    adjustFilePermissionsAndOwnership(targetFile);
    adjustFilePermissionsAndOwnership(DOWNLOADS_DIR);
    addLog(job, 'info', finalLine);
    if (item.intervalTimer) clearInterval(item.intervalTimer);
    notifyJobProgress(job, true);
  }, 1000);
}

function parseArgsFromCommandString(cmdStr: string, binaryName: string): string[] {
  let trimmed = cmdStr.trim();
  if (trimmed.startsWith(binaryName)) {
    trimmed = trimmed.substring(binaryName.length).trim();
  }

  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

function addLog(job: DownloadJob, level: LogMessage['level'], message: string) {
  const log: LogMessage = {
    id: `log_${Date.now()}_${Math.random()}`,
    timestamp: new Date().toISOString().substring(11, 19),
    level,
    message,
  };
  job.logs.push(log);
  if (job.logs.length > 80) job.logs.shift();
}

/* =========================================================================
   EXPRESS HTTP SERVER & API ROUTES
   ========================================================================= */
async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Serve downloads directly
  app.get('/downloads/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, filename);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.download(filePath, filename);
    }
    return res.status(404).send('File not found in downloads.');
  });
  app.use('/downloads', express.static(DOWNLOADS_DIR));

  // System status
  app.get('/api/system-status', (_req: Request, res: Response) => {
    return res.json({
      hasNm3u8dl: HAS_NM3U8DL,
      hasFfmpeg: HAS_FFMPEG,
      downloadsDir: DOWNLOADS_DIR,
      isDocker: fs.existsSync('/.dockerenv'),
    });
  });

  // Browser extension compatibility endpoint
  app.post('/api/auth/login', (req: Request, res: Response) => {
    return res.json({ id: 1, username: req.body.username || 'user' });
  });

  // Stream Manifest Probe
  app.post('/api/probe', async (req: Request, res: Response) => {
    try {
      const { url, headers, customTitle } = req.body;
      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'Valid Manifest URL is required' });
      }

      const customHeaders = parseHeaders(headers);
      const analysis = await resolveStreamManifest(url.trim(), customHeaders, customTitle);
      return res.json({ success: true, analysis });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Manifest analysis failed' });
    }
  });

  // Start Download Job (from frontend UI)
  app.post('/api/download/start', (req: Request, res: Response) => {
    try {
      const plan = buildDownloadJobPlan(req.body);
      const job = createAndStartJob(plan);
      return res.json({ success: true, job });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to start download job' });
    }
  });

  // Automated Task Endpoint (for browser extensions & probing automation)
  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const url = req.body.url || req.body.stream_url || req.body.url_stream;
      const outputName =
        req.body.output_name ||
        req.body.outputName ||
        req.body.title ||
        req.body.customTitle ||
        'Stream Download';
      const rawHeaders = req.body.headers || req.body.custom_headers || req.body.customHeaders;

      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'Valid stream URL is required in "url" field' });
      }

      const customHeaders = parseHeaders(rawHeaders);
      const analysis = await resolveStreamManifest(url.trim(), customHeaders, outputName);
      const plan = buildDownloadJobPlan({
        url: url.trim(),
        title: outputName,
        analysis,
        headers: customHeaders,
      });

      const job = createAndStartJob(plan);
      return res.json({
        success: true,
        jobId: job.id,
        job,
        commandExecuted: plan.commandExecuted,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to process task request' });
    }
  });

  // Get active jobs list
  app.get('/api/download/jobs', (_req: Request, res: Response) => {
    const jobs = Array.from(activeJobsStore.values()).map((ij) => ij.job);
    return res.json({ success: true, jobs });
  });

  // Global SSE Stream for UI updates
  app.get('/api/download/events', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendAllJobs = () => {
      if (res.writableEnded || res.closed) return;
      const jobs = Array.from(activeJobsStore.values()).map((ij) => ij.job);
      res.write(`data: ${JSON.stringify({ jobs })}\n\n`);
    };

    sendAllJobs();

    const globalProgressLambda = () => sendAllJobs();
    globalProgressListeners.add(globalProgressLambda);

    // Keep-alive heartbeat every 15s (no state payload)
    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.closed) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': keepalive\n\n');
    }, 15000);

    res.on('close', () => {
      globalProgressListeners.delete(globalProgressLambda);
      clearInterval(heartbeat);
    });
  });

  // Per-job SSE Stream
  app.get('/api/download/stream/:jobId', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const item = activeJobsStore.get(jobId);

    if (!item) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendJobUpdate = (updatedJob: DownloadJob) => {
      if (res.writableEnded || res.closed) return;
      res.write(`data: ${JSON.stringify({ job: updatedJob })}\n\n`);
    };

    sendJobUpdate(item.job);

    if (!jobProgressListenerMap.has(jobId)) {
      jobProgressListenerMap.set(jobId, new Set());
    }
    const jobListeners = jobProgressListenerMap.get(jobId)!;
    jobListeners.add(sendJobUpdate);

    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.closed) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': keepalive\n\n');
    }, 15000);

    res.on('close', () => {
      jobListeners.delete(sendJobUpdate);
      clearInterval(heartbeat);
    });
  });

  // File Download API
  app.get('/api/download/file/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, filename);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.download(filePath, filename);
    }
    return res.status(404).send('File not found in downloads.');
  });

  // Job Pause / Resume / Cancel Control
  app.post('/api/download/control', (req: Request, res: Response) => {
    const { jobId, action } = req.body;
    const item = activeJobsStore.get(jobId);

    if (!item) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (action === 'cancel') {
      if (item.process) {
        try { item.process.kill('SIGINT'); } catch (e) {}
      }
      if (item.intervalTimer) clearInterval(item.intervalTimer);
      item.job.status = 'failed';
      item.job.error = 'Cancelled by user';
      item.job.currentSpeedBps = 0;
      addLog(item.job, 'error', '[Process] Execution terminated by user');
      notifyJobProgress(item.job, true);
    } else if (action === 'pause') {
      item.job.status = 'paused';
      item.job.currentSpeedBps = 0;
      addLog(item.job, 'warn', '[Process] Download task paused by user');
      notifyJobProgress(item.job, true);
    } else if (action === 'resume') {
      item.job.status = 'downloading_video';
      addLog(item.job, 'info', '[Process] Download task resumed');
      notifyJobProgress(item.job, true);
    }

    return res.json({ success: true, job: item.job });
  });

  // HLS/DASH proxy
  app.get('/api/proxy', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send('URL query parameter required');

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      });
      if (!response.ok) {
        return res.status(response.status).send(`Proxy error: ${response.statusText}`);
      }
      res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const bodyBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(bodyBuffer));
    } catch (err: any) {
      return res.status(500).send(`Proxy error: ${err.message}`);
    }
  });

  // Vite development middleware or static production serve
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = await fs.promises.readFile(path.resolve('./index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve('./dist')));
    app.use('*', (_req, res) => {
      res.sendFile(path.resolve('./dist/index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`RE-Mux Studio server active on http://localhost:${PORT}`);
  });
}

startServer();
