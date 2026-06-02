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

## Global Deployment

The app is packaged as a single Docker image with `ffmpeg` and `yt-dlp` baked in, so any platform that runs Docker containers works.

---

### Option C — VPS (DigitalOcean, Hetzner, Linode, AWS EC2, etc.)

**1. Provision a server** — 1 vCPU / 1 GB RAM minimum; 2 vCPU / 2 GB recommended for concurrent 4K downloads.

**2. Install Docker**
```bash
curl -fsSL https://get.docker.com | sh
```

**3. Copy project files to the server**
```bash
# From your local machine
rsync -av --exclude node_modules --exclude .next \
  . user@YOUR_SERVER_IP:/opt/youtube-download-tool/
```

**4. Build and start**
```bash
# On the server
docker compose -f /opt/youtube-download-tool/docker-compose.yml up --build -d
```

**5. (Optional) Reverse proxy with Nginx + HTTPS**

Install Nginx and Certbot, then create `/etc/nginx/sites-available/ytdl`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;   # needed for large file downloads
        proxy_send_timeout 300s;
        client_max_body_size 0;    # no upload limit
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ytdl /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
sudo systemctl reload nginx
```

---

### Option D — Fly.io (free tier available)

**1. Install flyctl**
```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

**2. Launch the app** (run from the project root)
```bash
fly launch --name youtube-download-tool --region sin --dockerfile Dockerfile
```

When prompted:
- **Deploy now?** → No (tweak config first)

**3. Edit `fly.toml`** — set memory and a persistent tmp volume:
```toml
[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true

[[vm]]
  memory = "2gb"
  cpu_kind = "shared"
  cpus = 1
```

**4. Deploy**
```bash
fly deploy
```

The app will be live at `https://youtube-download-tool.fly.dev`.

---

### Option E — Railway

**1.** Push the repo to GitHub.

**2.** Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub.

**3.** Railway auto-detects the `Dockerfile`. Set environment variables if needed:
```
NODE_ENV=production
PORT=3000
```

**4.** Set the memory limit to at least **1 GB** under the service settings (4K merges are memory-intensive).

Railway provides a public URL automatically on every deploy.

---

### Keeping the deployed image current

YouTube breaks yt-dlp regularly. To update:

```bash
# VPS
docker compose pull && docker compose up --build -d

# Fly.io
fly deploy

# Railway — push a new commit; CI/CD redeploys automatically
```

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
