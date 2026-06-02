# YouTube Download Tool

A Next.js app for downloading YouTube videos and playlists in any quality, including 4K with audio merged via ffmpeg.

---

## Requirements

The server needs two binaries on `PATH`:

| Binary | Purpose |
|--------|---------|
| `yt-dlp` | Fetches video/audio streams from YouTube |
| `ffmpeg` | Merges video-only (4K/1080p adaptive) streams with audio |

Without both, 4K and high-res downloads will fail. The dependency check runs automatically before `dev`, `build`, and `start`.

---

## Option A — Docker (recommended)

The provided `Dockerfile` installs both dependencies automatically.

```bash
# Build and start
docker compose up --build

# Or in detached mode
docker compose up --build -d
```

The app is available at **http://localhost:3000**.

To stop:
```bash
docker compose down
```

---

## Option B — Run locally

### 1. Install ffmpeg

**macOS (Homebrew)**
```bash
brew install ffmpeg
```

**Ubuntu / Debian**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows**
Download from https://ffmpeg.org/download.html and add to `PATH`.

### 2. Install yt-dlp

**macOS (Homebrew)**
```bash
brew install yt-dlp
```

**Ubuntu / Debian / any Linux**
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

**pip (any OS)**
```bash
pip install yt-dlp
```

**Windows**
Download `yt-dlp.exe` from https://github.com/yt-dlp/yt-dlp/releases and add to `PATH`.

### 3. Start the app

```bash
npm install
npm run dev       # development
npm run build && npm start   # production
```

The pre-flight check will confirm both binaries are found before the server starts:

```
  ✓  ffmpeg   ffmpeg version 8.1 ...
  ✓  yt-dlp   2026.03.17

✅  All dependencies found. Starting server…
```

If a binary is missing you'll see a clear error with install instructions.

---

## How 4K merging works

YouTube serves 4K (and most 1080p) as **separate** video-only and audio-only streams. When you select a `+audio` format:

1. The Next.js API route calls `yt-dlp` with `-f <videoItag>+bestaudio[ext=m4a]`
2. `yt-dlp` downloads both streams to a temp directory
3. `ffmpeg` (invoked internally by `yt-dlp`) muxes them into a single `.mp4`
4. The merged file is streamed back to your browser and the temp files are deleted

This is why `ffmpeg` must be installed — without it, `yt-dlp` cannot mux the two streams.

---

## Keeping yt-dlp up to date

YouTube frequently changes its API. If downloads start failing, update yt-dlp:

```bash
# Homebrew
brew upgrade yt-dlp

# Direct binary
sudo yt-dlp -U

# pip
pip install -U yt-dlp

# Docker — rebuild the image
docker compose up --build
```
