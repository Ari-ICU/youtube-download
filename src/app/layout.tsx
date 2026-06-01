import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VibeTube | Premium YouTube Video & Playlist Downloader",
  description: "Download high-quality YouTube videos, playlists, and MP3 audio instantly with our sleek, high-speed, glassmorphic downloader.",
  keywords: [
    "youtube downloader",
    "playlist downloader",
    "convert youtube to mp3",
    "vibetube",
    "download youtube video",
    "online video downloader",
    "free youtube downloader",
    "download youtube playlist",
    "fast youtube downloader",
    "youtube to mp4",
    "hd video downloader"
  ],
  authors: [{ name: "VibeTube Team" }],
  creator: "VibeTube",
  publisher: "VibeTube",
  metadataBase: new URL("https://vibetube.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "VibeTube | Premium YouTube Video & Playlist Downloader",
    description: "Download high-quality YouTube videos, playlists, and MP3 audio instantly with our sleek, high-speed, glassmorphic downloader.",
    url: "https://vibetube.app",
    siteName: "VibeTube",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "VibeTube Premium Downloader Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeTube | Premium YouTube Video & Playlist Downloader",
    description: "Download high-quality YouTube videos, playlists, and MP3 audio instantly with our sleek, high-speed, glassmorphic downloader.",
    images: ["/logo.png"],
    creator: "@vibetube",
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
      suppressHydrationWarning={true}
      className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
