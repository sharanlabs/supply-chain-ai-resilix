// The Skeptic, deterministic leg (plan §5 D4) -- an INDEPENDENT re-verification of a
// finished outcome against the RAW case inputs. Maker != judge: this module imports
// the same primitives but re-derives every conclusion itself and compares; it never
// trusts a field because the pipeline wrote it. The cross-family LLM leg (narrative
// challenge) attaches at this same seam when keys are present -- it can only ADD
// objections, never clear them.

import type { SyntheticCase } from "./synthetic-entries";
import {
  DEMO_INTEREST,
  DEMO_NOTICE_MAILED_ON,
  runCustomsDefenseCase,
  type CustomsDefenseOutcome,
} from "./pipeline";
import { findCell } from "./edge-case-matrix";
import { quarantineAll } from "./exhibit-quarantine";
import { assessSufficiency } from "./evidence-sufficiency";
import { scopeEntryPopulation } from "./entry-scoper";
import { computePenaltyExposure } from "./penalty-exposure";
import { computeDeadlines, type DeadlineClock, type NoticeEvent } from "./deadline-clocks";
import { gradeCustomsCitationCoverage } from "./packet-graders";
import { renderPacketText } from "./defense-packet";

export interface SkepticVerdict {
  accepted: boolean;
  objections: string[];
}

