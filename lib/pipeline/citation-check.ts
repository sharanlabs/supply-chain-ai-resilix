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
import type { ExposureResult, Playbook, PublicSignal, Simulation, SupplierMessageDraft, ThreatCard } from "@/lib/schemas";

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

// For an exposure-score citation `exposureResults[n].exposureScore`, return the
// SIBLING supplierId path `exposureResults[n].supplierId` -- the same n -- so the
// resolver can confirm the cited score belongs to THIS message's supplier. Returns
// null if the path is not an indexed exposureResults score (the binding check only
// applies to that exact shape). The replace swaps the trailing leaf for `supplierId`
// while preserving the `[n]` index.
function exposureSupplierIdSiblingPath(path: string): string | null {
  const match = /^exposureResults\[(\d+)\]\.exposureScore$/.exec(path);
  return match ? `exposureResults[${match[1]}].supplierId` : null;
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

      // SUPPLIER BINDING (the equal-value cross-supplier gap): an exposure-score claim
      // must cite THIS message's supplier's score, not another supplier's score that
      // happens to share the same value. The forward value/unit checks alone cannot
      // catch this -- two suppliers with an equal exposureScore make
      // `exposureResults[A].exposureScore` resolve + value-match for a message to
      // supplier B, so a draft could (mis)attribute B's risk to A's score. Bind the
      // cited index's supplierId to the message's supplierId: if they differ, the claim
      // is citing the wrong supplier's row even though the number matches. Only applies
      // to the exact `exposureResults[n].exposureScore` shape (resolved above).
      const siblingPath = exposureSupplierIdSiblingPath(claim.sourcePath);
      if (siblingPath) {
        const sibling = resolveSourcePath(root, siblingPath);
        if (!sibling.resolved || sibling.value !== msg.supplierId) {
          failures.push(
            `message ${msg.id}: exposure-score claim cites "${claim.sourcePath}" whose supplier ` +
              `${String(sibling.value)} is not this message's supplier ${msg.supplierId} ` +
              `(cite THIS supplier's score, not another's equal-value one)`
          );
        }
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
    // A supplier NAME is a proper noun the Dispatcher is MEANT to echo, and real names carry
    // digits ("Abu Chemical Partners 078", "3M", "7-Eleven"). SPAN-MASK the message's own
    // supplier name out of the prose BEFORE the numeral scan, so digits INSIDE the echoed name
    // are not read as sourceable figures. This is SPAN-bound, not value-based: only the literal
    // name occurrence is exempt, so a fabricated numeral ANYWHERE ELSE is still flagged even when
    // the supplier is literally named "Acme 5000" -- closing the engineered-collision hole an
    // attacker-chosen UPLOADED name could otherwise open (the prior value-based allow let any
    // numeral equal to a name digit pass). Residual is minimal: only the entity's own
    // (ingest-sanitized, length-capped) name span is exempt, and every draft is human-approved.
    const supplierName =
      root.exposureResults?.find((e) => e.supplierId === msg.supplierId)?.supplierName ?? "";
    // Only mask a name that contains a LETTER (a genuine proper noun like "Abu Chemical Partners
    // 078"). A digit-only / no-letter "name" -- an adversarial uploaded "5000" -- is NOT masked:
    // masking it would strip a fabricated "5000" out of "within 5000 days" and miss it. So a
    // numeric-only name's digits stay flaggable; only a real name's embedded digits are exempt.
    const maskable = /[a-z]/i.test(supplierName);
    const scannedProse = maskable ? prose.split(supplierName).join(" ") : prose;
    const { figures, unparseable } = extractSourceableNumerals(scannedProse);
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

// The PLAYBOOK-numeral contract (D.6, the F-deferred sibling of the message check
// above). Supplier messages ground figures via an inline claims[] array; PLAYBOOKS
// ground via groundedClaimIds (exposure ids), NOT inline claims. So the contract for
// a playbook is the strict one that keeps it trivially honest: a playbook STEP must
// be NUMERAL-FREE of sourceable quantities. Every figure a war-room plan surfaces is
// an Atlas exposure score or a Simulator figure that belongs in the structured
// packet the step references -- never a bare number the model wrote into prose with
// nothing backing it ("zero independent estimates", D.6 Goal).
//
// Why option (A) and not inline playbook claims (B): every playbook already shipped
// in this system -- the D.1 deterministic Strategist, the golden scenarios, the v2
// fixture -- is numeral-free by design, and the D.1 Strategist comment explicitly
// hands this contract to D.6. Numeral-free steps make "non-fabricable" mean exactly
// "carries no sourceable numeral", which a deterministic extractor decides with no
// claims-array surface to add. The schema stays unchanged.
//
// SCOPE: this scans every MODEL-AUTHORED prose surface of a playbook -- the `summary`
// AND each `steps[]` entry -- because the hard rule is that every figure a playbook
// SURFACES traces to a structured input, and a fabricated figure in the summary
// surfaces just as a step's does. This also keeps the numeral check consistent with
// the two sibling playbook graders (gradeEvidence, gradeInjectionQuarantine), which
// both scan `summary + steps`. It does NOT scan the run's audit metadata
// (agentRun.summary, "N playbook(s)...") -- that is system-generated, not the model's
// prose. Uses the SAME fail-closed extractor the message check uses, so a
// scientific-notation form a surface might smuggle ("1e6") is reported as
// unverifiable, never silently misread.
//
// One definition, two callers (the D.4 shared-module pattern, applied to D.6's
// agent): the Strategist's output-validation firewall (PRODUCE-time) and
// gradeCitationCoverage (GRADE-time) both call this -- so a playbook the firewall
// clears provably satisfies what the grader gates on. The gatekeeper is correctly
// NOT a caller: it never receives playbooks (it consumes supplierMessages only), so
// playbook grounding is the Strategist firewall's produce-time job, not the
// gatekeeper's -- no D.4 regression, just the right producer for this leaf.
export function collectPlaybookNumeralFailures(playbooks: Playbook[]): string[] {
  const failures: string[] = [];

  for (const pb of playbooks) {
    // Each model-authored prose surface, labelled so a failure names exactly where the
    // figure was smuggled (the summary, or a 0-based step index).
    const surfaces: { where: string; text: string }[] = [
      { where: "summary", text: pb.summary },
      ...pb.steps.map((step, i) => ({ where: `step ${i}`, text: step }))
    ];
    for (const { where, text } of surfaces) {
      const { figures, unparseable } = extractSourceableNumerals(text);
      for (const numeral of figures) {
        failures.push(
          `playbook ${pb.id} ${where}: ungrounded numeral ${numeral} in playbook prose ` +
            `(playbooks ground via groundedClaimIds, not inline figures -- keep prose numeral-free)`
        );
      }
      for (const form of unparseable) {
        failures.push(
          `playbook ${pb.id} ${where}: unverifiable numeral form "${form}" (keep prose numeral-free)`
        );
      }
    }
  }

  return failures;
}
