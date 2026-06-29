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

  it("a BLANK/whitespace source does NOT count as a second outlet (Codex MED)", () => {
    // One real source + a blank-source signal must stay single-source -> not corroborated,
    // or a sourceless signal could bypass the NO_ACTION gate.
    for (const blank of ["", "   "]) {
      const { checks } = runVerifier(
        ctx([sig("a", "Reuters", "https://r/1"), sig("b", blank, "https://x/1")]),
        threat()
      );
      expect(checks.sourceCount).toBe(1);
      expect(checks.corroborated).toBe(false);
    }
  });
});

// THREE-STATE geo coherence (AGREES / UNCONFIRMED / CONFLICT) -- the (A) split + the Codex [P1]
// normalization closure. The load-bearing guard: a SOURCE country is a LOOSE string (GDELT/NWS emit
// "United States" / "Japan"), while the threat country is ISO. Both sides MUST be normalized to ISO
// before comparing, or a raw compare reads a real US finding with US sources as a CONFLICT and the
// Skeptic gate false-vetoes it on a critic reject. These pin the normalization deterministically.
describe("Verifier three-state geo coherence (normalized both sides; Codex [P1] closure)", () => {
  // A signal in a given (possibly full-name) country; distinct source labels so corroboration is real.
  const sigIn = (id: string, country: string): PublicSignal => ({
    ...sig(id, `Source ${id}`, `https://x/${id}`),
    location: { country }
  });
  const threatIn = (country?: string): ThreatCard => ({
    ...threat(),
    location: country ? { country } : {}
  });

  it("a full-name source AGREES with an ISO threat country -- NO false CONFLICT (the [P1] regression guard)", () => {
    // threat US + sources "United States" must normalize to US -> AGREES, not CONFLICT.
    const { checks } = runVerifier(ctx([sigIn("a", "United States"), sigIn("b", "USA")]), threatIn("US"));
    expect(checks.geo).toBe("AGREES");
  });

  it("a genuinely DIFFERENT country is a CONFLICT (the precise veto input)", () => {
    // threat US, every source resolves to JP -> a real geographic contradiction.
    const { checks } = runVerifier(ctx([sigIn("a", "Japan"), sigIn("b", "JP")]), threatIn("US"));
    expect(checks.geo).toBe("CONFLICT");
  });

  it("AGREES wins when ANY source matches, even if another differs", () => {
    const { checks } = runVerifier(ctx([sigIn("a", "United States"), sigIn("b", "Japan")]), threatIn("US"));
    expect(checks.geo).toBe("AGREES");
  });

  it("a blank or UNRECOGNIZED source country is UNCONFIRMED, never a phantom CONFLICT", () => {
    for (const junk of ["", "   ", "Atlantis", "Westeros"]) {
      const { checks } = runVerifier(ctx([sigIn("a", junk)]), threatIn("US"));
      expect(checks.geo, `country "${junk}" must not create a conflict`).toBe("UNCONFIRMED");
    }
  });

  it("a chokepoint threat with NO country is UNCONFIRMED, never a conflict (the flagship shape)", () => {
    // The Hormuz shape: no threat country (region + chokepoint) -> UNCONFIRMED even when the sources
    // DO carry comparable geography (here US/JP), because there is no single country to corroborate.
    const { checks } = runVerifier(ctx([sigIn("a", "United States"), sigIn("b", "Japan")]), threatIn(undefined));
    expect(checks.geo).toBe("UNCONFIRMED");
  });
});
