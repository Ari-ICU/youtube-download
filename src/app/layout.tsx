import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anivora | 4K Media Downloader for YouTube, TikTok & Facebook",
  description:
    "Download high-quality YouTube, TikTok, and Facebook videos, playlists, and M4A audio in up to 4K Ultra HD with our sleek, glassmorphic downloader.",
  keywords: [
    "youtube downloader",
    "4k youtube downloader",
    "tiktok downloader",
    "facebook video downloader",
    "playlist downloader",
    "convert youtube to m4a",
    "anivora",
    "4k video downloader",
  ],
  authors: [{ name: "Anivora Team" }],
  creator: "Anivora",
  publisher: "Anivora",
  metadataBase: new URL("https://anivora.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Anivora | 4K Media Downloader for YouTube, TikTok & Facebook",
    description:
      "Download high-quality YouTube, TikTok, and Facebook videos, playlists, and M4A audio in up to 4K Ultra HD with our sleek, glassmorphic downloader.",
    url: "https://anivora.app",
    siteName: "Anivora",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Anivora Media Studio",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anivora | 4K Media Downloader for YouTube, TikTok & Facebook",
    description:
      "Download high-quality YouTube, TikTok, and Facebook videos, playlists, and M4A audio in up to 4K Ultra HD with our sleek, glassmorphic downloader.",
    images: ["/logo.png"],
    creator: "@anivora",
  },
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        suppressHydrationWarning={true}
        className="min-h-full flex flex-col font-sans"
      >
        {children}
      </body>
    </html>
  );
}
