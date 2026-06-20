// Production CSP browser smoke -- the execution proof the unit tests cannot give.
//
// The nonce-based CSP (proxy.ts) ships only at runtime and differs from the dev CSP
// (prod drops 'unsafe-eval'), so neither the unit tests nor the `next dev` e2e exercise
// the policy that actually ships. A curl would prove the HEADER is present but not that
// scripts EXECUTE under it -- a nonce mismatch or a strict-dynamic slip passes a header
// check and still white-screens prod (hydration blocked). This drives a real browser
// against a real `next start` and asserts both: the policy is strict AND the page is
// interactive (hydration succeeded under the CSP).
//
// Run (3 steps):
//   npm run build
//   npx next start -p 3011 &
//   node scripts/prod-csp-smoke.mjs        # SMOKE_URL overrides the default
//
// RE-RUN AFTER: a client-bundle dependency bump (Zod/React/Next), a change to
// lib/schemas.ts (the Zod `jitless` config), or any edit to proxy.ts / the CSP. A green
// `verify:full` / dev e2e is NOT a substitute -- the dev CSP keeps 'unsafe-eval', so an
// eval-based prod regression (e.g. the Zod `new Function` JIT) passes them and still
// white-screens prod. This script is the only check that exercises the real prod policy.
//
// Exits non-zero with the specific reasons on any failure.

import { chromium } from "playwright";

const BASE = process.env.SMOKE_URL ?? "http://127.0.0.1:3011";
const failures = [];

const browser = await chromium.launch();
const page = await browser.newPage();

// Capture CSP violations from inside the page (the real signal of a blocked script).
await page.addInitScript(() => {
  // Runs in the browser context (Playwright serializes this); window/document are the
  // page globals, not Node's.
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__cspViolations.push({ directive: e.violatedDirective, blocked: e.blockedURI });
  });
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

// 1. Load and inspect the CSP header on the document response.
const resp = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const csp = resp?.headers()["content-security-policy"] ?? "";
const scriptSrc = csp
  .split(";")
  .map((d) => d.trim())
  .find((d) => d.startsWith("script-src")) ?? "";

if (!/'nonce-[^']+'/.test(scriptSrc)) failures.push(`script-src has no nonce: "${scriptSrc}"`);
if (!scriptSrc.includes("'strict-dynamic'")) failures.push("script-src missing 'strict-dynamic'");
if (scriptSrc.includes("'unsafe-inline'"))
  failures.push("PROD script-src still allows 'unsafe-inline' (the hardening did not apply)");
if (scriptSrc.includes("'unsafe-eval'"))
  failures.push("PROD script-src allows 'unsafe-eval' (must be dev-only)");

// 1b. The cross-origin isolation headers ship on the document (and the page still renders
//     under them -- step 3 below proves interactivity, so CORP did not break loading).
const h = resp?.headers() ?? {};
if (h["cross-origin-opener-policy"] !== "same-origin")
  failures.push(`COOP not same-origin: "${h["cross-origin-opener-policy"]}"`);
if (h["cross-origin-resource-policy"] !== "same-origin")
  failures.push(`CORP not same-origin: "${h["cross-origin-resource-policy"]}"`);

// 2. The rendered framework scripts carry a nonce (Next stamped it from the request CSP).
//    Browsers hide the nonce content attribute, but the IDL `.nonce` property is readable.
const scriptNonces = await page.$$eval("script", (els) =>
  els.map((e) => e.nonce).filter((n) => n && n.length > 0)
);
if (scriptNonces.length === 0)
  failures.push("no <script> carries a nonce -- Next did not apply the request nonce");

// 3. Interactivity == hydration succeeded under the CSP. If scripts were blocked, these
//    client handlers never attach. The approve action is pure optimistic local state (no
//    API), so a flip to 'Approved' is a clean proof the onClick ran. Mirror the e2e: the
//    approve button is on the DEFAULT (packet) tab -- do NOT navigate away first.
try {
  const approve = page.getByTestId("approve-action");
  await approve.waitFor({ state: "visible", timeout: 5000 });
  await approve.click();
  await page.getByTestId("approve-action").getByText(/Approved/).waitFor({ timeout: 5000 });
} catch {
  failures.push("approve did not flip to 'Approved' -- the client handler did not run (CSP blocked hydration?)");
}
// Tab switching is also client-driven: assert the clicked tab actually becomes selected
// (aria-selected), which only happens if the tablist hydrated.
try {
  const exposure = page.getByRole("tab", { name: /Exposure/ });
  await exposure.click();
  await page.locator('[role="tab"][aria-selected="true"]').getByText(/Exposure/).waitFor({ timeout: 5000 });
} catch {
  failures.push("Exposure tab did not become aria-selected after click -- tablist did not hydrate");
}

// 4. Any script-level CSP violations recorded on `/` during the run?
const violations = await page.evaluate(() => window.__cspViolations ?? []);
const scriptViolations = violations.filter((v) => /script/i.test(v.directive));

// 5. Non-existent routes must ALSO be fully nonced. Next's DEFAULT 404/error pages are
//    build-time static, so their framework scripts ship without a nonce and 'strict-dynamic'
//    blocks them; the custom app/not-found.tsx (dynamic) closes that. The second path is the
//    matcher edge: an `api`-prefixed document path (`/apiary*`) must NOT be skipped by the
//    proxy (the exclusion is `api/`, not `api`), or it would render with no CSP at all.
//    addInitScript re-runs per navigation, so window.__cspViolations resets per page.
for (const bogus of ["/__no_such_route_csp_smoke__", "/apiary-not-a-real-route"]) {
  const resp = await page.goto(`${BASE}${bogus}`, { waitUntil: "networkidle" });
  const status = resp?.status();
  if (status !== 404) failures.push(`expected 404 for ${bogus}, got ${status}`);
  const cspHeader = resp?.headers()["content-security-policy"] ?? "";
  if (!/'nonce-[^']+'/.test(cspHeader)) failures.push(`${bogus}: response carries no nonce CSP (proxy skipped it?)`);
  const nonces = await page.$$eval("script", (els) => els.map((e) => e.nonce).filter((n) => n && n.length > 0));
  if (nonces.length === 0) failures.push(`${bogus}: scripts carry no nonce (route is static, not dynamic/nonced)`);
  const v = (await page.evaluate(() => window.__cspViolations ?? [])).filter((x) => /script/i.test(x.directive));
  if (v.length) failures.push(`${bogus}: script-directive CSP violations: ${JSON.stringify(v)}`);
  console.log(`bogus ${bogus}: status ${status}, scripts nonced ${nonces.length}, script violations ${v.length}`);
}

await browser.close();

console.log(`CSP script-src: ${scriptSrc}`);
console.log(`scripts carrying a nonce: ${scriptNonces.length}`);
console.log(`CSP violations (all): ${JSON.stringify(violations)}`);
if (consoleErrors.length) console.log(`console errors: ${JSON.stringify(consoleErrors.slice(0, 10))}`);

if (scriptViolations.length)
  failures.push(`script-directive CSP violations: ${JSON.stringify(scriptViolations)}`);

if (failures.length > 0) {
  console.error(`\nPROD CSP SMOKE FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("\nPROD CSP SMOKE PASSED: strict nonce CSP enforced AND the page is interactive.");
