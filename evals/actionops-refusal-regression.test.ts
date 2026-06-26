import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { getActionOpsScenario, type ActionOpsScenario } from "@/lib/data/actionops-scenarios";
import { runVerifier } from "@/lib/agents/actionops/verifier";
import { ingestSeed } from "@/lib/ingest/seed-suppliers";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { PublicSignal, ThreatCard } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Phase 7 -- the NAMED NO_ACTION / corroboration regression suite. RESILIX's accountability
// differentiator is "the agent that refuses when it cannot prove it", and the load-bearing rule
// is that corroboration counts DISTINCT INDEPENDENT SOURCES -- not raw signal count -- so two
// articles from the SAME outlet (or a blank-source signal) cannot fake the >=2-source bar and
// bypass the refusal gate.
//
// CONSOLIDATION MAP (this suite is the index; it does NOT duplicate what is already green):
//   - thin-evidence single unverified source REFUSES (withholds drafts/playbooks/actionItems/
//     recoveryOptions, states the gap) ......... evals/actionops-no-action.test.ts
//   - a single AUTHORITATIVE source still ACTS (the discriminator is verification, not count)
//     (SCN-HURRICANE / SCN-BANKRUPTCY) ......... evals/actionops-no-action.test.ts
//   - the Skeptic-hold path forces NO_ACTION end-to-end (a cross-family REJECT) ...............
//     evals/actionops-skeptic.test.ts
//
// THE GAP THIS SUITE FILLS (covered internally by computeChecks but proven NOWHERE end-to-end):
//   distinct-source corroboration -- two SAME-source low-confidence signals REFUSE, two DISTINCT-
//   source signals ACT, and a BLANK-source signal cannot count toward the >=2-source bar -- proven
//   both at the Verifier unit and through the FULL pipeline (buildDecisionPacket key-OFF, via the
//   Phase-7 scenarioOverride seam). All deterministic, NO network.
// ---------------------------------------------------------------------------

const BASE_DATE = "2026-06-18T12:00:00.000Z";

