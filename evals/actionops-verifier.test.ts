import { describe, expect, it } from "vitest";

import { runVerifier } from "@/lib/agents/actionops/verifier";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { PublicSignal, ThreatCard } from "@/lib/schemas";

// Verifier corroboration counts INDEPENDENT sources, not raw signals (Codex BLOCKER-1).
// This is load-bearing for the NO_ACTION refusal gate: if duplicated same-source signals
// counted as corroboration, an attacker (or a noisy GDELT fetch returning the same outlet
// twice) could flip a thin-evidence refusal to ACT -- the exact accountability the refusal
// exists to provide.

const BASE = "2026-06-17T12:00:00.000Z";

function sig(id: string, source: string, sourceUrl: string): PublicSignal {
  return {
    id,
    source,
    sourceUrl,
    fetchedAt: BASE,
    eventType: "X",
    location: { country: "US" },
    severity: "MEDIUM",
    summary: "s",
    freshnessMinutes: 0,
    status: "CACHED"
  };
}

function threat(): ThreatCard {
  return {
    id: "T",
    eventType: "PORT_DISRUPTION",
    severity: "MEDIUM",
    location: { country: "US" },
    summary: "t",
    evidenceUrls: [],
    confidence: 0.3,
    createdAt: BASE
  };
}

// runVerifier only reads ctx.signals + ctx.baseDateIso; scenario/suppliers are unused here.
function ctx(signals: PublicSignal[]): ActionOpsContext {
  return {
    scenario: {} as ActionOpsContext["scenario"],
    signals,
    suppliers: [],
    baseDateIso: BASE
  };
}

describe("Verifier corroboration counts independent sources (Codex BLOCKER-1)", () => {
  it("two signals from the SAME source are NOT corroborated (one outlet, not two)", () => {
    const { checks } = runVerifier(
      ctx([sig("a", "GDELT DOC 2.0", "https://g/1"), sig("b", "GDELT DOC 2.0", "https://g/2")]),
      threat()
    );
    expect(checks.sourceCount).toBe(1);
    expect(checks.corroborated).toBe(false);
  });

  it("two signals from DIFFERENT sources ARE corroborated", () => {
    const { checks } = runVerifier(
      ctx([sig("a", "GDELT DOC 2.0", "https://g/1"), sig("b", "Reuters", "https://r/1")]),
      threat()
    );
    expect(checks.sourceCount).toBe(2);
    expect(checks.corroborated).toBe(true);
  });

  it("source identity is case/space-insensitive (formatting cannot fake a second source)", () => {
    const { checks } = runVerifier(
      ctx([sig("a", "GDELT DOC 2.0", "https://g/1"), sig("b", " gdelt doc 2.0 ", "https://g/2")]),
      threat()
    );
    expect(checks.corroborated).toBe(false);
  });
});
