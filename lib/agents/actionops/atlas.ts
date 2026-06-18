import type { AgentRun, ExposureResult, Supplier, ThreatCard } from "@/lib/schemas";
import { makeAgentRun } from "@/lib/agents/actionops/agent-run";
import type { ActionOpsContext } from "@/lib/agents/actionops/types";
import type { ScenarioMatch } from "@/lib/data/actionops-scenarios";

// Atlas (D.1: deterministic match, placeholder scores). Matches seed suppliers to
// the disruption by the scenario's declarative rule (country / sector), keyed off
// the canonical ingested ids -- so the matched set is exactly the suppliers the
// scenario should touch, and a genuinely unmatched event yields ZERO exposures
// (the zero-exposure control), never an invented match. The MATCH is real now; the
// exposureScore is a placeholder descending rank. D.2 replaces the score with the
// real exposure model (lead-time / backup / tier / lane) and adds the
// deliberate-misclassification rejection assert.
export function runAtlas(
  ctx: ActionOpsContext,
  threatCard: ThreatCard
): { exposureResults: ExposureResult[]; agentRun: AgentRun } {
  const { scenario, suppliers, baseDateIso } = ctx;
  const matched = matchSuppliers(suppliers, scenario.match);

  const exposureResults: ExposureResult[] = matched.map((supplier, i) => ({
    id: `EXP-${scenario.id}-${i}`,
    supplierId: supplier.id,
    supplierName: supplier.name,
    country: supplier.country,
    // An off-taxonomy event cannot be classified to a named sector, so its matches
    // are held as OTHER_UNMAPPED rather than force-fit (the off-taxonomy control).
    sector: scenario.offTaxonomy ? "OTHER_UNMAPPED" : supplier.sector ?? "OTHER_UNMAPPED",
    exposureScore: Math.max(0, 88 - i * 3),
    rationale: "Inbound lanes for this supplier transit the affected route.",
    evidenceIds: [threatCard.id]
  }));

  const agentRun = makeAgentRun({
    id: "RUN-ATLAS",
    agentName: "Atlas",
    input: { match: scenario.match, supplierCount: suppliers.length },
    output: exposureResults,
    summary: `${exposureResults.length} supplier(s) matched the disruption.`,
    createdAt: baseDateIso
  });

  return { exposureResults, agentRun };
}

function matchSuppliers(suppliers: Supplier[], match: ScenarioMatch): Supplier[] {
  return suppliers.filter((s) => {
    const countryOk = !match.countries || match.countries.includes(s.country);
    const sectorOk =
      !match.sectors || (s.sector != null && match.sectors.includes(s.sector));
    return countryOk && sectorOk;
  });
}
