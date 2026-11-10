import { rm } from "fs/promises";
import { randomUUID } from "crypto";

// ─── Token Registry ───────────────────────────────────────────────────────────
// Maps a short-lived token → { path, tmpDir } so /api/download/file can stream it.
// Entries expire after 10 minutes automatically.

export interface FileEntry {
  filePath: string;
  tmpDir: string;
  createdAt: number;
}

declare global {
  var __downloadTokens: Map<string, FileEntry> | undefined;
}

function getRegistry(): Map<string, FileEntry> {
  if (!global.__downloadTokens) {
    global.__downloadTokens = new Map();
  }
  const now = Date.now();
  for (const [k, v] of global.__downloadTokens) {
    if (now - v.createdAt > 10 * 60 * 1000) {
      rm(v.tmpDir, { recursive: true, force: true }).catch(() => {});
      global.__downloadTokens.delete(k);
    }
  }
  return global.__downloadTokens;
}

export function registerToken(filePath: string, tmpDir: string): string {
  const token = randomUUID();
  getRegistry().set(token, { filePath, tmpDir, createdAt: Date.now() });
  return token;
}

export function consumeToken(token: string): FileEntry | undefined {
  const reg = getRegistry();
  const entry = reg.get(token);
  if (entry) reg.delete(token);
  return entry;
}
