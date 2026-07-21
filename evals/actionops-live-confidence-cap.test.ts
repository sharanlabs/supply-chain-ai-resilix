import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ACTION_CONFIDENCE_FLOOR,
  capUncorroboratedLiveConfidence
} from "@/lib/agents/actionops/recommendation";

// A-01/D-01 -- the live confidence cap, pinned on BOTH live routes.
//
// WHY THIS FILE EXISTS. The 2026-07-16 re-review accepted A-01 ("live model-authored
// confidence can bypass the refusal gate") and applied a cap -- but only in the waterfall
// (lib/agents/actionops/index.ts). ENABLE_AGENT_LOOP DEFAULTS ON (lib/server/env-flags.ts),
// so the agent loop in investigator.ts is the DEFAULT live route, and it went on deciding
// with the uncapped model value. The fix was recorded as done while the default path was
// still exposed, and nothing failed, because no test pinned the cap at all.
//
// So this file pins two things: the helper's SEMANTICS (below), and the COUPLING -- that both
// live routes actually route their decision through it (the recorded lesson: when a guarantee
// depends on two components being jointly complete, pin the coupling, don't trust discipline).

describe("capUncorroboratedLiveConfidence -- semantics", () => {
  const card = (confidence: number) => ({ id: "THR-1", confidence });

  it("caps an uncorroborated LIVE card from above the floor to below it", () => {
    const out = capUncorroboratedLiveConfidence(card(0.92), { live: true, corroborated: false });
    expect(out.confidence).toBeLessThan(ACTION_CONFIDENCE_FLOOR);
    expect(out.confidence).toBe(Math.max(0, ACTION_CONFIDENCE_FLOOR - 0.05));
  });

  it("caps a card sitting EXACTLY on the floor (the boundary is not a way through)", () => {
    const out = capUncorroboratedLiveConfidence(card(ACTION_CONFIDENCE_FLOOR), {
      live: true,
      corroborated: false
    });
    expect(out.confidence).toBeLessThan(ACTION_CONFIDENCE_FLOOR);
  });

  it("leaves a CORROBORATED live card untouched -- the model keeps its value once evidence agrees", () => {
    const input = card(0.92);
    expect(capUncorroboratedLiveConfidence(input, { live: true, corroborated: true })).toBe(input);
  });

  it("leaves DETERMINISTIC/replay runs byte-identical -- the frozen fixtures must not move", () => {
    const input = card(0.92);
    expect(capUncorroboratedLiveConfidence(input, { live: false, corroborated: false })).toBe(input);
  });

  it("does not RAISE an already-low card (it is a cap, never a floor)", () => {
    const input = card(0.1);
    expect(capUncorroboratedLiveConfidence(input, { live: true, corroborated: false })).toBe(input);
  });

  it("preserves every other field on the card (it narrows one number, nothing else)", () => {
    const out = capUncorroboratedLiveConfidence(
      { id: "THR-1", severity: "HIGH", confidence: 0.9 },
      { live: true, corroborated: false }
    );
    expect(out.id).toBe("THR-1");
    expect(out.severity).toBe("HIGH");
  });
});

// Source-scan, not a mock: it fails on the actual code a regression would introduce. A future
// edit that drops the helper from either route, or feeds decideRecommendation the RAW card
// again, fails here -- which is precisely what did NOT happen in July 2026.
describe("both live routes are COUPLED to the shared cap (structural)", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const waterfall = read("../lib/agents/actionops/index.ts");
  const loop = read("../lib/agents/actionops/investigator.ts");

  it("the waterfall imports and applies the shared cap", () => {
    expect(waterfall).toMatch(/capUncorroboratedLiveConfidence/);
  });

  it("the agent loop -- the DEFAULT live route -- imports and applies the shared cap", () => {
    expect(loop).toMatch(/capUncorroboratedLiveConfidence/);
  });

  it("the loop decides on the GATED card, never the raw model-authored one", () => {
    // The exact regression that shipped: decideRecommendation({ confidence: threatCard.confidence })
    // in investigator.ts, reading the uncapped card.
    const decideCall = loop.match(/decideRecommendation\(\{[\s\S]{0,200}?\}\)/);
    expect(decideCall, "decideRecommendation call not found in investigator.ts").toBeTruthy();
    expect(decideCall![0]).toMatch(/gatedThreatCard\.confidence/);
    expect(decideCall![0]).not.toMatch(/[^d]threatCard\.confidence/);
  });

  it("neither route re-implements the cap inline (one helper, no drifting copies)", () => {
    // A hand-rolled `ACTION_CONFIDENCE_FLOOR - 0.05` in a consumer is the duplicated-invariant
    // smell the helper exists to remove.
    for (const [name, src] of [
      ["index.ts", waterfall],
      ["investigator.ts", loop]
    ] as const) {
      expect(src, `${name} re-implements the cap inline`).not.toMatch(
        /ACTION_CONFIDENCE_FLOOR\s*-\s*0\.05/
      );
    }
  });
});
