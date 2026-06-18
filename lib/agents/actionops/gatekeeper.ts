import type {
  ExposureResult,
  GatekeeperReport,
  Supplier,
  SupplierMessageDraft,
  ThreatCard
} from "@/lib/schemas";

// ActionOps gatekeeper (D.1: minimal but non-vacuous). Validates the assembled V2
// is internally consistent before it can reach human review: every exposure and
// every drafted message references a known supplier id, every claim carries a
// sourcePath, and the threat cites evidence. These checks BITE if the deterministic
// assembly is wrong, so it is not theatre -- but it is deliberately small.
//
// D.4 replaces this with the full bidirectional numeral <-> sourcePath check: every
// numeral in prose must resolve to a claim whose sourcePath resolves into the
// structured inputs, and the reverse, with a right-value/wrong-context number
// FAILING loudly. That contract is D.4's to own, not a half-built version here.
export function runActionOpsGatekeeper(parts: {
  suppliers: Supplier[];
  threatCard: ThreatCard;
  exposureResults: ExposureResult[];
  supplierMessages: SupplierMessageDraft[];
  checkedAt: string;
}): GatekeeperReport {
  const { suppliers, threatCard, exposureResults, supplierMessages, checkedAt } = parts;
  const failures: string[] = [];
  const warnings: string[] = [];

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
    for (const c of m.claims) {
      if (!c.sourcePath || c.sourcePath.trim().length === 0) {
        failures.push(`Message ${m.id} carries a claim with no sourcePath`);
      }
    }
  }

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
