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
// disruption; the gaps are deliberate and even (~13-15) so the tier dominates and
// lead time modulates within a tier. Hand-derive any fixture from THESE numbers.
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

// The disruption's geographic AFFECTED SCOPE keyed by the threat's chokepoint -- the
// countries whose inbound maritime trade transits it. This is the firewall's source
// of truth: Atlas trusts the SCENARIO for WHO to match, but checks the matched set
// against the scope of the THREAT it was actually handed. A chokepoint absent here is
// "scope unknown" -> Atlas cannot validate and passes through (it must not reject a
// legitimate scenario it lacks scope data for). Real domain data, extended per added
// chokepoint scenario.
const CHOKEPOINT_AFFECTED_COUNTRIES: Record<string, readonly string[]> = {
  "Strait of Hormuz": ["SA", "AE", "QA", "KW", "BH", "IQ", "IR", "OM"],
  "Strait of Malacca": ["SG", "MY", "ID", "TH", "VN"],
  "Panama Canal": ["US", "PA", "CO", "EC", "CL", "PE"]
};

// Derive the affected-country scope from the THREAT (not the scenario match). null =
// "scope unknown" (the chokepoint is unmapped), which means Atlas cannot validate.
function deriveAffectedScope(threatCard: ThreatCard): Set<string> | null {
  const chokepoint = threatCard.location.chokepoint;
  if (chokepoint && CHOKEPOINT_AFFECTED_COUNTRIES[chokepoint]) {
    return new Set(CHOKEPOINT_AFFECTED_COUNTRIES[chokepoint]);
  }
  return null;
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
  // against the scope of the handed-in threat. If a matched supplier sits OUTSIDE
  // the threat's affected scope, the Sentinel output and the match disagree about
  // what the disruption is -- a misclassification -- so Atlas FAILS CLOSED (zero
  // exposures + a stated data gap) rather than emit exposures it cannot stand behind.
  // When the scope is unknown (unmapped chokepoint) it cannot check and passes
  // through. D.5's LLM Sentinel is the real misclassification source this guards.
  const scope = deriveAffectedScope(threatCard);
  if (scope) {
    const outOfScope = matched.filter((s) => !scope.has(s.country));
    if (outOfScope.length > 0) {
      const offenders = outOfScope.map((s) => `${s.id}(${s.country})`).join(", ");
      const dataGap =
        `Atlas rejected the threat handoff: ${outOfScope.length} matched supplier(s) ` +
        `[${offenders}] fall outside the affected scope of "${threatCard.location.chokepoint}" ` +
        `-- possible threat misclassification, so no direct exposure is asserted.`;
      const rejectionRun = makeAgentRun({
        id: "RUN-ATLAS",
        agentName: "Atlas",
        input: { match: scenario.match, chokepoint: threatCard.location.chokepoint },
        output: { rejected: true, outOfScope: outOfScope.map((s) => s.id) },
        summary: `Rejected: ${outOfScope.length} matched supplier(s) outside the threat scope.`,
        createdAt: baseDateIso,
        validationStatus: "FAIL"
      });
      return { exposureResults: [], dataGaps: [dataGap], agentRun: rejectionRun };
    }
  }

  const exposureResults: ExposureResult[] = matched
    .map((supplier) => {
      const base = RISK_TIER_BASE[supplier.riskTier];
      const lead = leadComponent(supplier.standardLeadTimeDays);
      return {
        id: `EXP-${scenario.id}-${supplier.id}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        country: supplier.country,
        // Sector firewall: only a closed-vocabulary SectorSchema member survives;
        // an off-taxonomy event, or a supplier sector not in the taxonomy, is held
        // as OTHER_UNMAPPED rather than force-fit to a named sector.
        sector: resolveSector(scenario.offTaxonomy === true, supplier.sector),
        exposureScore: base + lead,
        rationale:
          `${supplier.riskTier} risk tier; ${supplier.standardLeadTimeDays}-day standard ` +
          `lead time on a lane through the affected chokepoint (no qualified backup on file).`,
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
    return countryOk && sectorOk;
  });
}
