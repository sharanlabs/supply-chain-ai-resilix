import type {
  AgentRun,
  ExposureResult,
  GatekeeperReport,
  PublicSignal,
  Simulation,
  Supplier,
  SupplierMessageDraft,
  ThreatCard
} from "@/lib/schemas";
import { collectCitationFailures } from "@/lib/pipeline/citation-check";

// ActionOps gatekeeper (D.4: full bidirectional citation enforcement at
// produce-time). Validates the assembled V2 is internally consistent before it can
// reach human review: every exposure and every drafted message references a known
// supplier id, the threat cites evidence, no upstream agent reported a validation
// failure, AND every claim satisfies the full claims[] <-> numeral <-> sourcePath
// contract (collectCitationFailures). These checks BITE if the deterministic
// assembly is wrong, so it is not theatre.
//
// WHY the full citation check moved here in D.4: before this, the gatekeeper only
// checked each claim's sourcePath was non-empty, while the grader (grade-time)
// enforced the full contract -- so a packet could clear the gatekeeper for human
// review yet still violate the citation coverage the grader gates on. Now the
// gatekeeper calls the SAME collectCitationFailures the grader calls (one
// definition, no divergence), so a packet cleared for human review provably
// satisfies the citation-coverage contract.
//
// The wrinkle this signature solves: collectCitationFailures resolves sourcePaths
// (e.g. `simulation.horizons[0].days`) against a packet-shaped root, but the
// gatekeeper runs on SLICES before the packet object exists. So it receives the
// resolvable input slices it needs (exposureResults + threatCard it already had,
// plus publicSignals + simulation) and assembles the minimal CitationCheckRoot
// itself -- no packet object, no V2 schema change. publicSignals/simulation are
// optional so the empty-messages caller (the Atlas rejection test) still compiles;
// with zero messages the citation check does zero work.
export function runActionOpsGatekeeper(parts: {
  suppliers: Supplier[];
  threatCard: ThreatCard;
  exposureResults: ExposureResult[];
  supplierMessages: SupplierMessageDraft[];
  agentRuns: AgentRun[];
  checkedAt: string;
  publicSignals?: PublicSignal[];
  simulation?: Simulation;
}): GatekeeperReport {
  const {
    suppliers,
    threatCard,
    exposureResults,
    supplierMessages,
    agentRuns,
    checkedAt,
    publicSignals,
    simulation
  } = parts;
  const failures: string[] = [];
  const warnings: string[] = [];

  // Fail CLOSED on any agent that reported a validation failure (e.g. Atlas
  // rejecting a misclassified Sentinel handoff). Without this the FAIL flag would be
  // cosmetic: a rejected packet would still pass the gatekeeper and be approvable,
  // breaking do-no-harm. An upstream agent failure blocks human approval.
  for (const run of agentRuns) {
    if (run.validationStatus === "FAIL") {
      failures.push(
        `Agent ${run.agentName} (${run.id}) reported a validation failure -- the packet is held and cannot be approved.`
      );
    }
  }

  const knownSupplierIds = new Set(suppliers.map((s) => s.id));
  const exposureSupplierIds = new Set(exposureResults.map((e) => e.supplierId));

  for (const e of exposureResults) {
    if (!knownSupplierIds.has(e.supplierId)) {
      failures.push(`Exposure ${e.id} references unknown supplier ${e.supplierId}`);
    }
  }

  for (const m of supplierMessages) {
    if (!exposureSupplierIds.has(m.supplierId)) {
      failures.push(`Message ${m.id} drafts to a non-exposed supplier ${m.supplierId}`);
    }
  }

  // The full bidirectional citation check, enforced at produce-time through the
  // SAME function the grader runs. Any citation failure -- a claim citing a
  // non-input root, a sourcePath that does not resolve, a wrong-context number
  // (right value, wrong field), a unit mismatch, or an unsourced/unparseable prose
  // numeral -- holds the packet (BLOCKED, not approvable). The root is assembled
  // from the slices the gatekeeper holds: a structural subset of the eventual
  // packet, sufficient for resolveSourcePath to walk the cited paths.
  failures.push(
    ...collectCitationFailures({
      supplierMessages,
      threatCard,
      publicSignals,
      exposureResults,
      simulation
    })
  );

  if (threatCard.evidenceUrls.length === 0) {
    warnings.push("Threat card cites no evidence urls");
  }

  return {
    status: failures.length > 0 ? "BLOCKED" : warnings.length > 0 ? "WARN" : "PASS",
    failures,
    warnings,
    approvedForHumanReview: failures.length === 0,
    checkedAt
  };
}
