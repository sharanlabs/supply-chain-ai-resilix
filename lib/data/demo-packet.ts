import type { DecisionPacketV2, PublicSignal } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// The seeded Hormuz demo packet, for the UI primary screen before the live
// ActionOps agents (Phases 4-7) exist. It is a real DecisionPacketV2 derived
// from the actual us-suppliers seed subset the seed README designs for the
// Gulf-chokepoint scenario (AE / SA / QA / KW origins plus global ENERGY /
// CHEMICALS exposure). Supplier names and IDs are the synthetic-but-real seed
// labels — never invented placeholders.
//
// effectiveMode is DETERMINISTIC_RULES (a healthy, by-design replayable demo),
// NOT FAILED_TO_FALLBACK — so the UI shows the honest "Recorded signals" line,
// never the degraded badge. The live pipeline upgrades this to LIVE_AI once the
// agents land; nothing here is presented as live AI.
// ---------------------------------------------------------------------------

// The dated capture of the recorded signals backing this demo. Rendered in the
// UI as "Recorded signals: <date>" so a viewer is never shown replay as live.
export const DEMO_SIGNALS_CAPTURED_AT = "2026-06-12T08:40:00.000Z";

const RECORDED_AT = DEMO_SIGNALS_CAPTURED_AT;

export const demoSignals: PublicSignal[] = [
  {
    id: "SIG-GDELT-HORMUZ-01",
    source: "GDELT GKG",
    sourceUrl:
      "https://www.gdeltproject.org/data/gkg/20260612.gkg.csv.zip",
    fetchedAt: RECORDED_AT,
    eventType: "MARITIME_SECURITY",
    location: { region: "Persian Gulf", country: "OM", lat: 26.57, lon: 56.25 },
    severity: "HIGH",
    summary:
      "Vessel-tracking and news GKG cluster reports renewed transit interference at the Strait of Hormuz; tanker insurers reprice the lane.",
    freshnessMinutes: 95,
    status: "CACHED"
  },
  {
    id: "SIG-GDELT-HORMUZ-02",
    source: "GDELT Article List",
    sourceUrl: "https://api.gdeltproject.org/api/v2/doc/doc?query=Strait+of+Hormuz",
    fetchedAt: RECORDED_AT,
    eventType: "GEOPOLITICAL",
    location: { region: "Persian Gulf", country: "IR" },
    severity: "HIGH",
    summary:
      "Multiple outlets report a partial closure window with elevated war-risk surcharges on Gulf-routed inbound.",
    freshnessMinutes: 110,
    status: "CACHED"
  },
  {
    id: "SIG-NWS-GULF-01",
    source: "NWS Marine Forecast",
    sourceUrl: "https://api.weather.gov/zones/forecast/PZZ800",
    fetchedAt: RECORDED_AT,
    eventType: "WEATHER_LOGISTICS",
    location: { region: "Arabian Gulf approaches", country: "AE" },
    severity: "LOW",
    summary:
      "No weather complication on the Gulf approaches; the disruption is geopolitical, not meteorological.",
    freshnessMinutes: 70,
    status: "CACHED"
  }
];

// Exposure rows are real seed suppliers from the Gulf / ENERGY / CHEMICALS
// subset, ranked by exposure score. Names and IDs are the seed labels. The
// exposureScore figures here are an ILLUSTRATIVE hand-authored reference (this
// packet is only the defensive fallback) and are internally consistent with the
// claims below; the live pipeline emits the D.2 Atlas model's tier + lead-time
// scores, not these.
export const demoExposure: DecisionPacketV2["exposureResults"] = [
  {
    id: "EXP-078",
    supplierId: "SUP-078",
    supplierName: "Abu Chemical Partners 078",
    country: "AE",
    sector: "CHEMICALS",
    exposureScore: 88,
    rationale:
      "Abu Dhabi origin, CRITICAL risk tier; all inbound lanes transit the affected chokepoint and there is no qualified backup.",
    evidenceIds: ["THREAT-HORMUZ-001", "SIG-GDELT-HORMUZ-01"]
  },
  {
    id: "EXP-095",
    supplierId: "SUP-095",
    supplierName: "Ras Energy Systems 095",
    country: "QA",
    sector: "ENERGY",
    exposureScore: 81,
    rationale:
      "Ras Laffan origin; Gulf-routed energy inputs face a 46-day standard lead time extended by the closure window.",
    evidenceIds: ["THREAT-HORMUZ-001", "SIG-GDELT-HORMUZ-02"]
  },
  {
    id: "EXP-076",
    supplierId: "SUP-076",
    supplierName: "Eastern Chemical Group 076",
    country: "SA",
    sector: "CHEMICALS",
    exposureScore: 74,
    rationale:
      "Eastern Province origin; sector reprices on a Gulf petrochem shock even where a partial alternate exists.",
    evidenceIds: ["THREAT-HORMUZ-001"]
  },
  {
    id: "EXP-094",
    supplierId: "SUP-094",
    supplierName: "Eastern Energy Partners 094",
    country: "SA",
    sector: "ENERGY",
    exposureScore: 69,
    rationale:
      "CRITICAL-tier Eastern Province energy supplier; 43-day lead time leaves little buffer against an extended closure.",
    evidenceIds: ["THREAT-HORMUZ-001"]
  },
  {
    id: "EXP-096",
    supplierId: "SUP-096",
    supplierName: "Al Energy Solutions 096",
    country: "KW",
    sector: "ENERGY",
    exposureScore: 63,
    rationale:
      "Al Ahmadi origin with the longest lead time in the Gulf subset (49 days); secondary exposure via shared routing.",
    evidenceIds: ["THREAT-HORMUZ-001"]
  }
];

