// Dependency-free environment-flag predicates shared by the security layer
// (lib/server/security.ts) and the agent runtime (lib/agents/run.ts). NO AI-SDK
// or other heavy imports -- safe to pull into a per-request auth path, and the
// single source of truth so the two cannot drift (Codex P2.7 finding).

// Robust boolean parse: trim + lowercase, accept the common truthy forms. An
// operator who sets REQUIRE_APPROVAL_TOKEN=True / =1 / =yes must NOT be silently
// left authless -- the fail-open that a strict `=== "true"` check caused.
export function envBool(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

// Live AI is on only when explicitly enabled AND a key is present. Single source
// of truth -- both the pipeline and the fail-closed auth check call this one.
export function liveAiEnabled(): boolean {
  return envBool("ENABLE_LIVE_AI") && Boolean(process.env.GEMINI_API_KEY?.trim());
}

// Phase 4 (the cross-family Skeptic critic): whether the live adversarial Skeptic GATE is active.
// The Skeptic shares the Groq key with the no-unsupported-claims judge (cross-family.ts); this flag
// DECOUPLES the gate's activation from the mere presence of that key, so a judge-only deployment does
// not silently gain an outbound-action gate it never opted into. DEFAULT ON (Phase 4 is a core rework
// feature and its behavior is corroboration-scoped, not over-rejecting single authoritative sources);
// the caller still AND-gates on a Groq key being present. Set ENABLE_SKEPTIC=false to run the
// deterministic affirmative pass instead (the pre-Phase-4 waterfall gate).
export function skepticGateEnabled(): boolean {
  // Explicit opt-OUT wins; absent/empty -> on. (Symmetric with envBool's truthy set.)
  const v = process.env.ENABLE_SKEPTIC?.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

// Phase 3 (the agentic rework capstone): route the run through the tool-using Investigator
// LOOP instead of the deterministic waterfall. DEFAULT ON -- promoted to default-on by the owner
// (2026-06-29) once the P7 trajectory evals showed it ACTs on the corroborated authoritative
// flagship and MEETS the documented promotion criterion (no safety regression, composite
// same-or-better, within the $5 cap) live. Set ENABLE_AGENT_LOOP=false to run the deterministic
// waterfall instead -- that opt-out path is BYTE-FOR-BYTE the pre-Phase-3 waterfall (the parity
// moat is unchanged; only the default flipped). NOTE: this only governs the ARCHITECTURE; the loop
// still AND-gates every billable call on liveAiEnabled() (a key-OFF run has no model to drive the
// loop, so the orchestrator routes to the waterfall -- see lib/agents/actionops/index.ts).
export function agentLoopEnabled(): boolean {
  // Explicit opt-OUT wins; absent/empty -> on. (Symmetric with skepticGateEnabled / envBool's truthy set.)
  const v = process.env.ENABLE_AGENT_LOOP?.trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

// D5 (the customs enforcement-defense DESKTOP SURFACE): whether the /customs route is
// mounted at all. DEFAULT OFF -- the surface is purely additive and flag-gated, so an
// unset deploy is byte-identical to the pre-D5 product (the route simply 404s). Uses the
// shared envBool truthy set; set ENABLE_CUSTOMS_DESK=true (/1/yes/on) to expose the desk.
export function customsDeskEnabled(): boolean {
  return envBool("ENABLE_CUSTOMS_DESK");
}
