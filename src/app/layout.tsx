import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anivora | Modern Media Downloader",
  description:
    "Download high-quality YouTube, WeTV, Instagram, Bilibili TV, and X videos, playlists, and MP3 audio instantly with our sleek, glassmorphic downloader.",
  keywords: [
    "youtube downloader",
    "playlist downloader",
    "wetv downloader",
    "instagram downloader",
    "bilibili downloader",
    "x video downloader",
    "twitter video downloader",
    "convert youtube to mp3",
    "anivora",
    "hd video downloader",
  ],
  authors: [{ name: "Anivora Team" }],
  creator: "Anivora",
  publisher: "Anivora",
  metadataBase: new URL("https://anivora.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Anivora | Modern Media Downloader",
    description:
      "Download high-quality YouTube, WeTV, Instagram, Bilibili TV, and X videos, playlists, and MP3 audio instantly with our sleek, glassmorphic downloader.",
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
    title: "Anivora | Modern Media Downloader",
    description:
      "Download high-quality YouTube, WeTV, Instagram, Bilibili TV, and X videos, playlists, and MP3 audio instantly with our sleek, glassmorphic downloader.",
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
