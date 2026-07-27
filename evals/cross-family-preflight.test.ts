import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GROQ_DEFAULT_MODEL } from "@/lib/agents/cross-family";
import { GROQ_PRICING, costUsd } from "@/lib/agents/pricing";
import { resolvedSkepticModel } from "@/lib/agents/actionops/skeptic";

// L-1 REGRESSION TEETH (2026-07-27). The cross-family Skeptic model was decommissioned by Groq
// with NOTHING watching: the Gemini-only preflight did not cover it, the gated live suite injects
// a stub ACCEPT Skeptic (so it never exercises the real critic), and no test referenced the model
// id at all. Every live run therefore fail-closed to NO_ACTION -- and because the critic fails
// CLOSED by design, it could never raise an alarm about itself.
//
// These checks are deterministic (no network). The LIVE availability check is the job of
// `npm run preflight:groq`; what is pinned HERE is everything that can be pinned offline:
//   1. the script's duplicated default matches the code's (the R-8 named-lockstep-pair rule), and
//   2. the configured model is PRICED, since costUsd() throws on an unknown model.
//
// Deliberately NOT f(x)===f(x) (lesson #27): the expected value is READ FROM THE SCRIPT'S TEXT,
// not recomputed through the module the script is meant to mirror. If either side moves alone,
// this fails.

const PREFLIGHT_PATH = resolve(__dirname, "../scripts/preflight-groq.mjs");

function readPreflightSource(): string {
  return readFileSync(PREFLIGHT_PATH, "utf8");
}

function extractScriptDefault(source: string): string {
  const match = source.match(/const GROQ_DEFAULT_MODEL = "([^"]+)"/);
  if (!match) {
    throw new Error(
      "preflight-groq.mjs no longer declares `const GROQ_DEFAULT_MODEL = \"...\"` -- the lockstep " +
        "guard cannot read it. Restore the declaration or update this test deliberately."
    );
  }
  return match[1];
}

function extractScriptPricedSet(source: string): string[] {
  const block = source.match(/const PRICED = new Set\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error("preflight-groq.mjs no longer declares a `PRICED` Set.");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("cross-family model: the preflight script and the app agree (L-1 lockstep)", () => {
  it("the script's duplicated default is the SAME id the app actually calls", () => {
    // The script is plain Node and cannot import the TS source of truth, so the default is
    // duplicated by necessity. That makes it a NAMED LOCKSTEP PAIR -- pinned here so a repoint
    // on one side alone fails loudly instead of producing a false-green preflight (lesson R-8).
    expect(extractScriptDefault(readPreflightSource())).toBe(GROQ_DEFAULT_MODEL);
  });

  it("the script's PRICED mirror covers every model in the real pricing table", () => {
    const scriptPriced = extractScriptPricedSet(readPreflightSource());
    for (const model of Object.keys(GROQ_PRICING)) {
      expect(
        scriptPriced,
        `preflight-groq.mjs PRICED is missing "${model}" -- it would report a priced model as unpriced`
      ).toContain(model);
    }
  });
});

describe("cross-family model: the configured id is billable (costUsd would otherwise throw)", () => {
  it("the default model has a pinned pricing row", () => {
    // costUsd() throws loudly on an unknown model id. A repoint that forgets the pricing row
    // turns every live cross-family call into a throw -> fail-closed HOLD -> NO_ACTION, i.e. the
    // exact L-1 symptom by a different cause. Pin it.
    expect(GROQ_PRICING[GROQ_DEFAULT_MODEL]).toBeDefined();
    expect(() => costUsd(GROQ_DEFAULT_MODEL, 1_000, 1_000)).not.toThrow();
    expect(costUsd(GROQ_DEFAULT_MODEL, 1_000, 1_000)).toBeGreaterThan(0);
  });

  it("the Skeptic's resolved model is priced too (env override included)", () => {
    // resolvedSkepticModel() honours SKEPTIC_MODEL. Whatever it resolves to must be billable,
    // or the critic dies on its first call in exactly the fail-closed-and-silent way L-1 did.
    const model = resolvedSkepticModel();
    expect(
      GROQ_PRICING[model],
      `Skeptic model "${model}" is not in GROQ_PRICING -- costUsd() will throw on the live path`
    ).toBeDefined();
  });

  it("the retired llama-4-scout id is NOT the default any more (the L-1 regression itself)", () => {
    // Named explicitly so a revert to the decommissioned id fails with a message that explains
    // WHY, rather than reappearing as a mysterious wave of NO_ACTION packets.
    expect(GROQ_DEFAULT_MODEL).not.toBe("meta-llama/llama-4-scout-17b-16e-instruct");
  });
});
