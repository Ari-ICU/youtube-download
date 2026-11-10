# Anivora Media Studio

A modern Next.js web application for downloading public videos, audio tracks, and playlists from YouTube, WeTV, Instagram, Bilibili TV, and X (Twitter) in high quality (including 4K 60fps with automatic FFmpeg audio muxing).

---

## Requirements

The host system needs two command-line tools installed and accessible on `PATH`:

| Binary | Purpose |
|--------|---------|
| `yt-dlp` | Extracts streams and metadata from supported platforms |
| `ffmpeg` | Merges high-resolution adaptive video streams with audio into seekable MP4 containers |

The pre-flight dependency check runs automatically before `npm run dev`, `npm run build`, and `npm start`.

---

## Local Setup

### 1. Install Dependencies

**macOS (Homebrew)**
```bash
brew install ffmpeg yt-dlp
```

**Ubuntu / Debian**
```bash
sudo apt update && sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

**Windows**
- Download FFmpeg: https://ffmpeg.org/download.html
- Download yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
- Add both executables to your system `PATH`.

### 2. Install Node Packages

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

Visit **http://localhost:3000** in your browser.

### 4. Build for Production

```bash
npm run build
npm start
```

---

## Features

- **Multi-Platform Support**: Seamlessly download public media from YouTube, WeTV, Instagram, Bilibili TV, and X.
- **Smart URL Detection**: Automatically detects the platform and adjusts downloader settings when pasting a link.
- **High-Resolution Video Merging**: Downloads and muxes separate 4K / 1080p video and audio streams into standard MP4 files using FFmpeg.
- **Audio Extraction**: Clean M4A standalone audio downloading for music and speech content.
- **Batch Playlist & Feed Downloads**: Extract entire playlists, series, or public feeds and download them packaged as a single ZIP archive.
- **Fast, Streamlined UI**: Clean glassmorphic design built with Tailwind CSS, Framer Motion, and Lucide icons.
- **Secure Architecture**: Server-side allowlist validation and sanitized arguments to protect against SSRF and command injection.
