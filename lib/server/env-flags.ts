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

// Phase 3 (the agentic rework capstone): route the run through the tool-using Investigator
// LOOP instead of the deterministic waterfall. DEFAULT OFF -- the loop ships dark and is
// promoted to default-on only by the owner once the P7 trajectory evals show it beats the
// waterfall at acceptable cost. A flag-OFF run takes the unchanged waterfall, byte-for-byte.
// NOTE: this only governs the ARCHITECTURE; the loop still AND-gates every billable call on
// liveAiEnabled() (a flag-ON but key-OFF run has no model to drive the loop, so the
// orchestrator routes to the waterfall -- see lib/agents/actionops/index.ts).
export function agentLoopEnabled(): boolean {
  return envBool("ENABLE_AGENT_LOOP");
}
