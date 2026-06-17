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
