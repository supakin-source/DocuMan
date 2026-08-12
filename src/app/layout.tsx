import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

// next/font/google fetches font files from fonts.gstatic.com at build time,
// which has proven unreliable off Vercel's own infrastructure — it 404'd under
// Turbopack on Netlify's build image, then failed outright on GitHub Actions'
// runners. The fonts are vendored into ./fonts (from the google/fonts source
// repo, not the CDN's per-subset files) instead, so the build never depends on
// that fetch succeeding.

// Archivo carries the design system's Latin voice but has no Thai glyphs, and
// this app is written in Thai — Noto Sans Thai covers the rest of the interface.
// Both are variable fonts; the weight axis is opened up via `declarations`
// since a local variable font otherwise renders only its default weight.
const archivo = localFont({
  src: "./fonts/Archivo-Variable.ttf",
  variable: "--font-archivo",
  display: "swap",
  weight: "100 900",
});

const notoSansThai = localFont({
  src: "./fonts/NotoSansThai-Variable.ttf",
  variable: "--font-noto-thai",
  display: "swap",
  weight: "100 900",
});

// Thai officialdom sets paperwork in TH Sarabun New; Sarabun is the freely
// licensed equivalent, used for the printed certificate sheet. Static, not
// variable — Regular and Bold are separate files upstream, each already
// covering both the Thai and Latin glyphs the certificate needs.
const sarabun = localFont({
  src: [
    { path: "./fonts/Sarabun-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Sarabun-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sarabun",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocuMan",
  description: "Document Management Solutions — Asset Five Development Co., Ltd.",
  icons: { icon: "/brand/documan-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#cc1517",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${archivo.variable} ${notoSansThai.variable} ${sarabun.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
