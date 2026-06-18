// The canonical bidirectional citation check -- the SINGLE source of truth for the
// claims[] <-> numeral <-> sourcePath contract, shared by both sides of the seam
// (D.4). The PRODUCE-time gatekeeper (lib/agents/actionops/gatekeeper.ts) and the
// GRADE-time grader (gradeCitationCoverage in lib/evals/graders.ts) both call
// collectCitationFailures here; neither owns a private copy.
//
// WHY this module exists: before D.4 the gatekeeper only checked sourcePath was
// non-empty while the grader ran the full check, so a packet could clear the
// gatekeeper for human review and still violate the citation contract the grader
// enforces at merge time -- two definitions that could drift, the exact gap this
// closes. With one function the produce-time clearance provably satisfies the same
// contract the grade-time gate checks. Mirrors the D.3 simulation-math extraction:
// the grade/produce independence that matters lives in the hand-pinned tests, not
// in code identity; this module just removes the divergence surface.
//
// Dependency note: this pipeline module imports the leaf eval primitives
// (numerals, source-path) -- a pipeline->evals edge, not a cycle, because those are
// leaf modules with no back-edge. The primitives are NOT relocated (no wider
// ripple); only the citation-specific constants (roots/units/segment helpers) move
// here from graders.ts, which had no external importers.

import { extractSourceableNumerals, normalizeNumeral, sameFigure } from "@/lib/evals/numerals";
import { resolveSourcePath } from "@/lib/evals/source-path";
import type { ExposureResult, PublicSignal, Simulation, SupplierMessageDraft, ThreatCard } from "@/lib/schemas";

// A claim may only cite the Dispatcher's structured INPUTS -- the Sentinel threat
// card, the public signals, the Atlas exposures, and the Simulator output. It may
// NOT cite the Dispatcher's own output (supplierMessages), the Strategist
// playbooks, action items, or run metadata: a claim that self-cites
// `supplierMessages[0].claims[0].value` is circular self-grounding that satisfies
// both citation directions while proving nothing ("sourcePath resolves into
// structured INPUTS", Success_Criteria).
export const CITATION_INPUT_ROOTS = new Set(["threatCard", "publicSignals", "exposureResults", "simulation"]);

// The unit a structured leaf field carries, keyed by the leaf name a sourcePath
// ends in. A claim's stated `unit` must agree with the field it cites, so a
// same-VALUE wrong-FIELD citation (e.g. a "days" claim pointed at a USD field that
// happens to share the number) is caught on the unit even when the value matches.
export const FIELD_UNITS: Record<string, string> = {
  revenueAtRiskUsd: "USD",
  days: "days",
  exposureScore: "score",
  confidence: "ratio"
};

export function rootSegment(path: string): string {
  return path.split(/[.[]/)[0];
}

export function leafKey(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last.replace(/\[\d+\]/g, "");
}

// The minimal shape collectCitationFailures resolves against. It is a structural
// SUBSET of DecisionPacketV2 (a full packet satisfies it), so the GRADE side passes
// the whole packet and the PRODUCE side (the gatekeeper) assembles exactly these
// fields from the slices it already holds plus simulation -- both feed the SAME
// resolver, so a path like `simulation.horizons[0].days` resolves identically in
// both places. The optional inputs (publicSignals, simulation) are absent on
// Tier-1 / signal-less runs; a claim citing an absent root then fails to resolve,
// which is the correct outcome (do not cite what is not there).
export type CitationCheckRoot = {
  supplierMessages: SupplierMessageDraft[];
  threatCard?: ThreatCard;
  publicSignals?: PublicSignal[];
  exposureResults?: ExposureResult[];
  simulation?: Simulation;
};

// The full bidirectional citation check. Returns the list of human-readable
// failure strings (empty iff the packet satisfies the contract).
//
// Forward (claim -> packet): every claim's sourcePath must (a) cite a structured
// INPUT root (not the Dispatcher's own output -- no circular self-citation),
// (b) resolve into the packet, (c) match its value, and (d) carry a unit
// consistent with the cited field. So a self-citation fails on the root, a
// wrong-context number (right value, wrong field) fails on the value, and a
// same-value/wrong-field citation fails on the unit. Reverse (prose -> claim):
// every sourceable figure the prose asserts matches some claim's value; an
// unparseable figure form fails rather than risk a silent misread.
//
// Deterministic boundary (disclosed, not hidden): the reverse check confirms a
// claim of EQUAL VALUE exists; it does not bind a prose figure to one specific
// claim span. So a prose figure that value-collides with an unrelated same-unit
// claim would pass here -- that residual semantic binding is the key-gated LLM
// judge's job (G-5) and the runtime gatekeeper's structured-input cross-check, not
// this deterministic check's.
export function collectCitationFailures(root: CitationCheckRoot): string[] {
  const failures: string[] = [];

  for (const msg of root.supplierMessages) {
    const claimValues: number[] = [];
    for (const claim of msg.claims) {
      const rootName = rootSegment(claim.sourcePath);
      if (!CITATION_INPUT_ROOTS.has(rootName)) {
        failures.push(
          `message ${msg.id}: claim sourcePath "${claim.sourcePath}" cites non-input "${rootName}" ` +
            `(claims must trace to threat/signals/exposure/simulation, not Dispatcher output)`
        );
        continue;
      }
      const resolution = resolveSourcePath(root, claim.sourcePath);
      if (!resolution.resolved) {
        failures.push(`message ${msg.id}: claim sourcePath "${claim.sourcePath}" does not resolve`);
        continue;
      }
      const claimNumber = normalizeNumeral(claim.value);
      if (claimNumber !== null) {
        claimValues.push(claimNumber);
        const resolved = normalizeNumeral(resolution.value);
        if (resolved === null || !sameFigure(resolved, claimNumber)) {
          failures.push(
            `message ${msg.id}: wrong-context number -- claim value ${claim.value} ` +
              `resolves to ${String(resolution.value)} at "${claim.sourcePath}"`
          );
        }
      }
      const expectedUnit = FIELD_UNITS[leafKey(claim.sourcePath)];
      if (expectedUnit && claim.unit.toLowerCase() !== expectedUnit.toLowerCase()) {
        failures.push(
          `message ${msg.id}: unit mismatch -- claim unit "${claim.unit}" cites a ` +
            `${expectedUnit} field at "${claim.sourcePath}"`
        );
      }
    }

    const prose = `${msg.subject ?? ""}\n${msg.body}`;
    const { figures, unparseable } = extractSourceableNumerals(prose);
    for (const numeral of figures) {
      if (!claimValues.some((value) => sameFigure(value, numeral))) {
        failures.push(`message ${msg.id}: unsourced numeral ${numeral} in prose (no backing claim)`);
      }
    }
    for (const form of unparseable) {
      failures.push(`message ${msg.id}: unverifiable numeral form "${form}" (use a plain figure)`);
    }
  }

  return failures;
}
