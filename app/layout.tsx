import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme-init";
import "./globals.css";

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken-grotesk",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-ibm-plex-mono",
});

// Browser-chrome tint = --bg per scheme (tests/styles/brand-surfaces.test.ts pins
// these to globals.css). The app follows the OS scheme pre-hydration (MV-43), so
// the media-query themeColor matches the theme actually served.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#141014" },
  ],
};

export const metadata: Metadata = {
  title: "MyVisa — Honest answers for studying abroad",
  description:
    "Trust-first study-abroad assessments for international students. Real chances, transparent reasoning, no consultancy fees.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body suppressHydrationWarning>
        {/* Pre-hydration: follow the OS colour scheme before first paint (MV-43). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  );
}
