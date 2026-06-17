import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// Editorial pairing for the "calm command center" language:
//   Newsreader — a refined serif with optical sizing, for briefing-document
//     headlines (the threat headline reads like a wire-service lede).
//   Geist / Geist Mono — a clean grotesk for body, labels, and all figures
//     (tabular-nums via the `.tnum` utility). Arial/Helvetica are deliberately
//     dropped (an AI-slop tell); the faces bind to CSS vars consumed in
//     globals.css under @theme inline.
const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  style: ["normal", "italic"]
});

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist"
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono"
});

export const metadata: Metadata = {
  title: "RESILIX ActionOps",
  description:
    "Crisis-to-action war room: a disruption signal and a supplier CSV become an evidence-cited, human-approved action packet for US mid-market procurement."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${newsreader.variable}`}
    >
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
