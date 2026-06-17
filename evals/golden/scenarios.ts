// The frozen golden records -- one per eval scenario (Success_Criteria "six eval
// scenarios"). Each is a schema-valid V2 packet that PASSES every applicable
// grader; the corrupted variants (corruptions.ts) prove the graders bite. Supplier
// ids and the expected-affected sets are derived from the real seed (seed-ids.ts),
// so the records track the ingest contract instead of hard-coding ids.
//
// Prose-authoring rule for drafts (so the citation grader stays honest, not a
// false-failure machine): every sourceable numeral in a body is also a claim, and
// figures are written in full (no $1.2M shorthand, no bare aggregate counts) so the
// narrow extractor reads exactly what is cited.

import type { Claim, PublicSignal, Supplier } from "@/lib/schemas";
import { buildGolden, type GoldenScenario } from "@/evals/golden/build";
import {
  ALL_SUPPLIERS,
  HORMUZ_SUPPLIERS,
  HORMUZ_SUPPLIER_IDS
} from "@/evals/golden/seed-ids";

const BASE = "2026-06-17T00:00:00.000Z";

// Distinct, descending demo scores so messages cite different numbers (a uniform
// score would let a wrong-context bug pass by coincidence).
function score(i: number): number {
  return 88 - i * 3;
}

function idSet(suppliers: readonly Supplier[]): ReadonlySet<string> {
  return new Set(suppliers.map((s) => s.id));
}

// A per-supplier draft that cites its own exposure score, plus the 7-day window
// when the scenario has a simulation to anchor it to.
function draft(supplier: Supplier, exposureIndex: number, withWindow: boolean) {
  const s = score(exposureIndex);
  const claims: Claim[] = [
    { value: s, unit: "score", sourcePath: `exposureResults[${exposureIndex}].exposureScore` }
  ];
  let body =
    `We are contacting you about a supply-chain disruption affecting your inbound lanes. ` +
    `Your exposure score for this event is ${s}.`;
  if (withWindow) {
    claims.push({ value: 7, unit: "days", sourcePath: "simulation.horizons[0].days" });
    body += ` We are assessing impact over an initial 7-day window and will confirm contingency routing after review.`;
  } else {
    body += ` We are reviewing contingency options and will confirm next steps after review.`;
  }
  return {
    supplier,
    subject: "Supply-chain disruption: contingency review",
    body,
    claims
  };
}

function exposuresFor(suppliers: readonly Supplier[]) {
  return suppliers.map((supplier, i) => ({
    supplier,
    sector: supplier.sector ?? "OTHER_UNMAPPED",
    exposureScore: score(i),
    rationale: "Inbound lanes for this supplier transit the affected route."
  }));
}

const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=supply+chain&mode=artlist&format=json";
const EIA_URL = "https://www.eia.gov/todayinenergy/detail.php?id=hormuz";

// --- 1. Hormuz chokepoint closure (flagship, SEEDED + simulation) -----------
const hormuz = buildGolden({
  id: "hormuz",
  name: "Hormuz chokepoint closure",
  baseDateIso: BASE,
  threat: {
    eventType: "CHOKEPOINT_CLOSURE",
    severity: "HIGH",
    location: { region: "Persian Gulf", chokepoint: "Strait of Hormuz" },
    summary:
      "Transit through the Strait of Hormuz is disrupted, raising lead-time and surcharge risk for Gulf-routed inbound flows.",
    evidenceUrls: [GDELT_URL, EIA_URL],
    confidence: 0.82
  },
  exposures: exposuresFor(HORMUZ_SUPPLIERS),
  expectedAffectedSupplierIds: HORMUZ_SUPPLIER_IDS,
  simInputs: {
    baseDateIso: BASE,
    durationDays: 30,
    affected: HORMUZ_SUPPLIERS.map((s) => ({ supplierId: s.id, dailyRevenueUsd: 10_000 })),
    horizonDays: [7, 30, 90],
    inventory: [{ productId: "PROD-GULF-CHEM", onHandUnits: 1_000, dailyUseUnits: 40 }]
  },
  playbooks: [
    {
      role: "Procurement",
      summary: "Secure alternate routing for Gulf-exposed suppliers.",
      steps: ["Confirm backup supplier capacity", "Request expedited quotes on alternate lanes"],
      groundedExposureIndexes: [0, 1]
    }
  ],
  messages: HORMUZ_SUPPLIERS.slice(0, 5).map((s, i) => draft(s, i, true)),
  dataTier: "SEEDED",
  manifest: {
    sources: ["GDELT DOC 2.0 artlist", "EIA Today in Energy (Hormuz transit volumes)"],
    accessedDate: "2026-06-17",
    extractedClaim: "A large share of seaborne crude and LNG transits the Strait of Hormuz.",
    confidence: "HIGH",
    doNotEncode: ["exposureScore", "dailyRevenueUsd", "revenueAtRiskUsd", "runoutDate"]
  }
});

