# RE-Mux Studio

Stream Downloader & Muxer Web Interface for **N_m3u8DL-RE** and **FFmpeg**.

## Features

- **Stream Manifest Analyzer**: Probe HLS (`.m3u8`), DASH (`.mpd`), and MSS (`.ism`) streams over HTTP to inspect resolutions, bitrates, audio languages, and subtitle tracks.
- **Multi-Track Matrix Selection**: Pick custom video levels, select multiple audio stream tracks (e.g., English 5.1 + Spanish + German), and multiple subtitle tracks to remux into a single MKV/MP4 container.
- **Built-in HLS Live Player**: Preview streams before downloading, with quality level switching, audio track testing, subtitle overlay toggles, and real-time buffer telemetry.
- **Real-Time Task Queue & Terminal Output**: Automatic progress tracking with segment counters (`450/1200`), download speed indicators, ETA calculations, and terminal logs.
- **Dockerized Ready**: Pre-packaged with Node.js, `FFmpeg`, and `N_m3u8DL-RE` Linux binary.

## Quick Start with Docker

### Option 1: Docker Compose (Recommended)

```bash
# Build and launch RE-Mux Studio
docker-compose up -d --build

# Open in browser:
http://localhost:3000
```

Downloaded video and audio files will be saved directly into your local `./downloads` folder on your host system.

### Option 2: Docker CLI

```bash
# Build the image
docker build -t remux-studio .

# Run the container mapping port 3000 and local downloads directory
docker run -d -p 3000:3000 -v $(pwd)/downloads:/app/downloads --name remux-studio remux-studio
```

## Running Locally Without Docker

```bash
# Install dependencies
npm install

# Start Express server & Vite UI
npm run dev
```

*Note: If `N_m3u8DL-RE` or `FFmpeg` are installed on your host OS PATH, RE-Mux Studio will automatically use your native binaries.*
