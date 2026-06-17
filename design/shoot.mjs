// design/shoot.mjs -- render an HTML file (or a running URL) and capture it at
// desktop + mobile widths, retina scale. Used to pixel-verify design iterations
// and the built app visually -- the layer that code-only critique can't cover.
//
//   node design/shoot.mjs <html-file-or-url> <out-prefix>
//   node design/shoot.mjs design/explorations/iteration-1.html design/shots/iter-1

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [, , target, outPrefix = "design/shots/shot"] = process.argv;
if (!target) {
  console.error("usage: node design/shoot.mjs <html-file-or-url> <out-prefix>");
  process.exit(1);
}

const url = /^https?:\/\//.test(target) ? target : pathToFileURL(target).href;
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

mkdirSync(dirname(outPrefix), { recursive: true });

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200); // let webfonts + entry motion settle
    const out = `${outPrefix}-${vp.name}.png`;
    await page.screenshot({ path: out, fullPage: true });
    console.log("shot:", out);
    await page.close();
  }
} finally {
  await browser.close();
}