// --- 2. Tariff-deadline countdown (Tier-1, no simulation) -------------------
const tariffSuppliers = ALL_SUPPLIERS.filter(
  (s) => s.country === "CN" && (s.sector === "SEMICONDUCTORS" || s.sector === "ELECTRONICS")
);
const tariff = buildGolden({
  id: "tariff",
  name: "Tariff-deadline countdown",
  baseDateIso: BASE,
  threat: {
    eventType: "TARIFF_DEADLINE",
    severity: "MEDIUM",
    location: { country: "CN" },
    summary:
      "A tariff action with a fixed effective date raises landed-cost risk for China-origin semiconductor and electronics inbound.",
    evidenceUrls: ["https://ustr.gov/tariff-actions"],
    confidence: 0.7
  },
  exposures: exposuresFor(tariffSuppliers),
  expectedAffectedSupplierIds: idSet(tariffSuppliers),
  messages: tariffSuppliers.slice(0, 2).map((s, i) => draft(s, i, false)),
  dataGaps: ["Tier-1 upload: no inventory columns provided, so runway is not simulated."],
  dataTier: "TIER_1",
  manifest: {
    sources: ["USTR tariff action notice"],
    accessedDate: "2026-06-17",
    extractedClaim: "A tariff action has a fixed effective date for listed HS codes.",
    confidence: "MEDIUM",
    doNotEncode: ["exposureScore"]
  }
});

// --- 3. Red Sea / Suez diversion persistence (SEEDED + simulation) ----------
const redSeaSuppliers = ALL_SUPPLIERS.filter((s) => s.country === "IN");
const redSea = buildGolden({
  id: "redsea",
  name: "Red Sea / Suez diversion persistence",
  baseDateIso: BASE,
  threat: {
    eventType: "ROUTE_DIVERSION",
    severity: "MEDIUM",
    location: { region: "Red Sea", chokepoint: "Suez Canal" },
    summary:
      "Sustained Red Sea diversions add transit days to Suez-routed India-origin inbound, compounding lead times.",
    evidenceUrls: ["https://www.gdeltproject.org/redsea"],
    confidence: 0.68
  },
  exposures: exposuresFor(redSeaSuppliers),
  expectedAffectedSupplierIds: idSet(redSeaSuppliers),
  simInputs: {
    baseDateIso: BASE,
    durationDays: 60,
    affected: redSeaSuppliers.map((s) => ({ supplierId: s.id, dailyRevenueUsd: 8_000 })),
    horizonDays: [7, 30, 90],
    inventory: [{ productId: "PROD-IN-PHARMA", onHandUnits: 900, dailyUseUnits: 30 }]
  },
  messages: redSeaSuppliers.slice(0, 3).map((s, i) => draft(s, i, true)),
  dataTier: "SEEDED",
  manifest: {
    sources: ["GDELT DOC 2.0 artlist (Red Sea diversions)"],
    accessedDate: "2026-06-17",
    extractedClaim: "Red Sea diversions add transit days to Asia-Europe and Asia-US-East lanes.",
    confidence: "MEDIUM",
    doNotEncode: ["exposureScore", "dailyRevenueUsd", "revenueAtRiskUsd", "runoutDate"]
  }
});

// --- 4. Hurricane strike on a single-source plant (replay-only) -------------
const hurricaneSupplier =
  ALL_SUPPLIERS.find((s) => s.region === "Texas Gulf Coast" && s.sector === "ENERGY") ??
  ALL_SUPPLIERS.find((s) => s.country === "US") ??
  ALL_SUPPLIERS[0];
const hurricaneSignal: PublicSignal = {
  id: "SIG-hurricane",
  source: "NWS",
  sourceUrl: "https://api.weather.gov/alerts/hurricane",
  fetchedAt: BASE,
  eventType: "HURRICANE_WARNING",
  location: { region: "US Gulf Coast", country: "US" },
  severity: "HIGH",
  summary: "Hurricane warning for the Texas Gulf Coast (replay fixture).",
  freshnessMinutes: 0,
  status: "CACHED"
};
const hurricane = buildGolden({
  id: "hurricane",
  name: "Hurricane strike on a single-source plant (replay)",
  baseDateIso: BASE,
  threat: {
    eventType: "NATURAL_DISASTER",
    severity: "HIGH",
    location: { region: "US Gulf Coast", country: "US" },
    summary:
      "A hurricane making landfall on the Texas Gulf Coast threatens a single-source plant with no qualified backup.",
    evidenceUrls: ["https://api.weather.gov/alerts/hurricane"],
    confidence: 0.75
  },
  signals: [hurricaneSignal],
  exposures: exposuresFor([hurricaneSupplier]),
  expectedAffectedSupplierIds: idSet([hurricaneSupplier]),
  simInputs: {
    baseDateIso: BASE,
    durationDays: 14,
    affected: [{ supplierId: hurricaneSupplier.id, dailyRevenueUsd: 25_000 }],
    horizonDays: [7, 30],
    inventory: [{ productId: "PROD-SINGLE-SOURCE", onHandUnits: 300, dailyUseUnits: 30 }]
  },
  messages: [draft(hurricaneSupplier, 0, true)],
  dataGaps: ["Single-source plant: no qualified backup supplier in the current dataset."],
  dataTier: "SEEDED",
  requestedMode: "REPLAY",
  effectiveMode: "REPLAY",
  manifest: {
    sources: ["NWS alert (replay fixture)"],
    accessedDate: "2026-06-17",
    extractedClaim: "A hurricane warning was issued for the Texas Gulf Coast (replay).",
    confidence: "HIGH",
    doNotEncode: ["exposureScore", "dailyRevenueUsd", "revenueAtRiskUsd", "runoutDate"]
  }
});

