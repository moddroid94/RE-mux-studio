# Multi-Stage Dockerfile for RE-Mux Studio (N_m3u8DL-RE + FFmpeg + Node.js 24)
FROM node:24-slim AS base

# Install system dependencies: ffmpeg, curl, tar, gzip, ca-certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    tar \
    gzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Download and install N_m3u8DL-RE binary for Linux x64
WORKDIR /tmp
RUN curl -L -o m3u8dl.tar.gz https://github.com/nilaoda/N_m3u8DL-RE/releases/download/v0.6.0-beta/N_m3u8DL-RE_v0.6.0-beta_linux-x64_20260629.tar.gz \
    && tar -xzf m3u8dl.tar.gz \
    && mv N_m3u8DL-RE /usr/local/bin/N_m3u8DL-RE \
    && chmod +x /usr/local/bin/N_m3u8DL-RE \
    && rm -rf /tmp/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy application source
COPY . .

# Build Vite frontend bundle
RUN npm run build

# Create downloads output volume directory
RUN mkdir -p /app/downloads

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "run", "dev"]