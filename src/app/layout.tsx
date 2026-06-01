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
