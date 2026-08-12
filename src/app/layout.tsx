import type { Metadata, Viewport } from "next";
import { Archivo, Noto_Sans_Thai, Sarabun } from "next/font/google";

import "./globals.css";

// Archivo carries the design system's Latin voice but has no Thai glyphs, and
// this app is written in Thai — Noto Sans Thai covers the rest of the interface.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  display: "swap",
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
  weight: ["400", "600", "800"],
  display: "swap",
});

// Thai officialdom sets paperwork in TH Sarabun New; Sarabun is the freely
// licensed equivalent, used for the printed certificate sheet.
const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["400", "700"],
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
