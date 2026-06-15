import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RESILIX LaunchOps AI",
  description:
    "Agentic supply-continuity decision workbench for launch-critical exceptions."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
