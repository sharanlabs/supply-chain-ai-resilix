import { operationsData } from "@/lib/data/operations";
import type {
  DecisionPacket,
  GatekeeperReport,
  ImpactReport,
  PublicSignal,
  RecoveryOption
} from "@/lib/schemas";
import { DecisionPacketSchema } from "@/lib/schemas";

export function validateDecisionInputs({
  publicSignals,
  impactReport,
  options,
  recommendedOptionId
}: {
  publicSignals: PublicSignal[];
  impactReport: ImpactReport;
  options: RecoveryOption[];
  recommendedOptionId: string;
}): GatekeeperReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const now = new Date().toISOString();
  const knownIds = new Set([
    ...operationsData.suppliers.map((item) => item.id),
    ...operationsData.components.map((item) => item.id),
    ...operationsData.products.map((item) => item.id),
    ...operationsData.inventory.map((item) => item.id),
    ...operationsData.shipments.map((item) => item.id),
    ...operationsData.orders.map((item) => item.id),
    ...operationsData.launchPlans.map((item) => item.id),
    ...publicSignals.map((item) => item.id),
    ...impactReport.calculations.map((item) => item.id)
  ]);

  for (const supplier of impactReport.affectedSuppliers) {
    if (!knownIds.has(supplier.supplierId)) {
      failures.push(`Unknown supplier_id in impact report: ${supplier.supplierId}`);
    }
  }

  for (const component of impactReport.affectedComponents) {
    if (!knownIds.has(component.componentId)) {
      failures.push(`Unknown component_id in impact report: ${component.componentId}`);
    }
  }

  for (const order of impactReport.affectedOrders) {
    if (!knownIds.has(order.orderId)) {
      failures.push(`Unknown order_id in impact report: ${order.orderId}`);
    }
  }

  for (const calc of impactReport.calculations) {
    for (const sourceId of calc.sourceIds) {
      if (!knownIds.has(sourceId)) {
        failures.push(`Calculation ${calc.id} references unknown source ${sourceId}`);
      }
    }
    if (!Number.isFinite(calc.value)) {
      failures.push(`Calculation ${calc.id} produced non-finite value`);
    }
  }

  for (const option of options) {
    for (const evidenceId of option.evidenceIds) {
      if (!knownIds.has(evidenceId)) {
        failures.push(`Option ${option.id} references unknown evidence ${evidenceId}`);
      }
    }
    if (option.estimatedCostUsd > 50_000 && !option.approvalRequired) {
      failures.push(`Option ${option.id} exceeds cost threshold without approval`);
    }
  }

  if (!options.some((option) => option.id === recommendedOptionId)) {
    failures.push(`Recommended option does not exist: ${recommendedOptionId}`);
  }

  const staleSignals = publicSignals.filter(
    (signal) => signal.status !== "LIVE" || signal.freshnessMinutes > 24 * 60
  );
  for (const signal of staleSignals) {
    warnings.push(
      `Signal ${signal.id} is ${signal.status} with freshness ${signal.freshnessMinutes} minutes`
    );
  }

  if (impactReport.launchRiskScore >= 70) {
    warnings.push("Launch risk score requires human approval before execution");
  }

  return {
    status: failures.length > 0 ? "BLOCKED" : warnings.length > 0 ? "WARN" : "PASS",
    failures,
    warnings,
    approvedForHumanReview: failures.length === 0,
    checkedAt: now
  };
}

export function validateDecisionPacket(packet: DecisionPacket) {
  return DecisionPacketSchema.safeParse(packet);
}
