import { operationsData } from "@/lib/data/operations";
import type { ExceptionEvent, ImpactReport, PublicSignal, RecoveryOption } from "@/lib/schemas";
import { daysBetween } from "@/lib/utils";

const RUN_DATE = new Date("2026-05-05T12:00:00Z");

export function buildExceptionEvent({
  scenarioId,
  publicSignals
}: {
  scenarioId: string;
  publicSignals: PublicSignal[];
}): ExceptionEvent {
  const scenario = operationsData.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown scenario ${scenarioId}`);
  }

  const delayedShipment = operationsData.shipments.find(
    (shipment) => shipment.status === "DELAYED"
  );
  const component = operationsData.components.find(
    (item) => item.id === delayedShipment?.componentId
  );
  const supplier = operationsData.suppliers.find(
    (item) => item.id === delayedShipment?.supplierId
  );
  const product = operationsData.products.find((item) => item.id === component?.productId);
  const affectedOrders = operationsData.orders.filter(
    (order) => order.productId === product?.id
  );

  const strongestSignal = publicSignals.find((signal) =>
    ["HIGH", "CRITICAL"].includes(signal.severity)
  );

  return {
    id: "EXC-LAUNCH-0001",
    scenarioId,
    title: "Camera module shortage threatens launch readiness",
    status: "OPEN",
    severity: strongestSignal?.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
    problemSummary:
      `${component?.name ?? "Critical component"} shipment ${delayedShipment?.id ?? ""} ` +
      `from ${supplier?.name ?? "primary supplier"} is delayed beyond launch ramp needs.`,
    linkedSignalIds: publicSignals.map((signal) => signal.id),
    affectedSupplierIds: supplier ? [supplier.id] : [],
    affectedComponentIds: component ? [component.id] : [],
    affectedShipmentIds: delayedShipment ? [delayedShipment.id] : [],
    affectedOrderIds: affectedOrders.map((order) => order.id),
    createdAt: RUN_DATE.toISOString()
  };
}

export function calculateImpact(exception: ExceptionEvent): ImpactReport {
  const shipment = operationsData.shipments.find(
    (item) => item.id === exception.affectedShipmentIds[0]
  );
  const component = operationsData.components.find(
    (item) => item.id === exception.affectedComponentIds[0]
  );
  const supplier = operationsData.suppliers.find(
    (item) => item.id === exception.affectedSupplierIds[0]
  );
  const product = operationsData.products.find((item) => item.id === component?.productId);
  const launch = operationsData.launchPlans.find((item) => item.id === product?.launchId);
  const inventory = operationsData.inventory.find(
    (item) => item.componentId === component?.id
  );
  const affectedOrders = operationsData.orders.filter(
    (order) => order.productId === product?.id
  );

  if (!shipment || !component || !supplier || !product || !launch || !inventory) {
    throw new Error("Scenario data is incomplete for impact calculation");
  }

  const originalEta = new Date(`${shipment.originalEta}T12:00:00Z`);
  const revisedEta = new Date(`${shipment.revisedEta}T12:00:00Z`);
  const launchDate = new Date(`${launch.launchDate}T12:00:00Z`);
  const shipmentDelayDays = Math.max(0, daysBetween(originalEta, revisedEta));
  const daysUntilLaunch = Math.max(0, daysBetween(RUN_DATE, launchDate));
  const inventoryDaysRemaining = round1(inventory.onHandUnits / inventory.dailyBurnUnits);
  const buildableUnitsBeforeStockout = Math.max(
    0,
    inventory.onHandUnits - inventory.safetyStockUnits
  );
  const projectedStockout = addDays(RUN_DATE, Math.floor(inventoryDaysRemaining));
  const launchSupplyGapUnits = Math.max(
    0,
    launch.minimumLaunchUnits - buildableUnitsBeforeStockout
  );
  const revenueAtRisk = affectedOrders.reduce(
    (total, order) => total + order.quantity * product.revenuePerUnitUsd,
    0
  );
  const slaRiskOrders = affectedOrders.filter(
    (order) => new Date(`${order.promisedDate}T12:00:00Z`) < revisedEta
  ).length;

  const launchRiskScore = clamp(
    Math.round(
      35 +
        shipmentDelayDays * 3 +
        Math.max(0, 7 - inventoryDaysRemaining) * 5 +
        slaRiskOrders * 6 +
        (launchSupplyGapUnits / launch.minimumLaunchUnits) * 35
    ),
    0,
    100
  );

  return {
    id: "IMP-LAUNCH-0001",
    exceptionId: exception.id,
    launchId: launch.id,
    affectedSuppliers: [
      {
        supplierId: supplier.id,
        supplierName: supplier.name,
        country: supplier.country,
        tier: supplier.tier
      }
    ],
    affectedComponents: [
      {
        componentId: component.id,
        componentName: component.name,
        requiredForLaunch: component.requiredForLaunch
      }
    ],
    affectedOrders: affectedOrders.map((order) => ({
      orderId: order.id,
      customerSegment: order.customerSegment,
      region: order.region,
      promisedDate: order.promisedDate,
      revenue: order.quantity * product.revenuePerUnitUsd
    })),
    calculations: [
      {
        id: "CALC-INVENTORY-DAYS",
        label: "Inventory days remaining",
        formula: "onHandUnits / dailyBurnUnits",
        value: inventoryDaysRemaining,
        unit: "days",
        sourceIds: [inventory.id]
      },
      {
        id: "CALC-SHIPMENT-DELAY",
        label: "Shipment delay",
        formula: "revisedEta - originalEta",
        value: shipmentDelayDays,
        unit: "days",
        sourceIds: [shipment.id]
      },
      {
        id: "CALC-LAUNCH-GAP",
        label: "Minimum launch unit gap",
        formula: "minimumLaunchUnits - (onHandUnits - safetyStockUnits)",
        value: launchSupplyGapUnits,
        unit: "units",
        sourceIds: [launch.id, inventory.id]
      },
      {
        id: "CALC-DAYS-TO-LAUNCH",
        label: "Days until launch",
        formula: "launchDate - runDate",
        value: daysUntilLaunch,
        unit: "days",
        sourceIds: [launch.id]
      },
      {
        id: "CALC-REVENUE-RISK",
        label: "Revenue at risk",
        formula: "sum(order.quantity * product.revenuePerUnitUsd)",
        value: revenueAtRisk,
        unit: "USD",
        sourceIds: [product.id, ...affectedOrders.map((order) => order.id)]
      }
    ],
    inventoryDaysRemaining,
    projectedStockoutDate: projectedStockout.toISOString().slice(0, 10),
    shipmentDelayDays,
    launchRiskScore,
    revenueAtRisk,
    slaRiskOrders,
    generatedAt: RUN_DATE.toISOString()
  };
}

export function buildRecoveryOptions(impact: ImpactReport): RecoveryOption[] {
  const delayedShipment = operationsData.shipments.find(
    (shipment) => shipment.id === "SHP-CAM-4431"
  );
  const policy = operationsData.approvalPolicies[0];

  const options: RecoveryOption[] = [
    {
      id: "OPT-EXPEDITE-SPLIT",
      title: "Split and expedite camera modules by air",
      actionType: "SPLIT_SHIPMENT",
      summary:
        "Move 18k units from the delayed shipment to priority air freight and keep the balance on revised multimodal routing.",
      estimatedCostUsd: delayedShipment?.expediteCostUsd ?? 186000,
      speedGainDays: 7,
      riskReductionPct: 68,
      confidence: "HIGH",
      reversibility: "MEDIUM",
      score: 91,
      evidenceIds: ["SHP-CAM-4431", "CALC-SHIPMENT-DELAY", "CALC-REVENUE-RISK"],
      approvalRequired: true
    },
    {
      id: "OPT-REALLOCATE-BUILDS",
      title: "Reallocate pilot inventory to launch orders",
      actionType: "REALLOCATE",
      summary:
        "Pull 9k camera modules from pilot and service allocation to protect carrier launch commitments.",
      estimatedCostUsd: 42000,
      speedGainDays: 4,
      riskReductionPct: 46,
      confidence: "MEDIUM",
      reversibility: "HIGH",
      score: 76,
      evidenceIds: ["INV-CAM-SJC", "ORD-NA-10018", "CALC-INVENTORY-DAYS"],
      approvalRequired: impact.launchRiskScore >= policy.executiveApprovalRiskScore
    },
    {
      id: "OPT-BACKUP-SUPPLIER",
      title: "Activate backup supplier for partial launch cover",
      actionType: "SUPPLIER_ESCALATION",
      summary:
        "Place a controlled pull-in order with the qualified backup supplier while retaining primary supplier accountability.",
      estimatedCostUsd: 128000,
      speedGainDays: 5,
      riskReductionPct: 54,
      confidence: "MEDIUM",
      reversibility: "LOW",
      score: 72,
      evidenceIds: ["SUP-SEA-022", "CMP-CAM-009", "CALC-LAUNCH-GAP"],
      approvalRequired: true
    }
  ];

  return options.sort((a, b) => b.score - a.score);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
