import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono, Pixelify_Sans } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "600"] });
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"], weight: ["400", "600"] });

export const metadata: Metadata = {
  title: { default: "Nightshift", template: "%s · Nightshift" },
  description: "A night shift for your small business: AI bots that work while you're off, and wait for your OK.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#221a24", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
