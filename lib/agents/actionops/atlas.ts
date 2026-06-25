import type { AgentRun, ExposureResult, Supplier, ThreatCard } from "@/lib/schemas";
import { SectorSchema } from "@/lib/schemas";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { ScenarioMatch } from "@/lib/data/actionops-scenarios";

// Atlas (D.2: deterministic exposure model + Sentinel-handoff firewall). It (1)
// matches seed suppliers to the disruption by the scenario's declarative rule, (2)
// validates that the matched set is consistent with the THREAT it was handed -- so
// a misclassified Sentinel output cannot silently produce bogus exposures -- and
// (3) scores each match from real supplier attributes (risk tier + lead time), not
// a positional placeholder. The match is keyed off the canonical ingested ids, so a
// genuinely unmatched event yields ZERO exposures (the zero-exposure control), never
// an invented match.

// Risk-tier base weight. CRITICAL suppliers carry the most exposure for the same
// disruption; the gaps (13-15) keep the tiers separated across the seed's 39-49 day
// lead range, where lead time only modulates within a tier. (In the general case the
// +30 lead cap exceeds a single tier gap, so a very long lead CAN cross one tier --
// that is intended: a LOW supplier on a two-month lane is a real exposure.) Hand-
// derive any fixture from THESE numbers.
const RISK_TIER_BASE: Record<Supplier["riskTier"], number> = {
  CRITICAL: 55,
  HIGH: 40,
  MEDIUM: 25,
  LOW: 12
};

// Lead-time component is INTEGER by construction (no rounding): standardLeadTimeDays
// is an integer, so `clamp(days - 30, 0, 30)` stays integer and is immune to the
// IEEE-754 round-half coin-flip a float scale would hand the hand-computed fixtures.
// Reading: <=30 days adds 0 (recoverable within a month), then exposure rises one
// point per day up to a +30 cap at 60 days (a two-month lane is the practical worst).
const LEAD_FLOOR_DAYS = 30;
const LEAD_CAP_POINTS = 30;

function leadComponent(standardLeadTimeDays: number): number {
  return Math.min(Math.max(standardLeadTimeDays - LEAD_FLOOR_DAYS, 0), LEAD_CAP_POINTS);
}

// P1 single-source spine. A supplier with NO qualified backup on file
// (backupSupplierId is null) is the classic concentration risk: there is no alternate
// to switch to, so the same disruption bites harder and recovery runs longer.
//   - the exposure SCORE gains a fixed penalty (kept well under the 100 ceiling: a
//     CRITICAL 55 + lead cap 30 + 12 = 97), and
//   - the TTR estimate (recoveryDays) is the supplier's standard lead time -- the time to
//     push a fresh order through -- EXTENDED when single-source, since requalifying an
//     alternate adds weeks. Integer by construction (lead time + integer extra), so the
//     hand-derived fixtures stay immune to float rounding.
const SINGLE_SOURCE_SCORE_PENALTY = 12;
const SINGLE_SOURCE_RECOVERY_EXTRA_DAYS = 14;

// The disruption's geographic AFFECTED SCOPE keyed by the threat's chokepoint -- the
// countries whose inbound maritime trade transits it. This is the firewall's source
// of truth: Atlas trusts the SCENARIO for WHO to match, but checks the matched set
// against the scope of the THREAT it was actually handed. Real domain data, one entry
// per chokepoint the core can reason about (grows as scenarios are added): Hormuz
// backs the live scenario; Malacca is the distinct, real out-of-scope chokepoint the
// misclassification firewall test rejects against (a Gulf match is not within it).
const CHOKEPOINT_AFFECTED_COUNTRIES: Record<string, readonly string[]> = {
  "Strait of Hormuz": ["SA", "AE", "QA", "KW", "BH", "IQ", "IR", "OM"],
  "Strait of Malacca": ["SG", "MY", "ID", "TH", "VN"],
  // Suez Canal / Red Sea: the Asia + Gulf origins whose Europe- and US-East-bound maritime
  // trade transits the Red Sea and the Suez Canal. A sustained Red Sea diversion adds
  // transit days to these lanes. India anchors the live Red Sea / Suez scenario; the wider
  // set keeps the scope firewall honest if the match broadens. Real chokepoint domain data,
  // one row per chokepoint the core can reason about (mirrors the Hormuz row).
  "Suez Canal": ["IN", "LK", "BD", "PK", "AE", "SA", "OM", "EG", "CN", "VN", "TH"]
};

