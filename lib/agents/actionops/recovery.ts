import type { ExposureResult, RecoveryOption, Simulation } from "@/lib/schemas";

// Deterministic recovery-options producer (P1 domain win). Resurrects the scored
// RecoveryOption contract for the ActionOps V2 path: structured EXPEDITE / REALLOCATE /
// SUBSTITUTE / SUPPLIER_ESCALATION options carrying cost / speed / risk-reduction and --
// the load-bearing field -- REVERSIBILITY, a more credible decision aid than the free-text
// playbooks. Every figure is CODE-COMPUTED from the deterministic Atlas/Simulator outputs;
// no LLM authors a number (authoritative-binding -- the moat holds even once the agent loop
// lands, since recovery options bind from tool/deterministic results, never from prose).
//
// reversibility is the GOVERNANCE DIAL the graduated-autonomy roadmap turns on: a
// HIGH-reversibility option (stop expediting, move stock back) is the kind a later phase can
// auto-fire; a LOW-reversibility one (commit to a single-source escalation) always needs a
// human. Phase 1 only PRODUCES the scored options; the executor that acts on them is Phase 5.

// Reversibility earns score: an equally-effective option that is easier to undo is the
// better first move (you can course-correct). This is what makes reversibility a real
// decision input, not just a label.
const REVERSIBILITY_BONUS: Record<RecoveryOption["reversibility"], number> = {
  HIGH: 20,
  MEDIUM: 10,
  LOW: 0
};

