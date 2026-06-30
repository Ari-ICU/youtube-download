import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { writeFile, unlink, stat } from "fs/promises";
import { join } from "path";

const COOKIES_PATH = join(process.cwd(), "cookies.txt");

// ─── GET: check whether cookies.txt exists and how old it is ─────────────────
export async function GET() {
  try {
    if (!existsSync(COOKIES_PATH)) {
      return NextResponse.json({ exists: false });
    }
    const { mtime, size } = await stat(COOKIES_PATH);
    const ageMs = Date.now() - mtime.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    return NextResponse.json({
      exists: true,
      ageDays,
      sizeKb: Math.round(size / 1024),
      // Warn if older than 14 days — cookies tend to expire
      stale: ageDays > 14,
    });
  } catch {
    return NextResponse.json({ exists: false });
  }
}

// ─── POST: upload a new cookies.txt ──────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("cookies") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // Basic sanity check — must be a plain text file
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (max 5 MB)." },
        { status: 400 }
      );
    }

    const text = await file.text();

    // Validate it looks like a Netscape cookie file or has supported domains
    const isNetscape = text.startsWith("# Netscape HTTP Cookie File") || text.startsWith("# HTTP Cookie File");
    const hasSupportedDomain =
      text.includes("bilibili.tv") ||
      text.includes("wetv.vip") ||
      text.includes("youtube.com") ||
      text.includes("instagram.com") ||
      text.includes("x.com") ||
      text.includes("twitter.com");

    if (!isNetscape && !hasSupportedDomain) {
      return NextResponse.json(
        {
          error:
            "This doesn't look like a valid Netscape cookie file. " +
            "Make sure you export cookies in Netscape format from a supported platform (WeTV, Bilibili, YouTube, etc.).",
        },
        { status: 400 }
      );
    }

    await writeFile(COOKIES_PATH, text, "utf-8");
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save cookies.";
    console.error("[POST /api/cookies]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: remove cookies.txt ───────────────────────────────────────────────
export async function DELETE() {
  try {
    if (existsSync(COOKIES_PATH)) {
      await unlink(COOKIES_PATH);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete cookies.";
    console.error("[DELETE /api/cookies]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
