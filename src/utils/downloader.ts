import type { DownloadState } from "@/types";

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/**
 * Converts a duration in seconds to a human-readable "H:MM:SS" or "M:SS" string.
 */
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

/**
 * Formats a raw byte count into a human-readable "X.X MB" string.
 */
export function formatBytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Sanitizes a string for use as a filename by stripping non-alphanumeric characters.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "youtube-download";
}

// ─── Core Stream Downloader ───────────────────────────────────────────────────

/**
 * Downloads a YouTube video/audio stream via the `/api/download` route handler.
 *
 * Progress is reported incrementally through `onUpdate` so the caller can
 * update its own state on every received chunk.
 *
 * @param url     - Encoded YouTube video URL
 * @param itag    - Format itag selected by the user
 * @param title   - Video title used for the saved filename
 * @param id      - Unique identifier for this download job (itag or videoId)
 * @param onUpdate - Callback called on every state transition
 */
export async function executeDownload(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize?: number
): Promise<void> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  try {
    const response = await fetch(
      `/api/download?url=${encodeURIComponent(url)}&itag=${itag}&title=${encodeURIComponent(title)}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ?? "Download connection failed"
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream reader could not be initialised.");

    const contentLength = response.headers.get("Content-Length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : expectedSize ?? 0;

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

    // Determine extension from Content-Type header
    const mimeType = response.headers.get("Content-Type") ?? "";
    const ext = mimeType.includes("audio") ? "m4a" : "mp4";

    // Build Blob and trigger a native browser Save-As prompt
    const blob = new Blob(chunks, { type: mimeType || "application/octet-stream" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${sanitizeFilename(title)}.${ext}`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(blobUrl); // free memory immediately

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
 * Downloads a YouTube video/audio stream via the `/api/download` route handler
 * and returns the raw file Blob along with its resolved name/extension.
 *
 * Progress is reported incrementally through `onUpdate`.
 *
 * @param url      - Encoded YouTube video URL
 * @param itag     - Format itag selected by the user
 * @param title    - Video title used for the saved filename
 * @param id       - Unique identifier for this download job (videoId)
 * @param onUpdate - Callback called on every state transition
 */
export async function executeDownloadToBlob(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize?: number
): Promise<{ blob: Blob; filename: string } | null> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  try {
    const response = await fetch(
      `/api/download?url=${encodeURIComponent(url)}&itag=${itag}&title=${encodeURIComponent(title)}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error ?? "Download connection failed"
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream reader could not be initialised.");

    const contentLength = response.headers.get("Content-Length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : expectedSize ?? 0;

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

