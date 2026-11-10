import type { DownloadState, Platform } from "@/types";

// ─── URL & Image Proxy Helpers ────────────────────────────────────────────────

export function getProxyUrl(url?: string): string {
  if (!url) return "/logo.png";
  const lower = url.toLowerCase();
  if (
    lower.includes("fbcdn.net") ||
    lower.includes("fbsbx.com") ||
    lower.includes("facebook.com") ||
    lower.includes("tiktokcdn.com") ||
    lower.includes("tiktokcdn-us.com") ||
    lower.includes("tiktokcdn-eu.com") ||
    lower.includes("musical.ly") ||
    lower.includes("ibytedtos.com") ||
    lower.includes("byteimg.com")
  ) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

export function detectPlatformFromUrl(rawUrl: string): Platform | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      return "youtube";
    }
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return "tiktok";
    }
    if (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.watch" ||
      host.endsWith(".fb.watch") ||
      host === "fb.com" ||
      host.endsWith(".fb.com")
    ) {
      return "facebook";
    }
  } catch {
    const lower = rawUrl.toLowerCase();
    if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
    if (lower.includes("tiktok.com")) return "tiktok";
    if (lower.includes("facebook.com") || lower.includes("fb.watch") || lower.includes("fb.com")) {
      return "facebook";
    }
  }
  return null;
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "media-download";
}

export function estimateSize(
  durationSecs: number,
  height: number,
  isAudio: boolean
): number {
  if (isAudio) return (durationSecs * 128_000) / 8;
  if (height >= 2160) return (durationSecs * 20_000_000) / 8;
  if (height >= 1440) return (durationSecs * 10_000_000) / 8;
  if (height >= 1080) return (durationSecs * 4_000_000) / 8;
  if (height >= 720)  return (durationSecs * 2_500_000) / 8;
  if (height >= 480)  return (durationSecs * 1_000_000) / 8;
  return (durationSecs * 500_000) / 8;
}

// ─── Trigger browser save-as from a fetch Response ───────────────────────────

async function streamToFile(
  response: Response,
  filename: string,
  id: string,
  totalBytes: number,
  onUpdate: (state: DownloadState) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Stream reader could not be initialised.");

  let receivedBytes = 0;
  const chunks: BlobPart[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      const progress = totalBytes
        ? Math.min(Math.round((receivedBytes / totalBytes) * 100), 99)
        : 0;
      onUpdate({
        id,
        status: "downloading",
        progress,
        downloadedMb: formatBytes(receivedBytes),
      });
    }
  }

  const mimeType = response.headers.get("Content-Type") ?? "application/octet-stream";
  const blob = new Blob(chunks, { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(blobUrl);

  return formatBytes(receivedBytes);
}

// ─── SSE-based download (merge & high-res path) ──────────────────────────────

async function executeDownloadWithSSE(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  merge: boolean,
  isAudio: boolean
): Promise<string> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  const progressUrl =
    `/api/download/progress` +
    `?url=${encodeURIComponent(url)}` +
    `&itag=${encodeURIComponent(itag)}` +
    `&title=${encodeURIComponent(title)}` +
    (merge ? "&merge=true" : "") +
    (isAudio ? "&audio=true" : "");

  return new Promise<string>((resolve, reject) => {
    const evtSource = new EventSource(progressUrl);

    evtSource.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse(e.data) as {
          percent: number;
          downloadedMb: string;
          speedMbps: string;
          phase: string;
        };
        onUpdate({
          id,
          status: "downloading",
          progress: Math.min(Math.round(data.percent), 98),
          downloadedMb: data.downloadedMb,
          speedMbps: data.speedMbps,
          phase: data.phase as "downloading" | "merging",
        });
      } catch {
        /* ignore parse errors */
      }
    });

    evtSource.addEventListener("ready", async (e) => {
      evtSource.close();
      try {
        const ready = JSON.parse(e.data) as {
          token: string;
          filename: string;
          sizeMb: string;
          mimeType: string;
        };

        onUpdate({
          id,
          status: "downloading",
          progress: 99,
          downloadedMb: ready.sizeMb,
          speedMbps: undefined,
          phase: "transferring",
        });

        const fileUrl =
          `/api/download/file` +
          `?token=${encodeURIComponent(ready.token)}` +
          `&filename=${encodeURIComponent(ready.filename)}` +
          `&mime=${encodeURIComponent(ready.mimeType)}`;

        const response = await fetch(fileUrl);
        if (!response.ok) {
          const err = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Failed to fetch file");
        }

        const contentLength = response.headers.get("Content-Length");
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

        const finalMb = await streamToFile(response, ready.filename, id, totalBytes, onUpdate);
        resolve(finalMb);
      } catch (err) {
        reject(err);
      }
    });

    evtSource.addEventListener("error", (e) => {
      evtSource.close();
      const msg = (e as MessageEvent).data
        ? (JSON.parse((e as MessageEvent).data) as { message?: string }).message
        : "SSE connection error";
      reject(new Error(msg ?? "Download failed"));
    });

    evtSource.onerror = () => {
      evtSource.close();
      reject(new Error("SSE connection lost"));
    };
  });
}

// ─── Direct pipe download (non-merge: combined or audio-only streams) ─────────

