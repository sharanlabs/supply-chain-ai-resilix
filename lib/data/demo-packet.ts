import type { DecisionPacketV2, PublicSignal, Simulation } from "@/lib/schemas";
import { buildRecoveryOptions } from "@/lib/agents/actionops/recovery";

// One source of truth for the demo run instant -- the simulation const + makeDemoPacket
// share it so the runout dates, survivalDays, and createdAt stay coherent.
const DEMO_RUN_AT = "2026-06-12T08:42:00.000Z";

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
      "Abu Dhabi origin, CRITICAL risk tier; all inbound lanes transit the affected chokepoint; single-source (no qualified backup).",
    singleSource: true,
    recoveryDays: 58,
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
      "Ras Laffan origin; Gulf-routed energy inputs face a long standard lead time extended by the closure window; single-source (no qualified backup).",
    singleSource: true,
    recoveryDays: 60,
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
      "Eastern Province origin; sector reprices on a Gulf petrochem shock; qualified backup on file (a partial alternate exists).",
    singleSource: false,
    recoveryDays: 44,
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
      "CRITICAL-tier Eastern Province energy supplier; a long lead time leaves little buffer against an extended closure; single-source (no qualified backup).",
    singleSource: true,
    recoveryDays: 57,
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
      "Al Ahmadi origin with the longest lead time in the Gulf subset; secondary exposure via shared routing; single-source (no qualified backup).",
    singleSource: true,
    recoveryDays: 63,
    evidenceIds: ["THREAT-HORMUZ-001"]
  }
];

// Illustrative (see the audit note), but INTERNALLY CONSISTENT with the runout-anchored P1
// model: revenue-at-risk is 0 while inventory still covers demand and accrues only AFTER the
// earliest runout. survivalDays = 7 (PROD-ELECTROLYTE-A runs out 2026-06-19, 7 days after the
// 2026-06-12 capture), so a ~$50k/day Gulf-lane exposure gives @3d,@7d -> 0 (covered);
// @14d -> (14-7) x 50k = 350,000; @30d -> (30-7) x 50k = 1,150,000. margin = revenue x ~0.34.
export const demoSimulation: Simulation = {
  horizons: [
    { days: 3, revenueAtRiskUsd: 0, marginAtRiskUsd: 0 },
    { days: 7, revenueAtRiskUsd: 0, marginAtRiskUsd: 0 },
    { days: 14, revenueAtRiskUsd: 350_000, marginAtRiskUsd: 119_000 },
    { days: 30, revenueAtRiskUsd: 1_150_000, marginAtRiskUsd: 391_000 }
  ],
  productRunouts: [
    { productId: "PROD-ELECTROLYTE-A", runoutDate: "2026-06-19" },
    { productId: "PROD-CATALYST-B", runoutDate: "2026-06-26" }
  ],
  survivalDays: 7,
  generatedAt: DEMO_RUN_AT
};

export function makeDemoPacket(): DecisionPacketV2 {
  const now = DEMO_RUN_AT;
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
    simulation: demoSimulation,
    dataTier: "SEEDED",
    dataGaps: [],
    // Numeral-free, grounded in exposure ids (the production Strategist contract): every
    // figure lives in the structured exposure/simulation data, never restated in prose.
    // All three roles ship (Procurement / Operations / Finance) -- the P1 domain win.
    playbooks: [
      {
        id: "PB-PROCUREMENT",
        role: "Procurement",
        summary:
          "Secure alternate routing and backup capacity for the Gulf-exposed chemical and energy suppliers.",
        steps: [
          "Confirm current lead times and backup capacity with the most exposed suppliers.",
          "Issue contingency RFQs on alternate, non-Gulf lanes for the single-source chemical inputs.",
          "Hold a qualified-backup decision ahead of the next review."
        ],
        groundedClaimIds: ["EXP-078", "EXP-095", "EXP-076"]
      },
      {
        id: "PB-OPERATIONS",
        role: "Operations",
        summary: "Protect production continuity for the lines the exposed parts feed.",
        steps: [
          "Re-plan the electrolyte line around its projected runout date.",
          "Stage available safety stock for the catalyst line ahead of its runout.",
          "Coordinate inbound rerouting and expedite slots with logistics."
        ],
        groundedClaimIds: ["EXP-078", "EXP-076"]
      },
      {
        id: "PB-FINANCE",
        role: "Finance",
        summary: "Quantify and contain the revenue and margin exposure on the Gulf lanes.",
        steps: [
          "Review the modeled revenue- and margin-at-risk for the affected lines.",
          "Pre-authorize expedite and substitution spend within approval policy.",
          "Brief leadership on the contribution-margin impact and the funding ask."
        ],
        groundedClaimIds: ["EXP-078", "EXP-094"]
      }
    ],
    // Scored, structured mitigation options (P1) -- reversibility is the governance dial.
    // DERIVED from the demo exposures + simulation via the SAME deterministic producer the
    // live pipeline uses, so the demo's option scores/costs can never drift from the model
    // (Codex caught a hand-authored set that no longer matched the simulation it was scored
    // against). The demo exposures + simulation are hand-authored illustrative data; the
    // options computed from them show exactly what the engine would recommend for that frame.
    recoveryOptions: buildRecoveryOptions(demoExposure, demoSimulation),
    // P1 score-leak fix: impact-assessment REQUESTS -- they ask the supplier for THEIR
    // figures and state NONE of ours (no internal exposure score, no internal dollar
    // figure). Numeral-free, so claims[] is empty.
    supplierMessages: [
      {
        id: "MSG-078",
        supplierId: "SUP-078",
        channel: "email",
        subject: "Supply-chain disruption: impact-assessment request",
        body: "We are tracking the Strait of Hormuz disruption against our Gulf-routed inbound. To assess the impact on our open orders, please confirm: your current shipment dates and any expected delay, your on-hand position, your expected recovery timeline, whether you are declaring force majeure, and any sub-tier exposure you are aware of.",
        claims: [],
        approvalRequired: true
      },
      {
        id: "MSG-095",
        supplierId: "SUP-095",
        channel: "email",
        subject: "Supply-chain disruption: impact-assessment request",
        body: "Given the closure window on the Gulf lane, please confirm whether your standard lead time is holding or extending for shipments scheduled this month, your on-hand position, and your expected recovery timeline.",
        claims: [],
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
        title: "Re-plan electrolyte line around its projected runout",
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