// A deterministic, bounded 0..100 score. Weighs the risk it removes most heavily, then
// the speed it buys and how reversible it is, and penalizes cost relative to what is at
// risk (an expensive option against a small exposure is a poor trade). Integer by
// construction (Math.round), so the ranking is stable and the fixtures are float-immune.
function scoreOption(
  o: Omit<RecoveryOption, "score">,
  peakRevenueUsd: number
): number {
  const costPenalty = Math.min(
    20,
    Math.round((20 * o.estimatedCostUsd) / Math.max(peakRevenueUsd, 1))
  );
  const raw =
    o.riskReductionPct * 0.6 +
    Math.min(o.speedGainDays, 20) +
    REVERSIBILITY_BONUS[o.reversibility] -
    costPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function withScore(
  o: Omit<RecoveryOption, "score">,
  peakRevenueUsd: number
): RecoveryOption {
  return { ...o, score: scoreOption(o, peakRevenueUsd) };
}

// Build the scored recovery options for a run. Empty when there is nothing exposed (no
// action to recover) -- and the orchestrator additionally WITHHOLDS the whole set on a
// NO_ACTION refusal, so a thin-evidence packet never ships mitigation options it cannot
// justify (the refusal invariant, enforced structurally in DecisionPacketSchema).
//
// Which options apply is conditioned on the real data: REALLOCATE only when there is
// runway/inventory to move, SUBSTITUTE only for the COVERED (dual-sourced) lanes, and
// SUPPLIER_ESCALATION only when there are SINGLE-SOURCE lanes with no alternate to switch
// to. EXPEDITE always applies when there is exposure.
export function buildRecoveryOptions(
  exposureResults: ExposureResult[],
  simulation?: Simulation
): RecoveryOption[] {
  if (exposureResults.length === 0) {
    return [];
  }

  // Peak revenue-at-risk anchors the cost scaling. With no simulation (Tier-1) there is
  // no revenue figure, so options fall back to a modest fixed base so their costs stay
  // sane and non-zero rather than collapsing to free.
  const peakRevenueUsd =
    simulation && simulation.horizons.length > 0
      ? Math.max(0, ...simulation.horizons.map((h) => h.revenueAtRiskUsd))
      : 0;
  const costBaseUsd = peakRevenueUsd > 0 ? peakRevenueUsd : 50_000;

  const topExposureIds = exposureResults.slice(0, 3).map((e) => e.id);
  // The worst TTR across the matched set anchors how much time an option can buy back.
  const worstRecoveryDays = Math.max(0, ...exposureResults.map((e) => e.recoveryDays ?? 0));
  const singleSource = exposureResults.filter((e) => e.singleSource === true);
  const covered = exposureResults.filter((e) => e.singleSource === false);

  const options: RecoveryOption[] = [];

  // EXPEDITE -- always available when there is exposure. Fully reversible (stop any time).
  options.push(
    withScore(
      {
        id: "REC-EXPEDITE",
        title: "Expedite inbound on the most exposed lanes",
        actionType: "EXPEDITE",
        summary:
          "Move the most exposed inbound to priority/air freight to close the gap between runout and supplier recovery.",
        estimatedCostUsd: Math.round(costBaseUsd * 0.15),
        speedGainDays: Math.max(1, Math.round(worstRecoveryDays * 0.4)),
        riskReductionPct: 50,
        confidence: "HIGH",
        reversibility: "HIGH",
        evidenceIds: topExposureIds,
        approvalRequired: true
      },
      peakRevenueUsd
    )
  );

  // REALLOCATE -- only when there is runway/inventory to move. Internal, fully reversible.
  if (simulation) {
    const buffer = simulation.survivalDays ?? 0;
    options.push(
      withScore(
        {
          id: "REC-REALLOCATE",
          title: "Reallocate safety stock to the highest-revenue lines",
          actionType: "REALLOCATE",
          summary:
            "Shift available on-hand cover toward the highest-revenue exposed lines to extend runway past the disruption.",
          estimatedCostUsd: Math.round(costBaseUsd * 0.03),
          speedGainDays: Math.max(1, Math.round(buffer * 0.3)),
          riskReductionPct: 35,
          confidence: "MEDIUM",
          reversibility: "HIGH",
          evidenceIds: topExposureIds,
          approvalRequired: false
        },
        peakRevenueUsd
      )
    );
  }

  // SUBSTITUTE -- only for the COVERED cohort (a qualified backup exists to switch to).
  if (covered.length > 0) {
    options.push(
      withScore(
        {
          id: "REC-SUBSTITUTE",
          title: "Activate qualified backups for the dual-sourced lanes",
          actionType: "SUBSTITUTE",
          summary:
            "Switch the lanes that have a qualified backup on file to the alternate supplier while the primary lane is disrupted.",
          estimatedCostUsd: Math.round(costBaseUsd * 0.1),
          speedGainDays: Math.max(1, Math.round(worstRecoveryDays * 0.5)),
          riskReductionPct: 45,
          confidence: "MEDIUM",
          reversibility: "MEDIUM",
          evidenceIds: covered.slice(0, 3).map((e) => e.id),
          approvalRequired: true
        },
        peakRevenueUsd
      )
    );
  }

  // SUPPLIER_ESCALATION -- for SINGLE-SOURCE lanes (no alternate to switch to): commit to
  // the incumbent and escalate allocation. Low reversibility -> the governance dial flags
  // it for human approval (you cannot easily walk this back).
  if (singleSource.length > 0) {
    options.push(
      withScore(
        {
          id: "REC-ESCALATE",
          title: "Escalate allocation with the single-source suppliers",
          actionType: "SUPPLIER_ESCALATION",
          summary:
            "Escalate to secure allocation from the single-source suppliers that have no qualified alternate to switch to.",
          estimatedCostUsd: Math.round(costBaseUsd * 0.05),
          speedGainDays: Math.max(1, Math.round(worstRecoveryDays * 0.2)),
          riskReductionPct: 30,
          confidence: "LOW",
          reversibility: "LOW",
          evidenceIds: singleSource.slice(0, 3).map((e) => e.id),
          approvalRequired: true
        },
        peakRevenueUsd
      )
    );
  }

  // Rank by score descending; tie-break on id so the order is deterministic.
  return options.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
