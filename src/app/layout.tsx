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
  title: "Anivora | Premium Video Downloader",
  description: "Download high-quality YouTube and WeTV videos, playlists, and MP3 audio instantly with our sleek, high-speed, glassmorphic downloader.",
  keywords: [
    "youtube downloader",
    "playlist downloader",
    "wetv downloader",
    "convert youtube to mp3",
    "anivora",
    "download youtube video",
    "online video downloader",
    "free video downloader",
    "download youtube playlist",
    "fast video downloader",
    "youtube to mp4",
    "hd video downloader"
  ],
  authors: [{ name: "Anivora Team" }],
  creator: "Anivora",
  publisher: "Anivora",
  metadataBase: new URL("https://anivora.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Anivora | Premium Video Downloader",
    description: "Download high-quality YouTube and WeTV videos, playlists, and MP3 audio instantly with our sleek, high-speed, glassmorphic downloader.",
    url: "https://anivora.app",
    siteName: "Anivora",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Anivora Premium Downloader Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anivora | Premium Video Downloader",
    description: "Download high-quality YouTube and WeTV videos, playlists, and MP3 audio instantly with our sleek, high-speed, glassmorphic downloader.",
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