// The Skeptic path is gated on `live || an injected generate`, neither of which a key-OFF
// buildDecisionPacket sets -- but neutralize GROQ_API_KEY defensively so the suite is deterministic
// regardless of the runner's env (matching actionops-skeptic.test.ts hygiene).
const savedGroqKey = process.env.GROQ_API_KEY;
beforeEach(() => {
  delete process.env.GROQ_API_KEY;
});
afterEach(() => {
  if (savedGroqKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = savedGroqKey;
});

// A US-located public signal with a chosen SOURCE label (the field corroboration counts). All
// other fields are held constant so ONLY the source identity varies across a test's signals.
function usSignal(id: string, source: string): PublicSignal {
  return {
    id,
    source,
    sourceUrl: "https://api.gdeltproject.org/api/v2/doc/doc?query=west+coast+port",
    fetchedAt: BASE_DATE,
    eventType: "PORT_RUMOR",
    location: { region: "US West Coast", country: "US" },
    severity: "MEDIUM",
    summary: "An unconfirmed report alleges a US West Coast port has halted operations.",
    freshnessMinutes: 10,
    status: "CACHED"
  };
}

function usThreat(): ThreatCard {
  return {
    id: "THR-CORR",
    eventType: "PORT_DISRUPTION",
    severity: "MEDIUM",
    location: { region: "US West Coast", country: "US" },
    summary: "A US West Coast port disruption.",
    evidenceUrls: ["https://api.gdeltproject.org/api/v2/doc/doc?query=west+coast+port"],
    confidence: 0.35,
    createdAt: BASE_DATE
  };
}

function ctxWith(signals: PublicSignal[]): ActionOpsContext {
  return { scenario: getActionOpsScenario(), signals, suppliers: ingestSeed().suppliers, baseDateIso: BASE_DATE };
}

// Clone the thin-evidence refusal scenario (low confidence 0.35, a real US LOGISTICS exposure) and
// swap in chosen signals -- so ONLY the source-distinctness varies, and the act/refuse outcome is
// driven entirely by corroboration end-to-end through the pipeline.
function thinEvidenceWithSignals(signals: PublicSignal[]): ActionOpsScenario {
  const scenario = structuredClone(getActionOpsScenario("SCN-THIN-EVIDENCE"));
  scenario.replaySignals = signals;
  return scenario;
}

// ---------------------------------------------------------------------------
// 1. Verifier unit -- corroboration counts DISTINCT outlets (the rule, in isolation).
// ---------------------------------------------------------------------------
describe("Verifier: corroboration counts distinct independent sources, not raw signal count", () => {
  it("two SAME-source signals are ONE outlet -> not corroborated", () => {
    const { checks } = runVerifier(
      ctxWith([usSignal("SIG-A", "GDELT DOC 2.0"), usSignal("SIG-B", "GDELT DOC 2.0")]),
      usThreat()
    );
    expect(checks.sourceCount).toBe(1);
    expect(checks.corroborated).toBe(false);
  });

  it("two DISTINCT-source signals are two outlets -> corroborated", () => {
    const { checks } = runVerifier(
      ctxWith([usSignal("SIG-A", "GDELT DOC 2.0"), usSignal("SIG-B", "Reuters")]),
      usThreat()
    );
    expect(checks.sourceCount).toBe(2);
    expect(checks.corroborated).toBe(true);
  });

  it("a BLANK/whitespace source cannot count toward the >=2-source bar (Codex MED guard)", () => {
    const { checks } = runVerifier(
      ctxWith([usSignal("SIG-A", "GDELT DOC 2.0"), usSignal("SIG-B", "   ")]),
      usThreat()
    );
    expect(checks.sourceCount).toBe(1); // the blank source is filtered out
    expect(checks.corroborated).toBe(false);
  });

  it("source identity is case/space-insensitive (one outlet, varied formatting)", () => {
    const { checks } = runVerifier(
      ctxWith([usSignal("SIG-A", "GDELT DOC 2.0"), usSignal("SIG-B", " gdelt doc 2.0 ")]),
      usThreat()
    );
    expect(checks.sourceCount).toBe(1);
    expect(checks.corroborated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. End-to-end -- the distinct-source rule drives the act/refuse gate through the FULL pipeline.
//    This is the gap: nothing proved the Verifier's distinct-source count flows to NO_ACTION/ACT.
// ---------------------------------------------------------------------------
describe("pipeline: distinct-source corroboration drives NO_ACTION vs ACT (key-OFF, no network)", () => {
  it("two SAME-source low-confidence signals REFUSE (NO_ACTION, outbound action withheld)", async () => {
    const packet = await buildDecisionPacket({
      scenarioOverride: thinEvidenceWithSignals([
        usSignal("SIG-DUP-1", "GDELT DOC 2.0"),
        usSignal("SIG-DUP-2", "GDELT DOC 2.0")
      ]),
      live: false
    });
    expect(packet.recommendation).toBe("NO_ACTION");
    expect(packet.supplierMessages).toEqual([]);
    expect(packet.playbooks).toEqual([]);
    expect(packet.actionItems).toEqual([]);
    expect(packet.recoveryOptions ?? []).toEqual([]);
    expect((packet.missingEvidence?.length ?? 0)).toBeGreaterThan(0);
  });

  it("two DISTINCT-source signals ACT (corroboration met -> outbound action drafted)", async () => {
    const packet = await buildDecisionPacket({
      scenarioOverride: thinEvidenceWithSignals([
        usSignal("SIG-IND-1", "GDELT DOC 2.0"),
        usSignal("SIG-IND-2", "Reuters")
      ]),
      live: false
    });
    expect(packet.recommendation ?? "ACT").toBe("ACT");
    expect(packet.supplierMessages.length).toBeGreaterThan(0); // corroboration overrides low confidence
  });

  it("a real source + a BLANK-source signal still REFUSES (the blank cannot fake corroboration)", async () => {
    const packet = await buildDecisionPacket({
      scenarioOverride: thinEvidenceWithSignals([
        usSignal("SIG-REAL", "GDELT DOC 2.0"),
        usSignal("SIG-BLANK", "")
      ]),
      live: false
    });
    expect(packet.recommendation).toBe("NO_ACTION");
    expect(packet.supplierMessages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Consolidation anchors -- a thin REFERENCE that the other three guarantees still hold (the
//    DETAILED assertions live in the files named in the consolidation map; these anchors keep the
//    named suite honest as the index without duplicating those suites).
// ---------------------------------------------------------------------------
describe("consolidation anchors (detailed coverage referenced, not duplicated)", () => {
  it("thin-evidence single unverified source REFUSES (full detail: actionops-no-action.test.ts)", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-THIN-EVIDENCE", live: false });
    expect(packet.recommendation).toBe("NO_ACTION");
  });

  it("a single AUTHORITATIVE source still ACTS (full detail: actionops-no-action.test.ts)", async () => {
    const packet = await buildDecisionPacket({ scenarioId: "SCN-HURRICANE", live: false });
    expect(packet.recommendation ?? "ACT").toBe("ACT");
    expect(packet.supplierMessages.length).toBeGreaterThan(0);
  });

  it("the Skeptic-hold path forces NO_ACTION (full detail: actionops-skeptic.test.ts)", async () => {
    const packet = await buildDecisionPacket({
      live: false,
      skeptic: { generate: async () => ({ object: { accepted: false, reason: "over-trigger" } }) }
    });
    expect(packet.recommendation).toBe("NO_ACTION");
    expect(packet.supplierMessages).toEqual([]);
  });
});
