import type { DecisionPacketV2 } from "@/lib/schemas";

// A valid DecisionPacketV2 (ActionOps) fixture for the versioning tests and the
// V2 view render test. The live pipeline does not emit V2 yet (Phases 4-8), so
// tests construct one directly. Override any section via `overrides`.
export function makeV2Packet(
  overrides: Partial<DecisionPacketV2> = {}
): DecisionPacketV2 {
  const now = "2026-06-13T12:00:00.000Z";
  return {
    packetVersion: 2,
    id: "DP-v2-fixture",
    threatCard: {
      id: "THREAT-001",
      eventType: "CHOKEPOINT_CLOSURE",
      severity: "HIGH",
      location: {
        region: "Persian Gulf",
        country: "IR",
        chokepoint: "Strait of Hormuz"
      },
      summary:
        "Hormuz transit disruption raises lead-time and surcharge risk for Gulf-routed inbound.",
      evidenceUrls: ["https://example.com/evidence-1"],
      confidence: 0.8,
      createdAt: now
    },
    publicSignals: [],
    exposureResults: [
      {
        id: "EXP-001",
        supplierId: "SUP-100",
        supplierName: "Gulf Components Ltd",
        country: "AE",
        sector: "ELECTRONICS",
        exposureScore: 72,
        rationale: "Inbound lanes transit the affected chokepoint.",
        evidenceIds: ["THREAT-001"]
      }
    ],
    simulation: {
      horizons: [
        { days: 7, revenueAtRiskUsd: 50_000 },
        { days: 30, revenueAtRiskUsd: 200_000 }
      ],
      productRunouts: [{ productId: "PROD-1", runoutDate: "2026-07-01" }],
      generatedAt: now
    },
    dataTier: "SEEDED",
    dataGaps: [],
    playbooks: [
      {
        id: "PB-001",
        role: "Procurement",
        summary: "Secure alternate routing for Gulf-exposed components.",
        steps: ["Contact backup supplier", "Request expedited quote"],
        groundedClaimIds: ["EXP-001"]
      }
    ],
    supplierMessages: [
      {
        id: "MSG-001",
        supplierId: "SUP-100",
        channel: "email",
        subject: "Hormuz disruption - contingency planning",
        body: "We are assessing 7-day revenue exposure and contingency routing.",
        claims: [
          {
            value: 50_000,
            unit: "USD",
            sourcePath: "simulation.horizons[0].revenueAtRiskUsd"
          }
        ],
        approvalRequired: true
      }
    ],
    actionItems: [
      {
        id: "AI-001",
        title: "Confirm backup supplier capacity",
        owner: "Procurement",
        status: "OPEN"
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
      { at: now, actor: "system", action: "PACKET_CREATED", detail: "V2 fixture." }
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}