async function executeDownloadDirect(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize: number,
  isAudio: boolean
): Promise<string> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  const apiUrl =
    `/api/download` +
    `?url=${encodeURIComponent(url)}` +
    `&itag=${encodeURIComponent(itag)}` +
    `&title=${encodeURIComponent(title)}` +
    (expectedSize > 0 ? `&size=${expectedSize}` : "") +
    (isAudio ? "&audio=true" : "");

  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error ?? "Download connection failed");
  }

  const contentLength = response.headers.get("Content-Length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : expectedSize ?? 0;

  const ext = (response.headers.get("Content-Type") ?? "").includes("audio") ? "m4a" : "mp4";
  const filename = `${sanitizeFilename(title)}.${ext}`;

  const finalMb = await streamToFile(response, filename, id, totalBytes, onUpdate);
  return finalMb;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function executeDownload(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize?: number,
  merge = false,
  isAudio = false
): Promise<void> {
  try {
    const platform = detectPlatformFromUrl(url);
    const useSSE = merge || platform === "tiktok" || platform === "facebook";
    let finalMb: string;

    if (useSSE) {
      finalMb = await executeDownloadWithSSE(url, itag, title, id, onUpdate, merge, isAudio);
    } else {
      finalMb = await executeDownloadDirect(
        url,
        itag,
        title,
        id,
        onUpdate,
        expectedSize ?? 0,
        isAudio
      );
    }

    onUpdate({ id, status: "completed", progress: 100, downloadedMb: finalMb });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[executeDownload] id=${id}`, message);
    onUpdate({ id, status: "failed", progress: 0, downloadedMb: "0.0" });
  }
}

export async function executeDownloadToBlob(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize?: number,
  merge = false,
  isAudio = false
): Promise<{ blob: Blob; filename: string } | null> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  try {
    const platform = detectPlatformFromUrl(url);
    const useSSE = merge || platform === "tiktok" || platform === "facebook";
    let response: Response;
    let totalBytes = 0;
    let filename = `${sanitizeFilename(title)}.${isAudio ? "m4a" : "mp4"}`;

    if (useSSE) {
      const ready = await new Promise<{
        token: string;
        filename: string;
        sizeMb: string;
        mimeType: string;
      }>((resolve, reject) => {
        const progressUrl =
          `/api/download/progress` +
          `?url=${encodeURIComponent(url)}` +
          `&itag=${encodeURIComponent(itag)}` +
          `&title=${encodeURIComponent(title)}` +
          (merge ? "&merge=true" : "") +
          (isAudio ? "&audio=true" : "");

        const evtSource = new EventSource(progressUrl);

        evtSource.addEventListener("progress", (e) => {
          try {
            const data = JSON.parse(e.data) as {
              percent: number;
              downloadedMb: string;
              speedMbps: string;
              phase: string;
            };
            onUpdate({
              id,
              status: "downloading",
              progress: Math.min(Math.round(data.percent), 98),
              downloadedMb: data.downloadedMb,
              speedMbps: data.speedMbps,
              phase: data.phase as "downloading" | "merging",
            });
          } catch {
            /* ignore */
          }
        });

        evtSource.addEventListener("ready", (e) => {
          evtSource.close();
          resolve(JSON.parse(e.data));
        });

        evtSource.addEventListener("error", (e) => {
          evtSource.close();
          const msg = (e as MessageEvent).data
            ? (JSON.parse((e as MessageEvent).data) as { message?: string }).message
            : "SSE error";
          reject(new Error(msg ?? "Download failed"));
        });

        evtSource.onerror = () => {
          evtSource.close();
          reject(new Error("SSE connection lost"));
        };
      });

      filename = ready.filename;
      const fileUrl =
        `/api/download/file` +
        `?token=${encodeURIComponent(ready.token)}` +
        `&filename=${encodeURIComponent(ready.filename)}` +
        `&mime=${encodeURIComponent(ready.mimeType)}`;

      response = await fetch(fileUrl);
      const cl = response.headers.get("Content-Length");
      totalBytes = cl ? parseInt(cl, 10) : 0;
    } else {
      const apiUrl =
        `/api/download` +
        `?url=${encodeURIComponent(url)}` +
        `&itag=${encodeURIComponent(itag)}` +
        `&title=${encodeURIComponent(title)}` +
        (isAudio ? "&audio=true" : "");

      response = await fetch(apiUrl);
      const cl = response.headers.get("Content-Length");
      totalBytes = cl ? parseInt(cl, 10) : expectedSize ?? 0;
      const ext = (response.headers.get("Content-Type") ?? "").includes("audio") ? "m4a" : "mp4";
      filename = `${sanitizeFilename(title)}.${ext}`;
    }

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? "Download failed");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream reader could not be initialised.");

    let receivedBytes = 0;
    const chunks: BlobPart[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        const progress = totalBytes
          ? Math.min(Math.round((receivedBytes / totalBytes) * 100), 99)
          : 0;
        onUpdate({
          id,
          status: "downloading",
          progress,
          downloadedMb: formatBytes(receivedBytes),
        });
      }
    }

    const mimeType = response.headers.get("Content-Type") ?? "application/octet-stream";
    const blob = new Blob(chunks, { type: mimeType });

    onUpdate({ id, status: "completed", progress: 100, downloadedMb: formatBytes(receivedBytes) });
    return { blob, filename };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[executeDownloadToBlob] id=${id}`, message);
    onUpdate({ id, status: "failed", progress: 0, downloadedMb: "0.0" });
    return null;
  }
}
