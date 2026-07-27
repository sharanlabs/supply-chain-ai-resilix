// Free CROSS-FAMILY (Groq) preflight: list the models available on GROQ_API_KEY and report
// whether the configured Skeptic + judge models are present AND priced. NO billable call
// (ListModels is free). The sibling of scripts/preflight-models.mjs, which covers Gemini.
//
// WHY THIS EXISTS (L-1, 2026-07-27): the Gemini-only preflight was a HALF preflight. The
// cross-family model `meta-llama/llama-4-scout-17b-16e-instruct` was decommissioned by Groq
// with nothing watching, so every live Skeptic call threw and fail-closed to a HOLD --
// silently degrading every live packet to NO_ACTION. A fail-closed critic cannot raise an
// alarm about itself; this preflight is that alarm.
//
// Run: node --env-file=.env scripts/preflight-groq.mjs   (or: npm run preflight:groq)
// The key is read from process.env and used only to call the API; it is NEVER printed.
//
// Exit codes: 0 = all configured models present + priced · 1 = no key / request failed
//             2 = a configured model is MISSING from the key (the L-1 condition)
//             3 = present but NOT in the pinned pricing table (costUsd would throw)

const key = process.env.GROQ_API_KEY?.trim();
if (!key) {
  console.error("FAIL: GROQ_API_KEY is not set (load it with: node --env-file=.env ...).");
  process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/models", {
  headers: { Authorization: `Bearer ${key}` }
});
if (!res.ok) {
  console.error(
    `FAIL: Groq ListModels request failed (${res.status} ${res.statusText}). ` +
      "Check the key is valid at console.groq.com."
  );
  process.exit(1);
}

const data = await res.json();
const ids = (data.data ?? []).map((m) => m.id).filter((id) => typeof id === "string").sort();

// Same resolution as lib/agents/cross-family.ts GROQ_DEFAULT_MODEL + the per-consumer
// overrides in skeptic.ts (SKEPTIC_MODEL) and evals/judge.ts (JUDGE_MODEL). This is a plain
// Node script, so the default is duplicated BY NECESSITY -- a NAMED LOCKSTEP PAIR (lesson
// R-8: a preflight that validates a DIFFERENT model than the app calls is a false green).
// `evals/cross-family-preflight.test.ts` pins the two together so drift fails the suite.
const GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b";

// Mirrors lib/agents/pricing.ts GROQ_PRICING. costUsd() THROWS on an unpriced model, so a
// present-but-unpriced model is still a broken live path -- checked, not assumed.
const PRICED = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "meta-llama/llama-4-scout-17b-16e-instruct"
]);

const configured = [
  { role: "Skeptic", model: process.env.SKEPTIC_MODEL?.trim() || GROQ_DEFAULT_MODEL },
  { role: "judge", model: process.env.JUDGE_MODEL?.trim() || GROQ_DEFAULT_MODEL }
];

console.log(`Available models on this Groq key: ${ids.length}`);
for (const id of ids) console.log(` - ${id}`);
console.log("");

let missing = 0;
let unpriced = 0;
for (const { role, model } of configured) {
  const present = ids.includes(model);
  const priced = PRICED.has(model);
  if (!present) missing++;
  else if (!priced) unpriced++;
  console.log(
    `${role.padEnd(8)} model "${model}": ` +
      (present
        ? priced
          ? "AVAILABLE + PRICED"
          : "AVAILABLE but NOT PRICED -- costUsd() will throw; add it to GROQ_PRICING"
        : "MISSING FROM THIS KEY -- the cross-family critic is DOWN (fails closed to NO_ACTION)")
  );
}

if (missing) {
  console.error(
    "\nFAIL: a configured cross-family model is not served by this key. Every live run will " +
      "fail-closed to NO_ACTION. Re-probe candidates for json_schema support before repointing " +
      "(only some Groq models support structured output)."
  );
  process.exit(2);
}
if (unpriced) {
  console.error("\nFAIL: a configured model is missing from the pinned pricing table.");
  process.exit(3);
}
console.log("\nOK: cross-family preflight clean.");
process.exit(0);