// --- 5. Supplier bankruptcy with sudden liquidation (Tier-1) ----------------
const bankruptSupplier =
  ALL_SUPPLIERS.find((s) => s.riskTier === "CRITICAL" && s.country !== "US") ?? ALL_SUPPLIERS[0];
const bankruptcy = buildGolden({
  id: "bankruptcy",
  name: "Supplier bankruptcy with sudden liquidation",
  baseDateIso: BASE,
  threat: {
    eventType: "SUPPLIER_BANKRUPTCY",
    severity: "HIGH",
    location: { country: bankruptSupplier.country },
    summary:
      "A news-derived signal indicates sudden liquidation at a critical-tier supplier, threatening continuity of supply.",
    evidenceUrls: ["https://www.gdeltproject.org/bankruptcy"],
    confidence: 0.66
  },
  exposures: exposuresFor([bankruptSupplier]),
  expectedAffectedSupplierIds: idSet([bankruptSupplier]),
  messages: [draft(bankruptSupplier, 0, false)],
  dataGaps: ["Tier-1 upload: no inventory columns provided, so runway is not simulated."],
  dataTier: "TIER_1",
  manifest: {
    sources: ["GDELT DOC 2.0 artlist (financial distress)"],
    accessedDate: "2026-06-17",
    extractedClaim: "A news signal reports liquidation proceedings at the named supplier.",
    confidence: "MEDIUM",
    doNotEncode: ["exposureScore"]
  }
});

// --- 6a. Zero-exposure hallucination control --------------------------------
const zeroExposure = buildGolden({
  id: "zero-exposure",
  name: "Zero-exposure control (valid taxonomy, no match)",
  baseDateIso: BASE,
  threat: {
    eventType: "PORT_STRIKE",
    severity: "MEDIUM",
    location: { region: "South America Pacific", country: "PE" },
    summary:
      "A port strike at Callao, Peru is a valid, well-formed event that matches no supplier in the current dataset.",
    evidenceUrls: ["https://www.gdeltproject.org/portstrike"],
    confidence: 0.6
  },
  exposures: [],
  expectedAffectedSupplierIds: new Set<string>(),
  dataGaps: [
    "No direct exposure: the event location and lanes match no supplier in the current dataset."
  ],
  dataTier: "TIER_1",
  manifest: {
    sources: ["GDELT DOC 2.0 artlist (port labor action)"],
    accessedDate: "2026-06-17",
    extractedClaim: "A port labor action was reported at Callao, Peru.",
    confidence: "MEDIUM",
    doNotEncode: []
  }
});

// --- 6b. Off-taxonomy control (OTHER_UNMAPPED, never force-fit) --------------
const offTaxonomySuppliers = ALL_SUPPLIERS.slice(0, 2);
const offTaxonomy = buildGolden({
  id: "off-taxonomy",
  name: "Off-taxonomy control (OTHER_UNMAPPED)",
  baseDateIso: BASE,
  threat: {
    eventType: "SOLAR_FLARE_GRID_EVENT",
    severity: "MEDIUM",
    location: { region: "Global" },
    summary:
      "A geomagnetic grid event is outside the closed event vocabulary; affected suppliers are classified OTHER_UNMAPPED pending taxonomy review.",
    evidenceUrls: ["https://www.swpc.noaa.gov/products/geomagnetic-storm"],
    confidence: 0.5
  },
  exposures: offTaxonomySuppliers.map((supplier, i) => ({
    supplier,
    sector: "OTHER_UNMAPPED",
    exposureScore: score(i),
    rationale:
      "Event type is outside the closed vocabulary; sector linkage cannot be classified, so it is held as OTHER_UNMAPPED."
  })),
  expectedAffectedSupplierIds: idSet(offTaxonomySuppliers),
  offTaxonomyExpected: true,
  dataGaps: [
    "Event type SOLAR_FLARE_GRID_EVENT is outside the closed event vocabulary; classified OTHER_UNMAPPED pending taxonomy review."
  ],
  dataTier: "TIER_1",
  manifest: {
    sources: ["NOAA SWPC geomagnetic storm products"],
    accessedDate: "2026-06-17",
    extractedClaim: "A geomagnetic storm watch was issued (off the supply-chain event taxonomy).",
    confidence: "LOW",
    doNotEncode: ["exposureScore"]
  }
});

// All seven records cover the six scenarios (the zero-exposure + off-taxonomy pair
// is scenario 6). The runner iterates this list; adding a scenario adds a record.
export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  hormuz,
  tariff,
  redSea,
  hurricane,
  bankruptcy,
  zeroExposure,
  offTaxonomy
];

export {
  hormuz,
  tariff,
  redSea,
  hurricane,
  bankruptcy,
  zeroExposure,
  offTaxonomy
};
