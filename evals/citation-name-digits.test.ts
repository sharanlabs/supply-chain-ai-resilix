import { describe, expect, it } from "vitest";

import { collectCitationFailures, type CitationCheckRoot } from "@/lib/pipeline/citation-check";
import type { ExposureResult, SupplierMessageDraft } from "@/lib/schemas";

// D.9 regression: a digit that is part of a WHITELISTED supplier name (the seed names carry
// numeric suffixes, e.g. "Abu Chemical Partners 078"; real names do too -- "3M", "7-Eleven")
// is a proper noun the Dispatcher is MEANT to echo, NOT a sourceable figure. The shared
// citation check must allow it, while STILL flagging any numeral that is neither claimed nor
// part of the name. This is the fix that unblocked the live Dispatcher (which addresses the
// supplier by name) from falsely failing the numeral firewall.

const exposure: ExposureResult = {
  id: "EXP-TEST-0",
  supplierId: "SUP-test",
  supplierName: "Abu Chemical Partners 078",
  country: "AE",
  sector: "CHEMICALS",
  exposureScore: 69,
  rationale: "CRITICAL risk tier; 44-day lead time.",
  evidenceIds: ["THR-test"]
};

function messageWith(body: string): SupplierMessageDraft {
  return {
    id: "MSG-SUP-test",
    supplierId: "SUP-test",
    channel: "email",
    subject: "Supply-chain disruption: contingency review",
    body,
    claims: [{ value: 69, unit: "score", sourcePath: "exposureResults[0].exposureScore" }],
    approvalRequired: true
  };
}

describe("citation check: digits within a whitelisted supplier name (D.9)", () => {
  it("ALLOWS a numeral that is part of the message's supplier name", () => {
    const root: CitationCheckRoot = {
      supplierMessages: [
        messageWith(
          "Dear Abu Chemical Partners 078 team, your exposure score for this event is 69. We are reviewing contingency options and will confirm after review."
        )
      ],
      exposureResults: [exposure]
    };
    // "078" -> 78 is part of the supplier name (allowed); 69 is backed by a claim. No failure.
    expect(collectCitationFailures(root)).toEqual([]);
  });

  it("STILL flags an unsourced numeral that is NOT part of the name (the fix is targeted)", () => {
    const root: CitationCheckRoot = {
      supplierMessages: [
        messageWith(
          "Dear Abu Chemical Partners 078 team, your exposure score is 69. We expect resolution within 5 days."
        )
      ],
      exposureResults: [exposure]
    };
    const failures = collectCitationFailures(root);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join(" ")).toMatch(/unsourced numeral 5\b/);
  });

  it("flags a fabricated numeral that COINCIDES with a name digit (span-bound, not value-based)", () => {
    // The name carries "078" (-> 78). A separate, fabricated "78" outside the echoed name span
    // must STILL be flagged -- the span-mask exempts only the literal name occurrence, closing the
    // engineered-collision hole the old value-based allowance had (where any numeral equal to a
    // name digit passed, so an uploaded "Acme 5000" could smuggle "5000").
    const root: CitationCheckRoot = {
      supplierMessages: [
        messageWith(
          "Dear Abu Chemical Partners 078 team, your exposure score is 69. We expect the lane to reopen within 78 days."
        )
      ],
      exposureResults: [exposure]
    };
    expect(collectCitationFailures(root).join(" ")).toMatch(/unsourced numeral 78\b/);
  });

  it("does NOT mask a numeric-only supplier name (an adversarial uploaded name stays flaggable)", () => {
    // A genuine name has letters and is masked; a digit-only "name" ("5000") is NOT masked, so a
    // fabricated "5000" cannot hide behind it.
    const numericName: ExposureResult = { ...exposure, supplierName: "5000" };
    const root: CitationCheckRoot = {
      supplierMessages: [messageWith("Dear 5000 team, we expect resolution within 5000 days.")],
      exposureResults: [numericName]
    };
    expect(collectCitationFailures(root).join(" ")).toMatch(/unsourced numeral 5000\b/);
  });
});