export function makeDemoPacket(): DecisionPacketV2 {
  const now = "2026-06-12T08:42:00.000Z";
  return {
    packetVersion: 2,
    id: "DP-DEMO-HORMUZ",
    threatCard: {
      id: "THREAT-HORMUZ-001",
      eventType: "CHOKEPOINT_CLOSURE",
      severity: "HIGH",
      location: {
        region: "Persian Gulf",
        country: "OM",
        chokepoint: "Strait of Hormuz"
      },
      summary:
        "Renewed transit interference at the Strait of Hormuz raises lead-time and war-risk surcharge exposure across Gulf-routed inbound. Insurers have repriced the lane; a partial closure window is in effect.",
      evidenceUrls: [
        "https://www.gdeltproject.org/data/gkg/20260612.gkg.csv.zip",
        "https://api.gdeltproject.org/api/v2/doc/doc?query=Strait+of+Hormuz"
      ],
      confidence: 0.82,
      createdAt: now
    },
    publicSignals: demoSignals,
    exposureResults: demoExposure,
    simulation: {
      horizons: [
        { days: 3, revenueAtRiskUsd: 86_400 },
        { days: 7, revenueAtRiskUsd: 214_700 },
        { days: 14, revenueAtRiskUsd: 498_200 },
        { days: 30, revenueAtRiskUsd: 1_142_500 }
      ],
      productRunouts: [
        { productId: "PROD-ELECTROLYTE-A", runoutDate: "2026-06-29" },
        { productId: "PROD-CATALYST-B", runoutDate: "2026-07-08" }
      ],
      generatedAt: now
    },
    dataTier: "SEEDED",
    dataGaps: [],
    playbooks: [
      {
        id: "PB-PROCUREMENT",
        role: "Procurement lead",
        summary:
          "Hold the line on Gulf-exposed CHEMICALS inputs and open a qualified alternate before the 14-day horizon.",
        steps: [
          "Issue contingency RFQs to the two non-Gulf backup chemical suppliers in the base.",
          "Confirm a 30-day spot allocation against the $498,200 14-day exposure.",
          "Lock expedited air-freight quotes for the CRITICAL-tier Abu Dhabi lane."
        ],
        groundedClaimIds: ["EXP-078", "simulation.horizons[2].revenueAtRiskUsd"]
      },
      {
        id: "PB-OPERATIONS",
        role: "Operations lead",
        summary:
          "Sequence builds against the earliest runout (PROD-ELECTROLYTE-A, 2026-06-29) to preserve launch-critical output.",
        steps: [
          "Re-plan the electrolyte line around the June 29 runout date.",
          "Stage safety stock for the catalyst line ahead of the July 8 runout."
        ],
        groundedClaimIds: ["EXP-078", "EXP-076"]
      }
    ],
    supplierMessages: [
      {
        id: "MSG-078",
        supplierId: "SUP-078",
        channel: "email",
        subject: "Hormuz transit risk — contingency confirmation request",
        body: "We are tracking the Strait of Hormuz disruption against our Gulf-routed inbound. To plan around a 7-day exposure of $214,700, please confirm your current lead time and whether an alternate routing is available for our open orders.",
        claims: [
          {
            value: 214_700,
            unit: "USD",
            sourcePath: "simulation.horizons[1].revenueAtRiskUsd"
          },
          {
            value: 88,
            unit: "exposure-score",
            sourcePath: "exposureResults[0].exposureScore"
          }
        ],
        approvalRequired: true
      },
      {
        id: "MSG-095",
        supplierId: "SUP-095",
        channel: "email",
        subject: "Ras Laffan lane — extended lead-time check",
        body: "Given the closure window on the Gulf lane, please confirm whether your 46-day standard lead time is holding or extending for shipments scheduled this month.",
        claims: [
          {
            value: 81,
            unit: "exposure-score",
            sourcePath: "exposureResults[1].exposureScore"
          }
        ],
        approvalRequired: true
      }
    ],
    actionItems: [
      {
        id: "AI-001",
        title: "Confirm backup capacity for Abu Dhabi CHEMICALS lane",
        owner: "Procurement lead",
        status: "OPEN",
        dueDate: "2026-06-16"
      },
      {
        id: "AI-002",
        title: "Re-plan electrolyte line around June 29 runout",
        owner: "Operations lead",
        status: "OPEN",
        dueDate: "2026-06-18"
      },
      {
        id: "AI-003",
        title: "Lock expedited air-freight quotes for CRITICAL lane",
        owner: "Logistics",
        status: "OPEN",
        dueDate: "2026-06-17"
      }
    ],
    gatekeeper: {
      status: "PASS",
      failures: [],
      warnings: [],
      approvedForHumanReview: true,
      checkedAt: now
    },
    agentRuns: [],
    requestedMode: "DETERMINISTIC_RULES",
    effectiveMode: "DETERMINISTIC_RULES",
    approvalStatus: "PENDING",
    auditTrail: [
      {
        at: now,
        actor: "system",
        action: "PACKET_ASSEMBLED",
        detail:
          "Illustrative reference packet (defensive fallback only): the exposure figures are hand-authored examples, not live D.2 Atlas model output. Assembled from recorded signals (2026-06-12) and the US-suppliers Gulf subset."
      }
    ],
    createdAt: now,
    updatedAt: now
  };
}
