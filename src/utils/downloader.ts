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
  onUpdate: (state: DownloadState) => void,
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

  // Return the final size string so callers can show it in the completed state
  return formatBytes(receivedBytes);
}

// ─── SSE-based download (merge path) ─────────────────────────────────────────
//
// Flow:
//  1. Open SSE stream to /api/download/progress — receive real-time progress events
//  2. On "ready" event → fetch /api/download/file?token=... → stream to browser
//
// This gives accurate per-second progress during the yt-dlp + ffmpeg phase,
// then shows transfer progress while the completed file is sent to the browser.

async function executeDownloadWithSSE(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  merge: boolean,
  isAudio: boolean,
  bypassGlobal = false,
): Promise<string> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  const progressUrl =
    `/api/download/progress` +
    `?url=${encodeURIComponent(url)}` +
    `&itag=${encodeURIComponent(itag)}` +
    `&title=${encodeURIComponent(title)}` +
    (merge ? "&merge=true" : "") +
    (isAudio ? "&audio=true" : "") +
    (bypassGlobal ? "&bypassGlobal=true" : "");

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
      } catch { /* ignore parse errors */ }
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

        // Update to show "transferring file to browser" phase
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
          const err = await response.json().catch(() => ({})) as { error?: string };
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
//
// yt-dlp pipes directly to stdout — the route streams it straight to the client.
// Content-Length comes from the format's known filesize, giving accurate progress.

async function executeDownloadDirect(
  url: string,
  itag: string,
  title: string,
  id: string,
  onUpdate: (state: DownloadState) => void,
  expectedSize: number,
  bypassGlobal = false,
): Promise<string> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  const apiUrl =
    `/api/download` +
    `?url=${encodeURIComponent(url)}` +
    `&itag=${encodeURIComponent(itag)}` +
    `&title=${encodeURIComponent(title)}` +
    (expectedSize > 0 ? `&size=${expectedSize}` : "") +
    (bypassGlobal ? "&bypassGlobal=true" : "");

  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error ?? "Download connection failed");
  }

  const contentLength = response.headers.get("Content-Length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : (expectedSize ?? 0);

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
  isAudio = false,
  bypassGlobal = false,
): Promise<void> {
  try {
    let finalMb: string;

    if (merge) {
      finalMb = await executeDownloadWithSSE(url, itag, title, id, onUpdate, true, isAudio, bypassGlobal);
    } else {
      finalMb = await executeDownloadDirect(url, itag, title, id, onUpdate, expectedSize ?? 0, bypassGlobal);
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
  isAudio = false,
  bypassGlobal = false,
): Promise<{ blob: Blob; filename: string } | null> {
  onUpdate({ id, status: "downloading", progress: 0, downloadedMb: "0.0" });

  try {
    let response: Response;
    let totalBytes = 0;
    let filename = `${sanitizeFilename(title)}.mp4`;

    if (merge) {
      // SSE phase — wait for ready, then fetch file
      const ready = await new Promise<{
        token: string; filename: string; sizeMb: string; mimeType: string;
      }>((resolve, reject) => {
        const progressUrl =
          `/api/download/progress` +
          `?url=${encodeURIComponent(url)}` +
          `&itag=${encodeURIComponent(itag)}` +
          `&title=${encodeURIComponent(title)}` +
          `&merge=true` +
          (isAudio ? "&audio=true" : "") +
          (bypassGlobal ? "&bypassGlobal=true" : "");

        const evtSource = new EventSource(progressUrl);

        evtSource.addEventListener("progress", (e) => {
          try {
            const data = JSON.parse(e.data) as {
              percent: number; downloadedMb: string; speedMbps: string; phase: string;
            };
            onUpdate({
              id,
              status: "downloading",
              progress: Math.min(Math.round(data.percent), 98),
              downloadedMb: data.downloadedMb,
              speedMbps: data.speedMbps,
              phase: data.phase as "downloading" | "merging",
            });
          } catch { /* ignore */ }
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

        evtSource.onerror = () => { evtSource.close(); reject(new Error("SSE connection lost")); };
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
        (bypassGlobal ? "&bypassGlobal=true" : "");

      response = await fetch(apiUrl);
      const cl = response.headers.get("Content-Length");
      totalBytes = cl ? parseInt(cl, 10) : (expectedSize ?? 0);
      const ext = (response.headers.get("Content-Type") ?? "").includes("audio") ? "m4a" : "mp4";
      filename = `${sanitizeFilename(title)}.${ext}`;
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: string };
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
