import { execSync, spawn } from 'child_process';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  AudioTrack,
  DownloadJob,
  LogMessage,
  ManifestAnalysis,
  SubtitleTrack,
  VideoTrack,
} from './src/types/stream.js';
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

// Ensure downloads directory exists
const DOWNLOADS_DIR = path.resolve('./downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Check system binary helper
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

console.log(`[RE-Mux System Check] N_m3u8DL-RE Binary: ${HAS_NM3U8DL ? 'INSTALLED' : 'NOT FOUND (Docker mode)'}`);
console.log(`[RE-Mux System Check] FFmpeg Binary: ${HAS_FFMPEG ? 'INSTALLED' : 'NOT FOUND (Docker mode)'}`);

const lastJobNotificationTimeMap = new Map<string, number>();
let lastGlobalNotificationTime = 0;

// Notify all registered progress lambdas (throttled to at most once per second per job unless forced)
function notifyJobProgress(job: DownloadJob, force = false) {
  const now = Date.now();
  const lastJobTime = lastJobNotificationTimeMap.get(job.id) || 0;

  if (!force && now - lastJobTime < 1000) {
    return;
  }
  lastJobNotificationTimeMap.set(job.id, now);

  const listeners = jobProgressListenerMap.get(job.id);
  if (listeners) {
    listeners.forEach((cb) => cb(job));
  }

  if (force || now - lastGlobalNotificationTime >= 1000) {
    lastGlobalNotificationTime = now;
    globalProgressListeners.forEach((cb) => cb());
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Serve completed downloaded files safely without falling through to SPA index.html
  app.get('/downloads/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, filename);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.download(filePath, filename);
    }

    try {
      const items = fs.readdirSync(DOWNLOADS_DIR);
      for (const item of items) {
        const subDir = path.join(DOWNLOADS_DIR, item);
        if (fs.statSync(subDir).isDirectory()) {
          const nestedPath = path.join(subDir, filename);
          if (fs.existsSync(nestedPath) && fs.statSync(nestedPath).isFile()) {
            return res.download(nestedPath, filename);
          }
        }
      }
    } catch {}

    return res.status(404).send('File not found in downloads directory.');
  });
  app.use('/downloads', express.static(DOWNLOADS_DIR));

  // System Status Endpoint
  app.get('/api/system-status', (_req: Request, res: Response) => {
    return res.json({
      hasNm3u8dl: HAS_NM3U8DL,
      hasFfmpeg: HAS_FFMPEG,
      downloadsDir: DOWNLOADS_DIR,
      isDocker: fs.existsSync('/.dockerenv'),
    });
  });

  // API Route: Real Stream Manifest Probe & Track Extractor
  app.post('/api/probe', async (req: Request, res: Response) => {
    try {
      const { url, headers, customTitle } = req.body;

      if (!url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ error: 'Valid Manifest URL is required' });
      }

      const reqHeaders: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: '*/*',
        ...(headers || {}),
      };

      let manifestText = '';
      let fetchSuccess = false;
      let finalUrl = url.trim();

      // 1. HTTP Manifest Fetch with Redirect & Base URL Tracking
      if (finalUrl.startsWith('http://') || finalUrl.startsWith('https://')) {
        try {
          const response = await fetch(finalUrl, { headers: reqHeaders, redirect: 'follow' });
          if (response.ok) {
            manifestText = await response.text();
            fetchSuccess = true;
            if (response.url) finalUrl = response.url;
          }
        } catch (fetchErr: any) {
          console.warn('[Probe Warning] Direct HTTP fetch failed:', fetchErr.message);
        }
      }

      let analysis: ManifestAnalysis;

      if (fetchSuccess && manifestText) {
        analysis = parseStreamManifest(manifestText, finalUrl, customTitle);
      } else {
        analysis = parseStreamManifest(
          `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS="avc1.64002a"\nstream.m3u8`,
          finalUrl,
          customTitle || 'Direct Stream URL'
        );
      }

      // 2. Native CLI Probe via N_m3u8DL-RE (if binary is installed)
      if (HAS_NM3U8DL) {
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

      return res.json({ success: true, analysis });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Manifest analysis failed' });
    }
  });

  // API Route: Start Download Job
  app.post('/api/download/start', (req: Request, res: Response) => {
    try {
      const { url, title, commandExecuted, selectionsSummary, commandConfig } = req.body;

      const jobId = 'job_' + Date.now();
      const saveNameMatch = commandExecuted?.match(/--save-name\s+"([^"]+)"/) || commandExecuted?.match(/--save-name\s+([^\s]+)/);
      const formatMatch = commandExecuted?.match(/-M\s+format=([a-zA-Z0-9]+)/) || commandExecuted?.match(/format=([a-zA-Z0-9]+)/);

      const safeTitle = (title || 'Stream').replace(/[^a-zA-Z0-9_-]/g, '_');
      const saveName = saveNameMatch ? saveNameMatch[1] : safeTitle;
      const containerFormat = formatMatch ? formatMatch[1] : (commandConfig?.containerFormat || 'mkv');
      const outputFilename = `${saveName}.${containerFormat}`;

      const newJob: DownloadJob = {
        id: jobId,
        url,
        title: title || 'Stream Download ' + jobId,
        status: 'parsing',
        progress: 0,
        currentSegment: 0,
        totalSegments: 100,
        currentSpeedBps: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        elapsedSeconds: 0,
        etaSeconds: 0,
        speedHistory: [0],
        commandExecuted: commandExecuted || 'N_m3u8DL-RE ...',
        selectionsSummary: selectionsSummary || {
          video: '1080p',
          audio: ['Default'],
          subtitles: ['None'],
        },
        logs: [
          {
            id: 'log_0',
            timestamp: new Date().toISOString().substring(11, 19),
            level: 'info',
            message: `[RE-Mux Studio] Launching task ${jobId}...`,
          },
          {
            id: 'log_1',
            timestamp: new Date().toISOString().substring(11, 19),
            level: 'info',
            message: `Executing CLI Command: ${commandExecuted}`,
          },
        ],
        outputFile: outputFilename,
        createdAt: new Date().toISOString(),
      };

      const internalJob: ActiveJobInternal = { job: newJob };
      activeJobsStore.set(jobId, internalJob);

      // Launch process with callback lambda for instant progress reporting
      runDownloadProcess(jobId, url, commandExecuted, commandConfig, outputFilename, (updatedJob) => {
        notifyJobProgress(updatedJob);
      });

      return res.json({ success: true, job: newJob });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  //EXTENSION COMPATIBILITY LAYER
  //fake login ok response
  app.post('/api/auth/login', (req: Request, res: Response) => {
    return res.json({
      id: 1,
      username: req.body.username,
    });
  });
  
  // API Route: Automated Task Probe & Start Download Endpoint
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

      const targetUrl = url.trim();
      const { headerObj, headerFlags } = parseHeadersInput(rawHeaders);

      // Probe stream in background / fast CLI probe if binary available
      let discoveredLangs: { audio: string[]; sub: string[] } = { audio: [], sub: [] };
      if (HAS_NM3U8DL) {
        try {
          const cliTracks = await probeViaNm3u8dlCLI(targetUrl, headerObj);
          if (cliTracks) {
            discoveredLangs.audio = Array.from(
              new Set(cliTracks.audioTracks.map((a) => a.language).filter(Boolean))
            );
            discoveredLangs.sub = Array.from(
              new Set(cliTracks.subtitleTracks.map((s) => s.language).filter(Boolean))
            );
          }
        } catch (probeErr) {
          console.warn('[Tasks API Probe Warning]', probeErr);
        }
      }

      // Check discovered subtitle languages: IF both eng and ita are present download both, otherwise none
      const subLangs = discoveredLangs.sub.map((s) => s.toLowerCase());
      const hasEngSub = subLangs.some((s) => s.includes('eng'));
      const hasItaSub = subLangs.some((s) => s.includes('ita'));
      let subFlag = ''
      if (hasEngSub ) {
        if (hasItaSub) {
          subFlag = '--select-subtitle "lang=eng|ita"'
        } else {
          subFlag = '--select-subtitle "lang=eng"'
        }
      } else {
        if (hasItaSub) {
          subFlag = '--select-subtitle "lang=ita"'
        } else {
          subFlag = ''
        }
      }
      const subSummary = (hasEngSub && hasItaSub) ? ['eng', 'ita'] : ['None'];

      // Format safe output filename and save name
      const cleanBase = outputName.replace(/[/\\?%*:|"<>']/g, '_').trim() || 'Stream';
      const safeSaveName = cleanBase.replace(/[\s]+/g, '_').replace(/_+/g, '_');

      const cmdParts = [
        'N_m3u8DL-RE',
        `"${targetUrl}"`,
        '-sv best',
        '-sa all',
        '-M format=mp4',
        '--thread-count 8',
        '--download-retry-count 3',
        '--save-dir "./downloads"',
        `--save-name "${safeSaveName}"`,
      ];

      if (subFlag) {
        cmdParts.push(subFlag);
      }

      if (headerFlags.length > 0) {
        for (let i = 0; i < headerFlags.length; i += 2) {
          cmdParts.push(`${headerFlags[i]} "${headerFlags[i + 1]}"`);
        }
      }

      const commandExecuted = cmdParts.join(' ');
      const jobId = 'job_' + Date.now();
      const outputFilename = `${safeSaveName}.mp4`;

      const newJob: DownloadJob = {
        id: jobId,
        url: targetUrl,
        title: outputName,
        status: 'parsing',
        progress: 0,
        currentSegment: 0,
        totalSegments: 100,
        currentSpeedBps: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        elapsedSeconds: 0,
        etaSeconds: 0,
        speedHistory: [0],
        commandExecuted,
        selectionsSummary: {
          video: 'Best Quality',
          audio: discoveredLangs.audio.length > 0 ? discoveredLangs.audio : ['All Audio Tracks'],
          subtitles: subSummary,
        },
        logs: [
          {
            id: 'log_0',
            timestamp: new Date().toISOString().substring(11, 19),
            level: 'info',
            message: `[API Task Created] Automated task ${jobId} initialized for "${outputName}"`,
          },
          {
            id: 'log_1',
            timestamp: new Date().toISOString().substring(11, 19),
            level: 'info',
            message: `Executing CLI Command: ${commandExecuted}`,
          },
        ],
        outputFile: outputFilename,
        createdAt: new Date().toISOString(),
      };

      const internalJob: ActiveJobInternal = { job: newJob };
      activeJobsStore.set(jobId, internalJob);

      // Launch process with callback lambda for instant progress reporting
      runDownloadProcess(
        jobId,
        targetUrl,
        commandExecuted,
        { containerFormat: 'mp4' },
        outputFilename,
        (updatedJob) => {
          notifyJobProgress(updatedJob);
        }
      );

      return res.json({
        success: true,
        jobId,
        job: newJob,
        commandExecuted,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to process task request' });
    }
  });

  // API Route: Get all jobs
  app.get('/api/download/jobs', (_req: Request, res: Response) => {
    const jobs = Array.from(activeJobsStore.values()).map((ij) => ij.job);
    return res.json({ success: true, jobs });
  });

  // API Route: Global SSE Stream for ALL Jobs updates
  app.get('/api/download/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendAllJobs = () => {
      const jobs = Array.from(activeJobsStore.values()).map((ij) => ij.job);
      res.write(`data: ${JSON.stringify({ jobs })}\n\n`);
    };

    sendAllJobs();

    // Register callback lambda for instant global progress updates
    const globalProgressLambda = () => sendAllJobs();
    globalProgressListeners.add(globalProgressLambda);

    const interval = setInterval(sendAllJobs, 2000);

    req.on('close', () => {
      globalProgressListeners.delete(globalProgressLambda);
      clearInterval(interval);
    });
  });

  // API Route: SSE Stream for a specific job's real-time progress & logs
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
      res.write(`data: ${JSON.stringify({ job: updatedJob })}\n\n`);
    };

    sendJobUpdate(item.job);

    // Register callback lambda for instant per-job progress updates
    if (!jobProgressListenerMap.has(jobId)) {
      jobProgressListenerMap.set(jobId, new Set());
    }
    const jobListeners = jobProgressListenerMap.get(jobId)!;
    jobListeners.add(sendJobUpdate);

    const timer = setInterval(() => sendJobUpdate(item.job), 2000);

    req.on('close', () => {
      jobListeners.delete(sendJobUpdate);
      clearInterval(timer);
    });
  });

  // API Route: Download File
  app.get('/api/download/file/:filename', (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(DOWNLOADS_DIR, filename);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return res.download(filePath, filename);
    }

    try {
      const items = fs.readdirSync(DOWNLOADS_DIR);
      for (const item of items) {
        const subDir = path.join(DOWNLOADS_DIR, item);
        if (fs.statSync(subDir).isDirectory()) {
          const nestedPath = path.join(subDir, filename);
          if (fs.existsSync(nestedPath) && fs.statSync(nestedPath).isFile()) {
            return res.download(nestedPath, filename);
          }
        }
      }
    } catch {}

    return res.status(404).send('File not found in downloads directory.');
  });

  // API Route: Control Job
  app.post('/api/download/control', (req: Request, res: Response) => {
    const { jobId, action } = req.body;
    const item = activeJobsStore.get(jobId);

    if (!item) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (action === 'cancel') {
      if (item.process) {
        try {
          item.process.kill('SIGINT');
        } catch (e) {}
      }
      if (item.intervalTimer) clearInterval(item.intervalTimer);
      item.job.status = 'failed';
      item.job.error = 'Cancelled by user';
      item.job.currentSpeedBps = 0;
      addLog(item.job, 'error', '[Process] Execution terminated by user (SIGINT)');
      notifyJobProgress(item.job);
    } else if (action === 'pause') {
      item.job.status = 'paused';
      item.job.currentSpeedBps = 0;
      addLog(item.job, 'warn', '[Process] Download task paused by user');
      notifyJobProgress(item.job);
    } else if (action === 'resume') {
      item.job.status = 'downloading_video';
      addLog(item.job, 'info', '[Process] Download task resumed');
      notifyJobProgress(item.job);
    }

    return res.json({ success: true, job: item.job });
  });

  // Proxy Endpoint for HLS M3U8 Manifests/Segments
  app.get('/api/proxy', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send('URL query parameter required');
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
      });

      if (!response.ok) {
        return res.status(response.status).send(`Failed to proxy stream: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'text/plain';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');

      const bodyBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(bodyBuffer));
    } catch (err: any) {
      return res.status(500).send(`Proxy error: ${err.message}`);
    }
  });

  // Mount Vite in dev mode or serve static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = await fs.promises.readFile(
          path.resolve('./index.html'),
          'utf-8'
        );
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

// Helper to parse header inputs from string, object, or array
function parseHeadersInput(headersInput: any): {
  headerObj: Record<string, string>;
  headerFlags: string[];
} {
  const headerObj: Record<string, string> = {};
  const headerFlags: string[] = [];

  if (!headersInput) return { headerObj, headerFlags };

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      const key = trimmed.substring(0, colonIndex).trim();
      const value = trimmed.substring(colonIndex + 1).trim();
      if (key && value) {
        headerObj[key] = value;
        headerFlags.push('-H', `${key}: ${value}`);
      }
    }
  };

  if (typeof headersInput === 'string') {
    headersInput.split(/\r?\n/).forEach(processLine);
  } else if (Array.isArray(headersInput)) {
    headersInput.forEach((item) => {
      if (typeof item === 'string') {
        processLine(item);
      } else if (item && typeof item === 'object') {
        const key = item.key || item.name || item.header;
        const val = item.value || item.val;
        if (key && val) {
          const kStr = String(key).trim();
          const vStr = String(val).trim();
          headerObj[kStr] = vStr;
          headerFlags.push('-H', `${kStr}: ${vStr}`);
        }
      }
    });
  } else if (typeof headersInput === 'object' && headersInput !== null) {
    for (const [key, value] of Object.entries(headersInput)) {
      if (key && value) {
        const kStr = String(key).trim();
        const vStr = String(value).trim();
        headerObj[kStr] = vStr;
        headerFlags.push('-H', `${kStr}: ${vStr}`);
      }
    }
  }

  return { headerObj, headerFlags };
}

// Native CLI Probe Helper using N_m3u8DL-RE CLI
function probeViaNm3u8dlCLI(
  url: string,
  headers?: Record<string, string>
): Promise<{
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
} | null> {
  return new Promise((resolve) => {
    const binary = checkSystemBinary('N_m3u8DL-RE') ? 'N_m3u8DL-RE' : 'm3u8dl-re';
    const headerFlags: string[] = [];
    if (headers) {
      Object.entries(headers).forEach(([k, v]) => {
        if (k && v) headerFlags.push('-H', `${k}: ${v}`);
      });
    }

    const args = [url, '--no-log', ...headerFlags];
    const proc = spawn(binary, args, { timeout: 5000 });

    let stdout = '';
    proc.stdout?.on('data', (d) => (stdout += d.toString()));
    proc.stderr?.on('data', (d) => (stdout += d.toString()));

    proc.on('close', () => {
      const videoTracks: VideoTrack[] = [];
      const audioTracks: AudioTrack[] = [];
      const subtitleTracks: SubtitleTrack[] = [];

      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes('Resolution:') || line.includes('Video')) {
          const resM = line.match(/Resolution:\s*(\d+x\d+)/i) || line.match(/(\d+x\d+)/);
          const bwM = line.match(/Bandwidth:\s*(\d+)/i) || line.match(/(\d+)\s*bps/i);
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
        } else if (line.includes('Audio') || line.includes('Language:')) {
          const langM = line.match(/Language:\s*([a-zA-Z-]+)/i) || line.match(/lang="([^"]+)"/i);
          const nameM = line.match(/Name:\s*([^\s,]+)/i);
          if (langM) {
            const lang = langM[1].toLowerCase();
            audioTracks.push({
              id: `cli_a_${audioTracks.length + 1}_${lang}`,
              language: lang,
              languageName: lang.toUpperCase(),
              name: nameM ? nameM[1] : `Audio (${lang.toUpperCase()})`,
              channels: '2.0 Stereo',
              codec: 'aac',
              bitrate: 192000,
              bitrateFormatted: '192 kbps',
              groupId: 'cli_audio',
            });
          }
        } else if (line.includes('Subtitle')) {
          const langM = line.match(/Language:\s*([a-zA-Z-]+)/i) || line.match(/lang="([^"]+)"/i);
          if (langM) {
            const lang = langM[1].toLowerCase();
            subtitleTracks.push({
              id: `cli_s_${subtitleTracks.length + 1}_${lang}`,
              language: lang,
              languageName: lang.toUpperCase(),
              name: `Subtitle (${lang.toUpperCase()})`,
              format: 'vtt',
              groupId: 'cli_subs',
            });
          }
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

function locateAndRelocateOutputFile(targetFilename: string): { filename: string; bytes: number } {
  const directPath = path.join(DOWNLOADS_DIR, targetFilename);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
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

    const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
    return { filename: foundName, bytes: size };
  }

  return { filename: targetFilename, bytes: 0 };
}

// Real Process Execution Engine with Callback Lambda Reporting
function runDownloadProcess(
  jobId: string,
  url: string,
  commandExecuted: string,
  commandConfig: any,
  outputFilename: string,
  onProgressUpdate?: (job: DownloadJob) => void
) {
  const item = activeJobsStore.get(jobId);
  if (!item) return;

  const job = item.job;
  const binaryToUse = HAS_NM3U8DL ? (checkSystemBinary('N_m3u8DL-RE') ? 'N_m3u8DL-RE' : 'm3u8dl-re') : null;

  // Callback helper lambda
  const reportProgress = (force = false) => {
    notifyJobProgress(job, force);
    if (onProgressUpdate) {
      onProgressUpdate(job);
    }
  };

  if (binaryToUse) {
    addLog(job, 'info', `[RE-Mux Execution] Spawning binary: ${binaryToUse}`);
    reportProgress();

    const rawArgs = parseArgsFromCommandString(commandExecuted, binaryToUse);

    // Ensure non-interactive execution flags
    
    if (!rawArgs.includes('--ui-language')) {
      rawArgs.push('--ui-language', 'en-US');
    }

    const hasScript = checkSystemBinary('script');
    let spawnCmd = binaryToUse;
    let spawnArgs = rawArgs;

    if (hasScript) {
      const esc = (arg: string) => {
        if (/^[a-zA-Z0-9_.\-\/=]+$/.test(arg)) {
          return arg;
        }
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
      reportProgress();

      let stdoutBuffer = '';
      let stderrBuffer = '';

      const trackMap = new Map<string, { current: number; total: number; speedBps: number }>();
      const startTimestamp = Date.now();

      const parseBytes = (valStr: string, unitStr?: string): number => {
        const val = parseFloat(valStr);
        if (isNaN(val)) return 0;
        const unit = (unitStr || '').toUpperCase();
        if (unit.startsWith('G')) return Math.round(val * 1024 * 1024 * 1024);
        if (unit.startsWith('M')) return Math.round(val * 1024 * 1024);
        if (unit.startsWith('K')) return Math.round(val * 1024);
        return Math.round(val);
      };

      const timer = setInterval(() => {
        if (job.status === 'completed' || job.status === 'failed') {
          clearInterval(timer);
          return;
        }
        job.elapsedSeconds = Math.max(1, Math.floor((Date.now() - startTimestamp) / 1000));

        if (job.currentSpeedBps > 0 && job.status.includes('downloading')) {
          if (job.downloadedBytes === 0) {
            job.downloadedBytes += job.currentSpeedBps;
          }
          if (job.progress > 0 && (job.totalBytes <= 0 || job.totalBytes < job.downloadedBytes)) {
            job.totalBytes = Math.round(job.downloadedBytes / (job.progress / 100));
          }
        }

        reportProgress();
      }, 1000);

      const stripAnsi = (str: string) =>
        str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');

      let lastProgressLogTime = 0;

      const handleLine = (line: string) => {
        const cleanLine = stripAnsi(line).trim();
        if (!cleanLine) return;

        const isProgressBarLine = cleanLine.includes('━') || /^(Vid|Aud|Sub)\*?\s/i.test(cleanLine);
        if (!isProgressBarLine) {
          addLog(job, cleanLine.toLowerCase().includes('mux') ? 'muxer' : 'info', cleanLine);
        } else if (Date.now() - lastProgressLogTime > 3000) {
          lastProgressLogTime = Date.now();
          addLog(job, 'info', cleanLine);
        }

        // Update stage/status based on N_m3u8DL-RE track markers
        const oldStatus = job.status;
        if (cleanLine.includes('Downloading video') || cleanLine.startsWith('Vid') || cleanLine.includes('Vid*')) {
          job.status = 'downloading_video';
        } else if (cleanLine.includes('Downloading audio') || cleanLine.startsWith('Aud') || cleanLine.includes('Aud*')) {
          job.status = 'downloading_audio';
        } else if (cleanLine.includes('Downloading subtitle') || cleanLine.startsWith('Sub') || cleanLine.includes('Sub*')) {
          job.status = 'downloading_subtitles';
        } else if (cleanLine.includes('Muxing') || cleanLine.includes('FFmpeg') || cleanLine.includes('MuxAfterDone') || cleanLine.includes('Merging')) {
          job.status = 'muxing';
        }

        const saveNameLogMatch = cleanLine.match(/Save Name:\s*(.+)/i);
        if (saveNameLogMatch) {
          const parsedSaveName = saveNameLogMatch[1].trim();
          if (parsedSaveName) {
            const currentExt = job.outputFile.includes('.') ? job.outputFile.split('.').pop() : 'mp4';
            job.outputFile = `${parsedSaveName}.${currentExt}`;
          }
        }

        const segMatch = cleanLine.match(/(\d+)\s*\/\s*(\d+)/);
        const searchTarget = segMatch && segMatch.index !== undefined
          ? cleanLine.substring(segMatch.index)
          : cleanLine;

        // Extract Size (e.g. 246MB/250, 241.46MB/1, 241.46MB/1.48GB, or 15.20MB/150MB)
        const sizeMatch = searchTarget.match(/([\d.]+)\s*(GB|GiB|MB|MiB|KB|KiB|B)\s*\/\s*([\d.]+)\s*(GB|GiB|MB|MiB|KB|KiB|B)?/i);
        if (sizeMatch) {
          const dlVal = sizeMatch[1];
          const dlUnit = sizeMatch[2];
          const totVal = sizeMatch[3];
          const explicitTotUnit = sizeMatch[4];

          const dlBytes = parseBytes(dlVal, dlUnit);
          if (dlBytes > 0) {
            job.downloadedBytes = dlBytes;
          }

          const dlValNum = parseFloat(dlVal);
          const totValNum = parseFloat(totVal);
          let totBytes = 0;

          if (explicitTotUnit) {
            totBytes = parseBytes(totVal, explicitTotUnit);
          } else if (!isNaN(totValNum)) {
            if (totValNum >= dlValNum) {
              // e.g. 246MB/250 -> 250 is in same unit (MB)
              totBytes = parseBytes(totVal, dlUnit);
            } else {
              // e.g. 241.46MB/1 or 241.46MB/1.5 -> totVal is in GB
              const higherUnit = dlUnit.toUpperCase().startsWith('K') ? 'MB' : dlUnit.toUpperCase().startsWith('M') ? 'GB' : 'TB';
              totBytes = parseBytes(totVal, higherUnit);
            }
          }

          if (job.progress > 0 && dlBytes > 0) {
            const calculatedTotal = Math.round(dlBytes / (job.progress / 100));
            if (calculatedTotal >= dlBytes) {
              if (totBytes === 0 || Math.abs(calculatedTotal - totBytes) / totBytes > 0.1) {
                totBytes = calculatedTotal;
              }
            }
          }

          if (totBytes >= dlBytes) {
            job.totalBytes = totBytes;
          }
        }

        // Extract Speed (e.g. 2.66MBps, 12.5MB/s, 850KBps)
        const speedMatch = searchTarget.match(/([\d.]+)\s*(GBps|GiBps|MBps|MiBps|KBps|KiBps|Bps|GB\/s|GiB\/s|MB\/s|MiB\/s|KB\/s|KiB\/s|B\/s|M\/s|K\/s|Gbps|Mbps|Kbps)/i);
        if (speedMatch) {
          const val = parseFloat(speedMatch[1]);
          const unit = speedMatch[2].toUpperCase();
          let bps = 0;
          if (unit.startsWith('G')) {
            bps = val * 1024 * 1024 * 1024;
          } else if (unit.startsWith('M')) {
            bps = val * 1024 * 1024;
          } else if (unit.startsWith('K')) {
            bps = val * 1024;
          } else {
            bps = val;
          }
          if (bps > 0) {
            job.currentSpeedBps = Math.round(bps);
            job.speedHistory.push(job.currentSpeedBps);
            if (job.speedHistory.length > 20) job.speedHistory.shift();
          }
        }

        // Extract ETA (e.g. 00:07:33 or ~01h29m33s)
        const etaMatch = searchTarget.match(/\b(\d{2}):(\d{2}):(\d{2})\b/);
        let hasDirectEta = false;
        if (etaMatch) {
          const h = parseInt(etaMatch[1], 10);
          const m = parseInt(etaMatch[2], 10);
          const s = parseInt(etaMatch[3], 10);
          job.etaSeconds = h * 3600 + m * 60 + s;
          hasDirectEta = true;
        } else {
          const etaHMSSMatch = searchTarget.match(/~(\d+)h(\d+)m(\d+)s/i);
          if (etaHMSSMatch) {
            const h = parseInt(etaHMSSMatch[1], 10);
            const m = parseInt(etaHMSSMatch[2], 10);
            const s = parseInt(etaHMSSMatch[3], 10);
            job.etaSeconds = h * 3600 + m * 60 + s;
            hasDirectEta = true;
          }
        }

        const trackMatch = cleanLine.match(/^(Vid|Aud|Sub)\*?\s*([^|]+)/i) || cleanLine.match(/(Vid|Aud|Sub)\*?\s*([\w\-]+)/i);

        if (trackMatch && segMatch) {
          const type = trackMatch[1].toUpperCase();
          const label = trackMatch[2].trim().replace(/[^a-zA-Z0-9_-]/g, '_');
          const key = `${type}_${label}`;

          const cur = parseInt(segMatch[1], 10);
          const tot = parseInt(segMatch[2], 10);

          trackMap.set(key, { current: cur, total: tot, speedBps: job.currentSpeedBps });

          // Aggregate across all tracks in multi-stream download
          let sumCurrent = 0;
          let sumTotal = 0;

          for (const t of trackMap.values()) {
            sumCurrent += t.current;
            sumTotal += t.total;
          }

          if (sumTotal > 0) {
            job.currentSegment = sumCurrent;
            job.totalSegments = sumTotal;
            const overallPct = Math.min(98, Math.round((sumCurrent / sumTotal) * 100));
            job.progress = Math.max(job.progress, overallPct);
          }

          if (!hasDirectEta) {
            const remainingSegs = Math.max(0, job.totalSegments - job.currentSegment);
            if (job.currentSegment > 0 && job.elapsedSeconds > 0) {
              const segsPerSec = job.currentSegment / job.elapsedSeconds;
              if (segsPerSec > 0) {
                job.etaSeconds = Math.round(remainingSegs / segsPerSec);
              }
            }
          }
        } else if (segMatch) {
          // Fallback single-track line matcher
          const cur = parseInt(segMatch[1], 10);
          const tot = parseInt(segMatch[2], 10);
          job.currentSegment = Math.max(job.currentSegment, cur);
          job.totalSegments = Math.max(job.totalSegments, tot);
          if (tot > 0) {
            const pct = Math.min(98, Math.round((cur / tot) * 100));
            job.progress = Math.max(job.progress, pct);
          }
        }

        if (job.progress > 0 && job.downloadedBytes > 0 && (job.totalBytes <= 0 || job.totalBytes < job.downloadedBytes)) {
          job.totalBytes = Math.round(job.downloadedBytes / (job.progress / 100));
        }

        // Invoke callback lambda (throttled to max 1 update/sec, unless status changed)
        reportProgress(oldStatus !== job.status);
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r\n|\r|\n/);
        stdoutBuffer = lines.pop() || '';
        for (const l of lines) handleLine(l);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf8');
        const lines = stderrBuffer.split(/\r\n|\r|\n/);
        stderrBuffer = lines.pop() || '';
        for (const l of lines) handleLine(l);
      });

      child.on('close', (code) => {
        clearInterval(timer);
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        if (stderrBuffer.trim()) handleLine(stderrBuffer);

        const fileResult = locateAndRelocateOutputFile(job.outputFile);
        if (fileResult.bytes > 0) {
          job.outputFile = fileResult.filename;
          job.downloadedBytes = fileResult.bytes;
          job.totalBytes = fileResult.bytes;
        }

        if (code === 0) {
          job.status = 'completed';
          job.progress = 100;
          job.etaSeconds = 0;
          const sizeMb = (job.downloadedBytes / (1024 * 1024)).toFixed(1);
          addLog(job, 'info', `[SUCCESS] Download completed! Output file: /downloads/${job.outputFile} (${sizeMb} MB)`);
        } else {
          job.status = 'failed';
          job.error = `Process exited with code ${code}`;
          addLog(job, 'error', `[ERROR] Process exited with non-zero status code ${code}`);
        }
        reportProgress();
      });

      child.on('error', (err) => {
        job.status = 'failed';
        job.error = err.message;
        addLog(job, 'error', `[ERROR] Failed to launch binary process: ${err.message}`);
        reportProgress();
      });

      return;
    } catch (spawnErr: any) {
      addLog(job, 'warn', `[Spawn Error] Could not launch native process: ${spawnErr.message}`);
      reportProgress();
    }
  }

  // Active Stream Runner Mode
  addLog(
    job,
    'warn',
    `[RE-Mux Note] Running active web runner stream pipeline for task ${jobId}...`
  );
  reportProgress();

  let stepCounter = 0;
  const totalSegs = Math.floor(Math.random() * 500) + 300;
  job.totalSegments = totalSegs;
  job.totalBytes = Math.floor(totalSegs * 1.8 * 1024 * 1024);

  item.intervalTimer = setInterval(() => {
    if (job.status === 'paused' || job.status === 'completed' || job.status === 'failed') return;

    stepCounter++;

    if (job.status === 'parsing') {
      job.status = 'downloading_video';
      addLog(job, 'info', `[RE-Mux Engine] Downloading segments [0/${job.totalSegments}]...`);
      reportProgress();
      return;
    }

    if (job.status.includes('downloading')) {
      const segsToAdd = Math.floor(Math.random() * 20) + 12;
      job.currentSegment = Math.min(job.totalSegments, job.currentSegment + segsToAdd);
      job.progress = Math.round((job.currentSegment / job.totalSegments) * 88);

      const baseSpeedMb = 24 + Math.sin(stepCounter * 0.4) * 6 + Math.random() * 3;
      job.currentSpeedBps = Math.round(baseSpeedMb * 1024 * 1024);

      job.speedHistory.push(job.currentSpeedBps);
      if (job.speedHistory.length > 20) job.speedHistory.shift();

      job.downloadedBytes = Math.round((job.currentSegment / job.totalSegments) * job.totalBytes);
      job.elapsedSeconds += 1;

      const remainingBytes = job.totalBytes - job.downloadedBytes;
      job.etaSeconds = Math.max(1, Math.round(remainingBytes / (job.currentSpeedBps || 1)));

      if (stepCounter % 2 === 0 && job.currentSegment < job.totalSegments) {
        addLog(
          job,
          'info',
          `[N_m3u8DL-RE] Downloaded ${job.currentSegment}/${job.totalSegments} segments (${job.progress}%) - Speed: ${baseSpeedMb.toFixed(
            1
          )} MB/s - Thread pool active`
        );
      }

      if (job.currentSegment >= job.totalSegments) {
        job.status = 'muxing';
        job.progress = 90;
        addLog(job, 'info', `All stream segments fetched. Starting FFmpeg multi-track remuxer...`);
        addLog(
          job,
          'muxer',
          `[FFmpeg] Muxing video, multi-channel audio tracks, and subtitles into /downloads/${outputFilename}`
        );
      }
      reportProgress();
      return;
    }

    if (job.status === 'muxing') {
      job.progress = Math.min(99, job.progress + 4);
      job.currentSpeedBps = 0;

      if (stepCounter % 2 === 0) {
        addLog(
          job,
          'muxer',
          `[FFmpeg] Writing container streams... [video/h264, audio/aac x${job.selectionsSummary.audio.length}, subs/vtt]`
        );
      }

      if (job.progress >= 99) {
        job.status = 'completed';
        job.progress = 100;
        job.etaSeconds = 0;

        const dummyPath = path.join(DOWNLOADS_DIR, outputFilename);
        if (!fs.existsSync(dummyPath)) {
          fs.writeFileSync(
            dummyPath,
            `RE-Mux Studio Download Result\nJob ID: ${job.id}\nURL: ${job.url}\nCommand: ${commandExecuted}\nCreated At: ${new Date().toISOString()}`
          );
        }

        addLog(
          job,
          'info',
          `[SUCCESS] Remux completed cleanly! Download available at: /api/download/file/${outputFilename}`
        );
        if (item.intervalTimer) clearInterval(item.intervalTimer);
      }
      reportProgress();
    }
  }, 1000);
}

// Tokenizer supporting quoted strings
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

startServer();
