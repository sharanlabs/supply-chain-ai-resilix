// Builder for a frozen golden record: a schema-valid V2 packet + the independent
// ground truth it is graded against + a traceability manifest.
//
// Two invariants make the records honest rather than circular:
//   - supplier ids come from the real ingest (seed-ids.ts), so a packet cannot cite
//     an id the pipeline could not produce.
//   - the simulation is built by `recomputeSimulation(simInputs)`, the SAME function
//     the grader recomputes with -- so a correct record matches by construction, and
//     a corrupted record (a perturbed figure) diverges and fails.
// The expected-affected set is supplied INDEPENDENTLY (derived from the seed by the
// scenario), not read back from the packet, so the exposure grader has real teeth.

import {
  type Claim,
  type DataTier,
  type DecisionPacketV2,
  type PublicSignal,
  type Supplier
} from "@/lib/schemas";
import {
  recomputeSimulation,
  type ScenarioGroundTruth,
  type SimInputs
} from "@/lib/evals/graders";
import { KNOWN_SUPPLIER_IDS } from "@/evals/golden/seed-ids";

// Per-fixture traceability (Success_Criteria "fixture traceability" row): where the
// scenario's facts came from, when, and which values are illustrative and must not
// be read as live truth.
export type GoldenManifest = {
  sources: string[];
  accessedDate: string;
  extractedClaim: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  // Values that are demo/illustrative (scores, revenue figures) -- never to be
  // presented as real measurements.
  doNotEncode: string[];
};

export type ExposureSpec = {
  supplier: Supplier;
  sector: string;
  exposureScore: number;
  rationale: string;
};

export type MessageSpec = {
  supplier: Supplier;
  subject?: string;
  body: string;
  claims: Claim[];
  channel?: string;
};

export type PlaybookSpec = {
  role: string;
  summary: string;
  steps: string[];
  groundedExposureIndexes: number[];
};

export type GoldenSpec = {
  id: string;
  name: string;
  baseDateIso: string;
  threat: {
    eventType: string;
    severity: DecisionPacketV2["threatCard"]["severity"];
    location: DecisionPacketV2["threatCard"]["location"];
    summary: string;
    evidenceUrls: string[];
    confidence: number;
  };
  signals?: PublicSignal[];
  exposures: ExposureSpec[];
  // The set Atlas SHOULD match, derived independently from the seed by the scenario.
  expectedAffectedSupplierIds: ReadonlySet<string>;
  simInputs?: SimInputs;
  playbooks?: PlaybookSpec[];
  messages?: MessageSpec[];
  dataGaps?: string[];
  dataTier: DataTier;
  requestedMode?: DecisionPacketV2["requestedMode"];
  effectiveMode?: DecisionPacketV2["effectiveMode"];
  untrustedRawStrings?: string[];
  offTaxonomyExpected?: boolean;
  manifest: GoldenManifest;
};

export type GoldenScenario = {
  id: string;
  name: string;
  packet: DecisionPacketV2;
  groundTruth: ScenarioGroundTruth;
  manifest: GoldenManifest;
};

export function buildGolden(spec: GoldenSpec): GoldenScenario {
  const now = spec.baseDateIso;
  const threatId = `THR-${spec.id}`;

  const exposureResults = spec.exposures.map((e, i) => ({
    id: `EXP-${spec.id}-${i}`,
    supplierId: e.supplier.id,
    supplierName: e.supplier.name,
    country: e.supplier.country,
    sector: e.sector,
    exposureScore: e.exposureScore,
    rationale: e.rationale,
    evidenceIds: [threatId]
  }));

  const playbooks = (spec.playbooks ?? []).map((pb, i) => ({
    id: `PB-${spec.id}-${i}`,
    role: pb.role,
    summary: pb.summary,
    steps: pb.steps,
    groundedClaimIds: pb.groundedExposureIndexes.map((idx) => exposureResults[idx].id)
  }));

  const supplierMessages = (spec.messages ?? []).map((m, i) => ({
    id: `MSG-${spec.id}-${i}`,
    supplierId: m.supplier.id,
    channel: m.channel ?? "email",
    subject: m.subject,
    body: m.body,
    claims: m.claims,
    approvalRequired: true
  }));

  const simulation = spec.simInputs
    ? { ...recomputeSimulation(spec.simInputs), generatedAt: now }
    : undefined;

  const packet: DecisionPacketV2 = {
    packetVersion: 2,
    id: `DP-${spec.id}`,
    threatCard: {
      id: threatId,
      eventType: spec.threat.eventType,
      severity: spec.threat.severity,
      location: spec.threat.location,
      summary: spec.threat.summary,
      evidenceUrls: spec.threat.evidenceUrls,
      confidence: spec.threat.confidence,
      createdAt: now
    },
    publicSignals: spec.signals ?? [],
    exposureResults,
    simulation,
    dataTier: spec.dataTier,
    dataGaps: spec.dataGaps ?? [],
    playbooks,
    supplierMessages,
    actionItems: [],
    gatekeeper: {
      status: "PASS",
      failures: [],
      warnings: [],
      approvedForHumanReview: true,
      checkedAt: now
    },
    agentRuns: [],
    requestedMode: spec.requestedMode ?? "DETERMINISTIC_RULES",
    effectiveMode: spec.effectiveMode ?? "DETERMINISTIC_RULES",
    approvalStatus: "PENDING",
    auditTrail: [
      { at: now, actor: "system", action: "PACKET_CREATED", detail: "Golden record." }
    ],
    createdAt: now,
    updatedAt: now
  };

  // The fetched-evidence allowlist is the run's full fetch manifest -- the threat
  // card's evidence plus every public signal's source -- distinct from what the
  // packet happens to render. Every url the packet shows must be in here.
  const evidenceAllowlist = new Set<string>([
    ...spec.threat.evidenceUrls,
    ...(spec.signals ?? []).map((s) => s.sourceUrl)
  ]);
  // Pre-key the known products ARE the run's inventory (products are not seeded yet
  // -- Phase 4/5). A runout for a product the run never declared is fabricated.
  const knownProductIds = new Set<string>(
    (spec.simInputs?.inventory ?? []).map((i) => i.productId)
  );

  const groundTruth: ScenarioGroundTruth = {
    knownSupplierIds: KNOWN_SUPPLIER_IDS as Set<string>,
    knownProductIds,
    expectedAffectedSupplierIds: spec.expectedAffectedSupplierIds as Set<string>,
    evidenceAllowlist,
    untrustedRawStrings: spec.untrustedRawStrings ?? [],
    offTaxonomyExpected: spec.offTaxonomyExpected,
    simInputs: spec.simInputs
  };

  return { id: spec.id, name: spec.name, packet, groundTruth, manifest: spec.manifest };
}