// Match chokepoint names case- and whitespace-insensitively, so a handoff that drifts
// to "Strait of Hormuz " or "strait of hormuz" cannot silently skip the firewall (the
// D.5 LLM Sentinel is exactly where such drift would arise).
function canonicalChokepoint(value: string): string {
  return value.trim().toLowerCase();
}
const NORMALIZED_SCOPE = new Map<string, Set<string>>(
  Object.entries(CHOKEPOINT_AFFECTED_COUNTRIES).map(([name, countries]) => [
    canonicalChokepoint(name),
    new Set(countries)
  ])
);

// Read the threat's affected scope. `claimed` = the handoff asserts a chokepoint at
// all; `scope` = the known affected countries, or null when the claimed chokepoint is
// not in the table (scope unknown). A non-chokepoint threat (region/country only) is
// `claimed:false` and is not scope-validated here.
function deriveAffectedScope(threatCard: ThreatCard): {
  claimed: boolean;
  scope: Set<string> | null;
} {
  const chokepoint = threatCard.location.chokepoint?.trim();
  if (!chokepoint) {
    return { claimed: false, scope: null };
  }
  return {
    claimed: true,
    scope: NORMALIZED_SCOPE.get(canonicalChokepoint(chokepoint)) ?? null
  };
}

export function runAtlas(
  ctx: ActionOpsContext,
  threatCard: ThreatCard
): { exposureResults: ExposureResult[]; dataGaps: string[]; agentRun: AgentRun } {
  const { scenario, suppliers, baseDateIso } = ctx;
  const matched = matchSuppliers(suppliers, scenario.match);

  // Zero-exposure control: a genuinely unmatched event yields NO exposures and says
  // so in a data gap (never an invented match). The phrase "no direct exposure" is
  // the gradeExposureControl contract for a zero-exposure scenario.
  if (matched.length === 0) {
    const agentRun = makeAgentRun({
      id: "RUN-ATLAS",
      agentName: "Atlas",
      input: { match: scenario.match, supplierCount: suppliers.length },
      output: [],
      summary: "0 supplier(s) matched the disruption.",
      createdAt: baseDateIso
    });
    return {
      exposureResults: [],
      dataGaps: ["No direct exposure: no supplier in the base matches the disruption's affected set."],
      agentRun
    };
  }

  // FIREWALL (the deliberate-misclassification control): validate the matched set
  // against the scope of the handed-in threat. Atlas FAILS CLOSED (zero exposures + a
  // stated data gap + a FAILED agent run the gatekeeper blocks on) rather than emit
  // exposures it cannot stand behind, in two cases: (a) the threat claims a chokepoint
  // Atlas has no scope for -> it cannot validate which suppliers the threat reaches;
  // (b) a matched supplier sits OUTSIDE a known scope -> the Sentinel output and the
  // match disagree about what the disruption is (a misclassification). A non-chokepoint
  // threat is not scope-validated. D.5's LLM Sentinel is the real source this guards.
  const failClosed = (dataGap: string, debug: Record<string, unknown>) => {
    const rejectionRun = makeAgentRun({
      id: "RUN-ATLAS",
      agentName: "Atlas",
      input: { match: scenario.match, chokepoint: threatCard.location.chokepoint },
      output: { rejected: true, ...debug },
      summary: "Rejected: threat handoff failed scope validation.",
      createdAt: baseDateIso,
      validationStatus: "FAIL" as const
    });
    return { exposureResults: [], dataGaps: [dataGap], agentRun: rejectionRun };
  };

  const { claimed, scope } = deriveAffectedScope(threatCard);
  if (claimed && !scope) {
    return failClosed(
      `Atlas rejected the threat handoff: the claimed chokepoint "${threatCard.location.chokepoint}" ` +
        `has no known affected scope, so exposure cannot be validated -- no direct exposure is asserted.`,
      { reason: "unmapped-chokepoint", chokepoint: threatCard.location.chokepoint }
    );
  }
  if (scope) {
    const outOfScope = matched.filter((s) => !scope.has(s.country));
    if (outOfScope.length > 0) {
      const offenders = outOfScope.map((s) => `${s.id}(${s.country})`).join(", ");
      return failClosed(
        `Atlas rejected the threat handoff: ${outOfScope.length} matched supplier(s) ` +
          `[${offenders}] fall outside the affected scope of "${threatCard.location.chokepoint}" ` +
          `-- possible threat misclassification, so no direct exposure is asserted.`,
        { reason: "out-of-scope", outOfScope: outOfScope.map((s) => s.id) }
      );
    }
  }

  const exposureResults: ExposureResult[] = matched
    .map((supplier) => {
      const base = RISK_TIER_BASE[supplier.riskTier];
      const lead = leadComponent(supplier.standardLeadTimeDays);
      // P1: a supplier with no backup on file is single-source (concentration risk).
      // == null catches both a null FK and an absent field. Drives both the score
      // penalty and the longer TTR.
      const singleSource = supplier.backupSupplierId == null;
      const recoveryDays =
        supplier.standardLeadTimeDays + (singleSource ? SINGLE_SOURCE_RECOVERY_EXTRA_DAYS : 0);
      return {
        id: `EXP-${scenario.id}-${supplier.id}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        country: supplier.country,
        // Sector firewall: only a closed-vocabulary SectorSchema member survives;
        // an off-taxonomy event, or a supplier sector not in the taxonomy, is held
        // as OTHER_UNMAPPED rather than force-fit to a named sector.
        sector: resolveSector(scenario.offTaxonomy === true, supplier.sector),
        exposureScore: base + lead + (singleSource ? SINGLE_SOURCE_SCORE_PENALTY : 0),
        // Per-row rationale carries what VARIES between matched suppliers -- the risk
        // tier (leading token, parsed by the packet view to drive the row label + its
        // severity bar), the standard lead time, and now the single-source vs
        // backup-on-file status (the P1 concentration-risk read). The tier MUST stay
        // the first token: tierFromRationale() in the view matches
        // /^(LOW|MEDIUM|HIGH|CRITICAL)\b/. Graders check scores/structure, not this
        // text (see evals/actionops-atlas.test.ts), so the wording is free to evolve.
        rationale:
          `${supplier.riskTier} risk tier; ${supplier.standardLeadTimeDays}-day lead time; ` +
          `${singleSource ? "single-source (no qualified backup)" : "qualified backup on file"}.`,
        singleSource,
        recoveryDays,
        evidenceIds: [threatCard.id]
      };
    })
    // Rank by exposure descending; tie-break on the canonical id so the order is
    // deterministic (two equal-score suppliers always sort the same way).
    .sort((a, b) => b.exposureScore - a.exposureScore || a.supplierId.localeCompare(b.supplierId));

  const agentRun = makeAgentRun({
    id: "RUN-ATLAS",
    agentName: "Atlas",
    input: { match: scenario.match, supplierCount: suppliers.length },
    output: exposureResults,
    summary: `${exposureResults.length} supplier(s) matched and scored on tier + lead time.`,
    createdAt: baseDateIso
  });

  return { exposureResults, dataGaps: [], agentRun };
}

// A closed-vocab sector or the OTHER_UNMAPPED escape hatch -- never a raw/unknown
// value. An off-taxonomy event forces OTHER_UNMAPPED for every match; otherwise a
// supplier sector is kept only if it parses as a SectorSchema member.
function resolveSector(
  offTaxonomy: boolean,
  supplierSector: Supplier["sector"]
): string {
  if (offTaxonomy) {
    return "OTHER_UNMAPPED";
  }
  const parsed = SectorSchema.safeParse(supplierSector);
  return parsed.success ? parsed.data : "OTHER_UNMAPPED";
}

function matchSuppliers(suppliers: Supplier[], match: ScenarioMatch): Supplier[] {
  return suppliers.filter((s) => {
    const countryOk = !match.countries || match.countries.includes(s.country);
    const sectorOk =
      !match.sectors || (s.sector != null && match.sectors.includes(s.sector));
    const regionOk = !match.regions || match.regions.includes(s.region);
    const riskTierOk = !match.riskTiers || match.riskTiers.includes(s.riskTier);
    // Every PRESENT constraint must hold (absent ones are "any"). region + riskTier let a
    // single-source scenario pin its supplier declaratively (e.g. one Texas Gulf-Coast
    // ENERGY plant) without hard-coding a seed-derived id.
    return countryOk && sectorOk && regionOk && riskTierOk;
  });
}