export function skepticReview(input: SyntheticCase, outcome: CustomsDefenseOutcome): SkepticVerdict {
  const objections: string[] = [];

  // 1. Re-derive the disposition from raw inputs; it must match.
  const cell = findCell(input.cellId);
  if (!cell) {
    if (outcome.disposition !== "REFUSE") {
      objections.push("case is outside declared coverage but the outcome is not a refusal");
    }
  } else {
    const verdict = assessSufficiency(cell.workflow, quarantineAll(input.exhibits), input.meta);
    const expected = verdict.sufficient ? "PROCEED" : "REFUSE";
    if (outcome.disposition !== expected) {
      objections.push(`disposition ${outcome.disposition} contradicts re-derived ${expected}`);
    }
    if (!verdict.sufficient) {
      const missing = verdict.gaps.filter((g) => !outcome.namedGaps.includes(g));
      if (missing.length > 0) objections.push(`refusal omits re-derived gap(s): ${missing.join(", ")}`);
    }
  }

  // 2. Render the packet FRESH and require the stored packetText to match (Codex D6
  // R3: export renders from `packet`, so a tampered section over a stale-but-clean
  // packetText would otherwise export text no check ever scanned). Every text-level
  // check below runs against the fresh render, never the stored string.
  const rendered = renderPacketText(outcome.packet);
  if (outcome.packetText !== rendered) {
    objections.push("packetText does not match a fresh render of the packet (stale or tampered text)");
  }

  // Re-run citation coverage on the finished packet -- sections AND the full
  // rendered text (never trust the producer ran it, or ran it on everything).
  const grade = gradeCustomsCitationCoverage({
    sections: [...outcome.packet.sections, { heading: "RENDERED_PACKET_TEXT", text: rendered }],
    citedFigures: outcome.packet.citedFigures,
  });
  if (grade.blocked) objections.push(...grade.violations.map((v) => `citation: ${v}`));

  // 3. Re-derive EVERY cited figure from the raw inputs under the packet's declared
  // demo model -- scope, LOR, both penalty branches, assumptions, and clocks (Codex
  // D6 #1: a tampered culpability tier or inflated exposure must not survive just
  // because the packet is internally consistent). The expected set is an ALLOWLIST
  // (Codex D6 R2 #1): a cited figure whose sourceRef the Skeptic cannot re-derive is
  // itself an objection -- injected "made-up#figure" refs cannot launder prose numbers.
  const expectedFigures = new Map<string, number>();
  expectedFigures.set("case-generator#seed", input.seed);
  expectedFigures.set("exhibit-quarantine#count", cell ? quarantineAll(input.exhibits).length : 0);
  let rederivedDeadlines: DeadlineClock[] = [];
  if (outcome.disposition === "PROCEED") {
    const scope = scopeEntryPopulation(input.entries, {});
    const actualLorCents = scope.totalDeclaredDutyCents; // the packet's stated LOR model
    const exposureBase = {
      culpability: "NEGLIGENCE" as const,
      lossType: "DUTY_LOSS" as const,
      actualLossOfDutyCents: actualLorCents,
      potentialLossOfDutyCents: 0,
      dutiableValueCents: scope.totalEnteredValueCents,
      domesticValueCents: scope.totalEnteredValueCents * 2,
      aggravating: [],
      mitigating: [],
    };
    const caught = computePenaltyExposure({ ...exposureBase, priorDisclosure: false });
    const disclosed = computePenaltyExposure({
      ...exposureBase,
      priorDisclosure: true,
      interestAssumption: DEMO_INTEREST,
    });
    rederivedDeadlines = input.meta.enforcementSignal
      ? computeDeadlines([{ kind: "CF28_RESPONSE", mailedOn: DEMO_NOTICE_MAILED_ON } as NoticeEvent])
      : [];

    expectedFigures.set("entry-scoper#entryCount", scope.entryCount);
    expectedFigures.set("entry-scoper#lineCount", scope.lineCount);
    expectedFigures.set("entry-scoper#totalEnteredValue", scope.totalEnteredValueCents / 100);
    expectedFigures.set("entry-scoper#totalDeclaredDuty", scope.totalDeclaredDutyCents / 100);
    expectedFigures.set("lor-model#actual", actualLorCents / 100);
    expectedFigures.set("penalty-exposure#caught.min", caught.minCents / 100);
    expectedFigures.set("penalty-exposure#caught.max", caught.maxCents / 100);
    expectedFigures.set("penalty-exposure#disclosed.max", disclosed.maxCents / 100);
    expectedFigures.set("lor-model#interestRateAssumption", DEMO_INTEREST.annualRatePct);
    expectedFigures.set("lor-model#interestDaysAssumption", DEMO_INTEREST.days);
    for (const d of rederivedDeadlines) expectedFigures.set(`deadline-clocks#${d.kind}`, d.windowDays);
  }

  // Every cited figure must be re-derivable (allowlist) AND carry the re-derived
  // value -- checked per entry, not via a map, so a duplicate-ref tamper (correct
  // value shadowing a wrong one) cannot hide.
  for (const c of outcome.packet.citedFigures) {
    const expected = expectedFigures.get(c.sourceRef);
    if (expected === undefined) {
      objections.push(`cited figure ${c.value} carries sourceRef ${c.sourceRef} the skeptic cannot re-derive`);
    } else if (c.value !== expected) {
      objections.push(`${c.sourceRef} cited as ${c.value}, re-derived ${expected}`);
    }
  }
  for (const ref of expectedFigures.keys()) {
    if (!outcome.packet.citedFigures.some((c) => c.sourceRef === ref)) {
      objections.push(`packet cites no figure for ${ref}`);
    }
  }

  // Deadline DATES are structured fields the citation grader deliberately masks
  // (dates are addressing, not quantities) -- so the Skeptic compares each clock
  // record against a fresh derivation instead (Codex D6 #4, date leg).
  if (outcome.packet.deadlines.length !== rederivedDeadlines.length) {
    objections.push(
      `packet carries ${outcome.packet.deadlines.length} deadline clock(s), re-derived ${rederivedDeadlines.length}`
    );
  } else {
    for (let i = 0; i < rederivedDeadlines.length; i++) {
      const got = outcome.packet.deadlines[i];
      const want = rederivedDeadlines[i];
      if (got.kind !== want.kind || got.dueOn !== want.dueOn || got.mailedOn !== want.mailedOn || got.windowDays !== want.windowDays) {
        objections.push(
          `deadline ${got.kind}: packet says due ${got.dueOn} (${got.windowDays}d from ${got.mailedOn}), re-derived due ${want.dueOn} (${want.windowDays}d from ${want.mailedOn})`
        );
      }
    }
  }

  // Prose dates must agree with the structured clocks (Codex D6 R2 #2): a section
  // that says "response due 2099-01-01" over a correct deadlines record would pass
  // the grader (dates masked) and the structured comparison -- so every ISO date in
  // the rendered text must belong to a re-derived clock, and every re-derived due
  // date must actually appear in the text that presents a clock.
  const allowedDates = new Set(rederivedDeadlines.flatMap((d) => [d.mailedOn, d.dueOn]));
  for (const iso of rendered.match(/\d{4}-\d{2}-\d{2}/g) ?? []) {
    if (!allowedDates.has(iso)) {
      objections.push(`prose date ${iso} matches no re-derived deadline clock`);
    }
  }
  for (const d of rederivedDeadlines) {
    if (!rendered.includes(d.dueOn)) {
      objections.push(`re-derived due date ${d.dueOn} (${d.kind}) is missing from the packet text`);
    }
  }

  // 4. Exhibit bodies must not have crossed into prose (structural spot-check) --
  // scanned in BOTH the stored text and the fresh render, so neither copy can hide a leak.
  for (const exhibit of input.exhibits) {
    if (outcome.packetText.includes(exhibit.body) || rendered.includes(exhibit.body)) {
      objections.push(`quarantine breach: exhibit ${exhibit.kind} body appears in the packet`);
    }
  }

  // 5. The completeness backstop (Codex D6 R4): every check above names a specific
  // failure, but per-value checks cannot bind each numeral OCCURRENCE to its meaning
  // -- tampered prose reusing a legitimately-cited value ("additional penalty is
  // $365" riding on the 365-day assumption) passes them all. The pipeline is fully
  // deterministic, so the strongest re-derivation is the whole thing: a fresh run
  // from the raw case must reproduce the packet EXACTLY. Any deviation -- prose,
  // figure, section order, gap list -- is an objection, whatever it collides with.
  // (The named checks above stay: they produce legible, specific objections and
  // catch packaging bugs this equality check would only report as "deviates".)
  // Compared at the OUTCOME level, not just the packet: the surface reads the
  // top-level disposition/namedGaps/packetText, which can be tampered independently
  // of the packet (Codex D6 R5).
  const rerun = runCustomsDefenseCase(input);
  if (JSON.stringify(rerun) !== JSON.stringify(outcome)) {
    objections.push(
      "outcome deviates from a full deterministic re-derivation of the raw case (content no per-value check can vouch for)"
    );
  }

  return { accepted: objections.length === 0, objections };
}
