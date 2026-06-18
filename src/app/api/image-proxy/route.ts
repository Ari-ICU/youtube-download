import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");

    if (!imageUrl) {
      return new Response("url is required", { status: 400 });
    }

    const decodedUrl = decodeURIComponent(imageUrl);

    // Validate the image URL to prevent SSRF
    const allowedDomains = ["cdninstagram.com", "fbcdn.net", "instagram.com"];
    try {
      const parsed = new URL(decodedUrl);
      const isAllowed = allowedDomains.some(
        (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)
      );
      if (!isAllowed) {
        return new Response("Unauthorized domain", { status: 403 });
      }
    } catch {
      return new Response("Invalid image URL", { status: 400 });
    }

    const res = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return new Response("Failed to fetch image from source", { status: res.status });
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Image proxy error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export const dynamic = "force-dynamic";
