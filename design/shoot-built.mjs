// design/shoot-built.mjs -- capture the BUILT app (running dev server) at the
// three deliverable surfaces: full default page (desktop + mobile) and the
// Action Packet tab. Reduced-motion is left default-on so entrance motion has
// settled by capture time. Run with `npm run dev` already up.
//
//   node design/shoot-built.mjs            (defaults to http://localhost:3000)
//   node design/shoot-built.mjs http://localhost:3001

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
mkdirSync("design/shots", { recursive: true });

const browser = await chromium.launch();

async function shoot(out, { width, height, clickTab }) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2
  });
  await page.goto(base, { waitUntil: "networkidle" });
  if (clickTab) {
    await page.getByRole("tab", { name: clickTab }).click();
  }
  await page.waitForTimeout(1400); // webfonts + entrance motion settle
  await page.screenshot({ path: out, fullPage: true });
  console.log("shot:", out);
  await page.close();
}

try {
  // Default landing (the Action Packet tab is the default) — desktop + mobile.
  await shoot("design/shots/built-desktop.png", { width: 1440, height: 900 });
  await shoot("design/shots/built-mobile.png", { width: 390, height: 844 });
  // The Action Packet tab explicitly (desktop), the hero deliverable surface.
  await shoot("design/shots/built-packet.png", {
    width: 1440,
    height: 900,
    clickTab: /Action Packet/
  });
} finally {
  await browser.close();
}
