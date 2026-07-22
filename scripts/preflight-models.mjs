// Free Gemini preflight: list the models available on GEMINI_API_KEY and report whether
// the configured model is present. NO billable call (ListModels is free). Mirrors the
// production preflight (lib/agents/run.ts assertConfiguredModelAvailable + listGeminiModels)
// as a manual reality check to run BEFORE any paid live pass.
//
// Run: node --env-file=.env scripts/preflight-models.mjs
// The key is read from process.env (loaded by --env-file) and used only to call the API;
// it is NEVER printed.

const key = process.env.GEMINI_API_KEY?.trim();
if (!key) {
  console.error("FAIL: GEMINI_API_KEY is not set (load it with: node --env-file=.env ...).");
  process.exit(1);
}

const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
);
if (!res.ok) {
  console.error(
    `FAIL: ListModels request failed (${res.status} ${res.statusText}). ` +
      "Check the key is valid and the Generative Language API is enabled on the project."
  );
  process.exit(1);
}

const data = await res.json();
const names = (data.models ?? []).map((m) => m.name).filter((n) => typeof n === "string");
const bare = names.map((n) => n.replace(/^models\//, ""));

// Same resolution as resolvedGeminiModel() in lib/agents/run.ts (this is a plain-Node
// script, so the default is duplicated by necessity -- keep the two in lockstep): a
// preflight that validates a DIFFERENT model than the app will call is a false green.
const wanted = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
const wantedAvailable = bare.includes(wanted);

console.log(`Available models on this key: ${names.length}`);
// Show the generateContent-capable gemini chat models (the ones we'd actually call).
for (const m of data.models ?? []) {
  const methods = m.supportedGenerationMethods ?? m.supported_generation_methods ?? [];
  if (typeof m.name === "string" && m.name.includes("gemini") && methods.includes?.("generateContent")) {
    console.log(` - ${m.name.replace(/^models\//, "")}`);
  }
}
console.log(`\nConfigured model "${wanted}" available: ${wantedAvailable ? "YES" : "NO"}`);
process.exit(wantedAvailable ? 0 : 2);
