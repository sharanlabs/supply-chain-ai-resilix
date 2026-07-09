import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Type system for the "Apple premium-white / Forest" register -- sans-clean end to end,
// in the Apple SF / Google Sans / OpenAI / Geist register:
//   Geist -- a bespoke grotesk for headlines, body, labels, and all figures
//     (tabular-nums via the `.tnum` utility). It carries the editorial calm
//     through scale, weight, and tracking rather than a second display face.
//   Geist Mono -- machine provenance: event codes, source paths, the audit mode
//     token. Arial/Helvetica/Inter are deliberately dropped (AI-slop tells).
//   The prior Newsreader serif is dropped: a single serif gesture read dated
//     against the sans-minimal references, so the at-risk lede figure is now
//     Geist (heavier, accented, tabular -- see .headline-figure in globals.css).
//   The faces bind to CSS vars consumed in globals.css under @theme inline.
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
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
