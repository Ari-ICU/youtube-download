import { createReadStream } from "fs";
import { rm, stat } from "fs/promises";
import { consumeToken } from "../progress/route";

// ─── Security ─────────────────────────────────────────────────────────────────

// Token must be a v4 UUID — no other shapes accepted
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Allowlist MIME types we actually produce — prevents header injection via the
// client-supplied ?mime= param
const ALLOWED_MIMES: Record<string, true> = {
  "video/mp4": true,
  "audio/mp4": true,
};

// Strip everything except safe filename chars, cap at 200 chars.
// Dots are stripped to prevent path traversal sequences like "../../"
// even after sanitization. The extension (.mp4/.m4a) is added by the server.
function sanitizeFilename(raw: string): string {
  // Strip path traversal characters first by removing dots and slashes from the main body
  // and only keep one trailing dot for the extension.
  const parts = raw.split(".");
  if (parts.length > 1) {
    const ext = parts.pop() ?? "mp4";
    const name = parts.join(""); // merge other parts to remove inner dots
    const cleanName = name.replace(/[^\w\s\-()]/g, "").trim().slice(0, 180) || "download";
    const cleanExt = ext.replace(/[^\w]/g, "").trim().slice(0, 10) || "mp4";
    return `${cleanName}.${cleanExt}`;
  }
  return raw.replace(/[^\w\s\-()]/g, "").trim().slice(0, 200) || "download";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token        = searchParams.get("token") ?? "";
  const rawFilename  = searchParams.get("filename") ?? "download.mp4";
  const rawMime      = searchParams.get("mime") ?? "video/mp4";

  if (!TOKEN_RE.test(token)) {
    return new Response(JSON.stringify({ error: "Invalid token." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate MIME against allowlist — prevents header injection
  const mimeType = ALLOWED_MIMES[rawMime] ? rawMime : "application/octet-stream";

  // Sanitize filename — strip dangerous chars, cap length
  const filename = sanitizeFilename(rawFilename);

  const entry = consumeToken(token);
  if (!entry) {
    return new Response(JSON.stringify({ error: "Token not found or already used." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { filePath, tmpDir } = entry;

  try {
    const { size } = await stat(filePath);

    const nodeStream = createReadStream(filePath);
    const readableStream = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          controller.enqueue(new Uint8Array(buf));
        });
        nodeStream.on("end", () => {
          controller.close();
          rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        });
        nodeStream.on("error", (err) => {
          controller.error(err);
          rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        });
      },
      cancel() {
        nodeStream.destroy();
        rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    const msg = err instanceof Error ? err.message : "Failed to stream file.";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const dynamic = "force-dynamic";
