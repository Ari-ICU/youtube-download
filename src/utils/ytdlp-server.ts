// ─── Shared Server-Side yt-dlp Configuration & Validation ────────────────────

import { execFile, spawn } from "child_process";
import { rm } from "fs/promises";
import { join, resolve } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const YTDLP = "yt-dlp";

export const FORMAT_ID_RE = /^[a-zA-Z0-9\-_.+]{1,60}$/;

export const ALLOWED_HOSTS = [
  // YouTube
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  // TikTok
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
  "m.tiktok.com",
  // Facebook
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.watch",
  "fb.com",
];

export function isAllowedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export function isYouTubeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("youtube.com") || lower.includes("youtu.be") || lower.includes("youtube-nocookie.com");
}

export function isTikTokUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("tiktok.com");
}

export function isFacebookUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("facebook.com") || lower.includes("fb.watch") || lower.includes("fb.com");
}

const YTDLP_YOUTUBE_ARGS = [
  "--extractor-args",
  "youtube:player_client=android_vr,web_safari",
  "--js-runtimes",
  "node",
];

const YTDLP_BASE_ARGS = [
  "--no-warnings",
  "--continue",
  "--retries",
  "10",
  "--fragment-retries",
  "10",
];

export function buildYtDlpArgs(url: string): string[] {
  const args = [...YTDLP_BASE_ARGS];

  if (isYouTubeUrl(url)) {
    args.push(...YTDLP_YOUTUBE_ARGS);
  }

  return args;
}

export function parseUpscaleFormatId(formatId: string): {
  rawFormatId: string;
  upscaleTarget: "4k" | "2k" | null;
} {
  const m = formatId.match(/^(.+)-(4k|2k)$/i);
  if (m) {
    return {
      rawFormatId: m[1],
      upscaleTarget: m[2].toLowerCase() as "4k" | "2k",
    };
  }
  return { rawFormatId: formatId, upscaleTarget: null };
}

export function buildMergeFormatSelector(formatId: string): string {
  const { rawFormatId } = parseUpscaleFormatId(formatId);
  const baseId = rawFormatId.replace(/-[0-9]+$/, "");
  const idPart =
    baseId !== rawFormatId
      ? `${rawFormatId}+140/${rawFormatId}+bestaudio[ext=m4a]/${rawFormatId}+bestaudio/` +
        `${baseId}+140/${baseId}+bestaudio[ext=m4a]/${baseId}+bestaudio/`
      : `${rawFormatId}+140/${rawFormatId}+bestaudio[ext=m4a]/${rawFormatId}+bestaudio/`;

  return (
    idPart +
    `bestvideo[vcodec^=avc1]+140/` +
    `bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/` +
    `bestvideo[height>=2160]+bestaudio[ext=m4a]/` +
    `bestvideo+bestaudio[ext=m4a]/` +
    `bestvideo+bestaudio/best`
  );
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  width?: number;
  height?: number;
}

/**
 * Ensures the final MP4 file is 100% playable in macOS QuickTime Player,
 * iOS, Windows Media Player, and browsers:
 * - Scales to 4K (3840×2160) or 2K (2560×1440) when `upscaleTarget` is set.
 * - Transcodes VP9 / AV1 video streams to H.264 (`avc1`, yuv420p, High profile)
 *   because QuickTime Player hangs on "Loading..." when VP9/AV1 is muxed in MP4.
 * - Re-tags HEVC (`hev1`) streams to `hvc1` via lossless copy so QuickTime plays them.
 * - Converts non-AAC audio (such as Opus) to AAC (`mp4a`) and moves the `moov` atom
 *   to the front of the file (`+faststart`).
 */
export async function ensureQuickTimeMp4(
  inputPath: string,
  tmpDir: string,
  upscaleTarget: "4k" | "2k" | null,
  onStatus?: (label: string) => void,
  onProcess?: (proc: ReturnType<typeof spawn>) => void
): Promise<string> {
  let vCodec = "";
  let vTag = "";
  let aCodec = "";

  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,codec_tag_string,width,height",
      "-of",
      "json",
      inputPath,
    ]);
    const parsed = JSON.parse(stdout) as { streams?: ProbeStream[] };
    const streams = parsed.streams ?? [];
    const vStream = streams.find((s) => s.codec_type === "video");
    const aStream = streams.find((s) => s.codec_type === "audio");
    vCodec = (vStream?.codec_name ?? "").toLowerCase();
    vTag = (vStream?.codec_tag_string ?? "").toLowerCase();
    aCodec = (aStream?.codec_name ?? "").toLowerCase();
  } catch {
    /* If ffprobe fails, fall through and normalize if needed */
  }

  const needsUpscale = upscaleTarget === "4k" || upscaleTarget === "2k";
  const needsVideoTranscode =
    needsUpscale ||
    (vCodec !== "" && vCodec !== "h264" && vCodec !== "hevc");
  const needsHevcTagFix = !needsVideoTranscode && vCodec === "hevc" && vTag !== "hvc1";
  const needsAudioTranscode = aCodec !== "" && aCodec !== "aac";

  // Already QuickTime-native H.264 (or hvc1 HEVC) + AAC audio with no upscale needed
  if (!needsVideoTranscode && !needsHevcTagFix && !needsAudioTranscode) {
    return inputPath;
  }

  const outPath = resolve(join(tmpDir, `qt-ready-${Date.now()}.mp4`));
  const ffArgs: string[] = ["-y", "-i", inputPath];

  if (needsVideoTranscode) {
    const targetLong = upscaleTarget === "4k" ? 3840 : upscaleTarget === "2k" ? 2560 : 0;
    onStatus?.(
      upscaleTarget
        ? `${upscaleTarget.toUpperCase()} UHD encoding…`
        : "Optimizing MP4 for QuickTime…"
    );

    ffArgs.push(
      "-c:v",
      "libx264",
      "-preset",
      "superfast",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-tag:v",
      "avc1",
      "-crf",
      "20"
    );

    if (targetLong > 0) {
      ffArgs.push(
        "-vf",
        `scale='if(gt(iw,ih),${targetLong},-2)':'if(gt(iw,ih),-2,${targetLong})',format=yuv420p`
      );
    }
  } else if (needsHevcTagFix) {
    onStatus?.("Finalizing HEVC MP4…");
    ffArgs.push("-c:v", "copy", "-tag:v", "hvc1");
  } else {
    ffArgs.push("-c:v", "copy");
  }

  if (needsAudioTranscode) {
    ffArgs.push("-c:a", "aac", "-b:a", "192k");
  } else {
    ffArgs.push("-c:a", "copy");
  }

  ffArgs.push("-movflags", "+faststart", outPath);

  const exitCode = await new Promise<number>((res, rej) => {
    const ffProc = spawn("ffmpeg", ffArgs);
    onProcess?.(ffProc);
    ffProc.stdout?.on("data", () => {});
    ffProc.stderr?.on("data", () => {});
    ffProc.on("close", (code) => res(code ?? 1));
    ffProc.on("error", rej);
  });

  if (exitCode === 0) {
    await rm(inputPath, { force: true }).catch(() => {});
    return outPath;
  }

  return inputPath;
}
