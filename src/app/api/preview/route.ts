import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const YTDLP = "yt-dlp";

// ─── Security: allowlist YouTube domains ─────────────────────────────────────
const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "youtu.be",
  "m.youtube.com", "music.youtube.com",
];

function isAllowedUrl(raw: string): boolean {
  try {
    const p = new URL(raw);
    if (p.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => p.hostname === h || p.hostname.endsWith(`.${h}`));
  } catch { return false; }
}

const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+/]{1,60}$/;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url    = searchParams.get("url");
    const formatId = searchParams.get("itag") ?? "18";

    if (!url) {
      return Response.json({ error: "url is required" }, { status: 400 });
    }

    const decodedUrl = decodeURIComponent(url);

    if (!isAllowedUrl(decodedUrl)) {
      return Response.json({ error: "Only YouTube URLs are supported." }, { status: 400 });
    }

    if (!FORMAT_ID_RE.test(formatId)) {
      return Response.json({ error: "Invalid format ID." }, { status: 400 });
    }

    // Get the direct stream URL — expires in ~6 hours, fine for preview
    const { stdout } = await execFileAsync(
      YTDLP,
      ["--get-url", "--no-playlist", "-f", formatId, decodedUrl],
      { maxBuffer: 1 * 1024 * 1024, timeout: 15_000 }
    );

    const streamUrl = stdout.trim().split("\n")[0];
    if (!streamUrl || !streamUrl.startsWith("https://")) {
      return Response.json({ error: "Could not resolve stream URL." }, { status: 500 });
    }

    return Response.json({ streamUrl });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get preview URL.";
    console.error("Error in /api/preview:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
