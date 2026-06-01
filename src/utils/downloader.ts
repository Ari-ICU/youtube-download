import type { DownloadState } from "@/types";

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
  return name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "youtube-download";
}

// ─── Bitrate estimation by resolution ────────────────────────────────────────
// Used when Content-Length is absent to show approximate progress.
export function estimateSize(
  durationSecs: number,
  height: number,
  isAudio: boolean
): number {
  if (isAudio) return (durationSecs * 128_000) / 8;
  // Rough average bitrates per resolution tier
  if (height >= 2160) return (durationSecs * 20_000_000) / 8; // 4K ~20 Mbps
  if (height >= 1440) return (durationSecs * 10_000_000) / 8; // 1440p ~10 Mbps
  if (height >= 1080) return (durationSecs * 4_000_000) / 8;  // 1080p ~4 Mbps
  if (height >= 720)  return (durationSecs * 2_500_000) / 8;  // 720p ~2.5 Mbps
  if (height >= 480)  return (durationSecs * 1_000_000) / 8;  // 480p ~1 Mbps
  return (durationSecs * 500_000) / 8;                         // 360p ~500 Kbps
}

// ─── Core Stream Downloader ───────────────────────────────────────────────────

/**
 * Downloads a YouTube video/audio stream via the `/api/download` route handler.
 * Set `merge = true` for video-only adaptive streams (4K) so the server merges
 * the best audio track before piping.
 */
export async function executeDownload(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize?: number,
  merge = false
): Promise<void> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  try {
    const apiUrl =
      `/api/download` +
      `?url=${encodeURIComponent(url)}` +
      `&itag=${encodeURIComponent(itag)}` +
      `&title=${encodeURIComponent(title)}` +
      (merge ? "&merge=true" : "");

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ?? "Download connection failed"
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream reader could not be initialised.");

    const contentLength = response.headers.get("Content-Length");
    const totalBytes = contentLength
      ? parseInt(contentLength, 10)
      : (expectedSize ?? 0);

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

    const mimeType = response.headers.get("Content-Type") ?? "";
    const ext = mimeType.includes("audio") ? "m4a" : "mp4";

    const blob = new Blob(chunks, { type: mimeType || "application/octet-stream" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${sanitizeFilename(title)}.${ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(blobUrl);

    onUpdate({
      id,
      status: "completed",
      progress: 100,
      downloadedMb: formatBytes(receivedBytes),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[executeDownload] id=${id}`, message);
    onUpdate({ id, status: "failed", progress: 0, downloadedMb: "0.0" });
  }
}

/**
 * Downloads a stream and returns the raw Blob (used for playlist ZIP building).
 * Set `merge = true` for video-only adaptive streams (4K).
 */
export async function executeDownloadToBlob(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize?: number,
  merge = false
): Promise<{ blob: Blob; filename: string } | null> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  try {
    const apiUrl =
      `/api/download` +
      `?url=${encodeURIComponent(url)}` +
      `&itag=${encodeURIComponent(itag)}` +
      `&title=${encodeURIComponent(title)}` +
      (merge ? "&merge=true" : "");

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ?? "Download connection failed"
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream reader could not be initialised.");

    const contentLength = response.headers.get("Content-Length");
    const totalBytes = contentLength
      ? parseInt(contentLength, 10)
      : (expectedSize ?? 0);

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

    const mimeType = response.headers.get("Content-Type") ?? "";
    const ext = mimeType.includes("audio") ? "m4a" : "mp4";
    const filename = `${sanitizeFilename(title)}.${ext}`;
    const blob = new Blob(chunks, { type: mimeType || "application/octet-stream" });

    onUpdate({
      id,
      status: "completed",
      progress: 100,
      downloadedMb: formatBytes(receivedBytes),
    });

    return { blob, filename };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[executeDownloadToBlob] id=${id}`, message);
    onUpdate({ id, status: "failed", progress: 0, downloadedMb: "0.0" });
    return null;
  }
}
