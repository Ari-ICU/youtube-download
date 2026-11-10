# Anivora — Video & Playlist Downloader

A modern Next.js web application for downloading high-definition videos, playlists, audio, and series from **YouTube**, **WeTV**, **Bilibili TV**, **Instagram**, and **X (Twitter)** with high-speed processing and automatic audio/video muxing via FFmpeg.

---

## Prerequisites

The application requires two command-line utilities installed on your system:

| Utility | Purpose |
|---------|---------|
| `yt-dlp` | Extracts media streams and metadata from supported platforms |
| `ffmpeg` | Remuxes and merges separate video and audio streams (e.g. 1080p, 4K, HLS) |

A dependency check automatically validates these binaries before `dev`, `build`, and `start`.

---

## Quick Start (Local Setup)

### 1. Install Dependencies

**macOS (Homebrew):**
```bash
brew install ffmpeg yt-dlp
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

**Windows:**
- Install [ffmpeg](https://ffmpeg.org/download.html) (or `choco install ffmpeg` / `scoop install ffmpeg`)
- Install [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) (or `winget install yt-dlp`)
- Ensure both are added to your system `PATH`.

### 2. Install Node.js Packages & Run

```bash
# Install node packages
npm install

# Run development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Production Build

```bash
npm run build
npm start
```

---

## VIP & Authenticated Content Access

Platforms like **WeTV** (to avoid the 4-minute preview restriction) and **Bilibili TV** (to access 1080p+ and VIP episodes) require an authenticated session from a subscriber account:

1. Click **VIP Cookies** in the top navigation bar.
2. Either upload your exported `cookies.txt` file or paste Netscape-formatted cookie text directly.
3. You can export cookies using browser extensions like [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) while logged into your account.
4. Once active, all downloads will automatically use your authenticated session to fetch full-length VIP content in full resolution.

---

## Geo-Restriction Bypass

Toggle the **Bypass Global** switch in the top bar to inject region-forwarding headers (`X-Forwarded-For`, `CF-Connecting-IP`) and enable geo-bypass mode in `yt-dlp` for regional libraries (such as WeTV Thailand/Southeast Asia and Bilibili TV).

---

## Updating `yt-dlp`

Streaming platforms frequently update their web players and protections. If extraction errors occur, update `yt-dlp` to the latest version:

```bash
# Homebrew
brew upgrade yt-dlp

# Direct binary
sudo yt-dlp -U

# pip
pip install -U yt-dlp
```
