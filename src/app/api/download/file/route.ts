import { createReadStream } from "fs";
import { rm, stat } from "fs/promises";
import { consumeToken } from "../progress/route";

// ─── Security: token is a UUID, validate strictly ─────────────────────────────
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token    = searchParams.get("token") ?? "";
  const filename = searchParams.get("filename") ?? "download.mp4";
  const mimeType = searchParams.get("mime") ?? "video/mp4";

  if (!TOKEN_RE.test(token)) {
    return new Response(JSON.stringify({ error: "Invalid token." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
