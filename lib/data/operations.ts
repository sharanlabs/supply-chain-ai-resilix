import type { Scenario } from "@/lib/schemas";

export type Supplier = {
  id: string;
  name: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  tier: "TIER_1" | "TIER_2";
  riskTier: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  backupSupplierId?: string;
  standardLeadTimeDays: number;
};

export type Component = {
  id: string;
  name: string;
  supplierId: string;
  backupSupplierId?: string;
  productId: string;
  requiredForLaunch: boolean;
  unitCostUsd: number;
};

export type Product = {
  id: string;
  name: string;
  program: string;
  launchId: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  revenuePerUnitUsd: number;
};

export type InventoryPosition = {
  id: string;
  componentId: string;
  site: string;
  onHandUnits: number;
  dailyBurnUnits: number;
  safetyStockUnits: number;
};

export type Shipment = {
  id: string;
  componentId: string;
  supplierId: string;
  carrier: string;
  lane: string;
  status: "ON_TIME" | "DELAYED" | "AT_RISK";
  originalEta: string;
  revisedEta: string;
  quantityUnits: number;
  expediteCostUsd: number;
};

export type CustomerOrder = {
  id: string;
  productId: string;
  customerSegment: string;
  region: string;
  quantity: number;
  promisedDate: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type LaunchPlan = {
  id: string;
  productId: string;
  name: string;
  launchDate: string;
  plannedBuildUnits: number;
  minimumLaunchUnits: number;
};

export type ApprovalPolicy = {
  id: string;
  name: string;
  maxAutoApprovalCostUsd: number;
  executiveApprovalRiskScore: number;
  minConfidenceForApproval: "LOW" | "MEDIUM" | "HIGH";
};

export type OperationsData = {
  scenarios: Scenario[];
  suppliers: Supplier[];
  components: Component[];
  products: Product[];
  inventory: InventoryPosition[];
  shipments: Shipment[];
  orders: CustomerOrder[];
  launchPlans: LaunchPlan[];
  approvalPolicies: ApprovalPolicy[];
};

export const operationsData: OperationsData = {
  scenarios: [
    {
      id: "SCN-LAUNCH-001",
      name: "Launch-critical component delay",
      description:
        "A camera module shipment is late, inventory cover is thin, demand is above plan, and public signals add regional risk.",
      defaultSignalMode: "LIVE_WITH_FALLBACK",
      flagship: true
    },
    {
      id: "SCN-WEATHER-DC-002",
      name: "Distribution weather exposure",
      description:
        "A regional weather alert threatens outbound availability for priority launch orders.",
      defaultSignalMode: "LIVE_WITH_FALLBACK",
      flagship: false
    }
  ],
  suppliers: [
    {
      id: "SUP-APAC-014",
      name: "Kawasaki Optics Assembly",
      country: "Japan",
      region: "Kanagawa",
      lat: 35.5308,
      lon: 139.7036,
      tier: "TIER_1",
      riskTier: "HIGH",
      backupSupplierId: "SUP-SEA-022",
      standardLeadTimeDays: 18
    },
    {
      id: "SUP-SEA-022",
      name: "Penang Precision Modules",
      country: "Malaysia",
      region: "Penang",
      lat: 5.4164,
      lon: 100.3327,
      tier: "TIER_1",
      riskTier: "MEDIUM",
      standardLeadTimeDays: 24
    },
    {
      id: "SUP-US-008",
      name: "Austin Packaging Systems",
      country: "United States",
      region: "Texas",
      lat: 30.2672,
      lon: -97.7431,
      tier: "TIER_1",
      riskTier: "LOW",
      standardLeadTimeDays: 7
    },
    {
      id: "SUP-EU-011",
      name: "Brno Display Flex",
      country: "Czechia",
      region: "South Moravia",
      lat: 49.1951,
      lon: 16.6068,
      tier: "TIER_2",
      riskTier: "MEDIUM",
      standardLeadTimeDays: 21
    }
  ],
  components: [
    {
      id: "CMP-CAM-009",
      name: "48MP folded camera module",
      supplierId: "SUP-APAC-014",
      backupSupplierId: "SUP-SEA-022",
      productId: "PRD-ORION-PHONE",
      requiredForLaunch: true,
      unitCostUsd: 42
    },
    {
      id: "CMP-PKG-002",
      name: "Launch retail packaging kit",
      supplierId: "SUP-US-008",
      productId: "PRD-ORION-PHONE",
      requiredForLaunch: true,
      unitCostUsd: 8
    },
    {
      id: "CMP-FLEX-017",
      name: "Display flex connector",
      supplierId: "SUP-EU-011",
      productId: "PRD-ORION-PHONE",
      requiredForLaunch: true,
      unitCostUsd: 11
    }
  ],
  products: [
    {
      id: "PRD-ORION-PHONE",
      name: "Orion X1",
      program: "NPI-ORION-2026",
      launchId: "LCH-ORION-0526",
      priority: "CRITICAL",
      revenuePerUnitUsd: 899
    }
  ],
  inventory: [
    {
      id: "INV-CAM-SJC",
      componentId: "CMP-CAM-009",
      site: "San Jose launch build center",
      onHandUnits: 18500,
      dailyBurnUnits: 4200,
      safetyStockUnits: 7000
    },
    {
      id: "INV-PKG-SJC",
      componentId: "CMP-PKG-002",
      site: "San Jose launch build center",
      onHandUnits: 72000,
      dailyBurnUnits: 3900,
      safetyStockUnits: 9000
    },
    {
      id: "INV-FLEX-SJC",
      componentId: "CMP-FLEX-017",
      site: "San Jose launch build center",
      onHandUnits: 53800,
      dailyBurnUnits: 4100,
      safetyStockUnits: 8200
    }
  ],
  shipments: [
    {
      id: "SHP-CAM-4431",
      componentId: "CMP-CAM-009",
      supplierId: "SUP-APAC-014",
      carrier: "Ocean-air multimodal",
      lane: "Tokyo/Narita to San Jose",
      status: "DELAYED",
      originalEta: "2026-05-17",
      revisedEta: "2026-05-28",
      quantityUnits: 38000,
      expediteCostUsd: 186000
    },
    {
      id: "SHP-PKG-2088",
      componentId: "CMP-PKG-002",
      supplierId: "SUP-US-008",
      carrier: "Domestic truckload",
      lane: "Austin to San Jose",
      status: "ON_TIME",
      originalEta: "2026-05-12",
      revisedEta: "2026-05-12",
      quantityUnits: 48000,
      expediteCostUsd: 12000
    },
    {
      id: "SHP-FLEX-6104",
      componentId: "CMP-FLEX-017",
      supplierId: "SUP-EU-011",
      carrier: "Air freight",
      lane: "Prague to San Jose",
      status: "ON_TIME",
      originalEta: "2026-05-15",
      revisedEta: "2026-05-15",
      quantityUnits: 42000,
      expediteCostUsd: 74000
    }
  ],
  orders: [
    {
      id: "ORD-NA-10018",
      productId: "PRD-ORION-PHONE",
      customerSegment: "Carrier launch allocation",
      region: "North America",
      quantity: 26000,
      promisedDate: "2026-05-27",
      priority: "CRITICAL"
    },
    {
      id: "ORD-EU-10044",
      productId: "PRD-ORION-PHONE",
      customerSegment: "Retail launch channel",
      region: "Western Europe",
      quantity: 18500,
      promisedDate: "2026-05-29",
      priority: "HIGH"
    },
    {
      id: "ORD-APAC-10077",
      productId: "PRD-ORION-PHONE",
      customerSegment: "Online preorder",
      region: "Asia Pacific",
      quantity: 14200,
      promisedDate: "2026-05-30",
      priority: "HIGH"
    }
  ],
  launchPlans: [
    {
      id: "LCH-ORION-0526",
      productId: "PRD-ORION-PHONE",
      name: "Orion X1 first customer ship",
      launchDate: "2026-05-26",
      plannedBuildUnits: 70000,
      minimumLaunchUnits: 52000
    }
  ],
  approvalPolicies: [
    {
      id: "POL-LAUNCH-CRITICAL",
      name: "Launch critical recovery policy",
      maxAutoApprovalCostUsd: 50000,
      executiveApprovalRiskScore: 70,
      minConfidenceForApproval: "MEDIUM"
    }
  ]
};

export function getScenario(id = "SCN-LAUNCH-001") {
  const scenario = operationsData.scenarios.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Scenario not found: ${id}`);
  }
  return scenario;
}
