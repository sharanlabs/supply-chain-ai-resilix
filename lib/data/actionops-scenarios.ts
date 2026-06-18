import type { DataTier, RequestedMode, ThreatCard } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Production ActionOps scenario inputs (the live pipeline's parameters). These
// are DELIBERATELY independent of the frozen golden records in evals/golden/* --
// the golden records are the test oracle, and an oracle that imported the thing
// it grades would be circular. So a scenario here mirrors the shape of a golden
// spec but is its own source of truth; the golden test grades a frozen snapshot,
// the live pipeline produces from these.
//
// D.1 ships the Hormuz flagship end-to-end. The ActionOpsScenario type is shaped
// so the other five scenarios slot in later (D.2 generalizes the exposure model
// and adds them). Supplier ids are NOT hard-coded -- a scenario declares a
// MATCH RULE (country / sector filter) that Atlas applies to the real ingested
// seed, so the scenario can never reference an id the pipeline could not produce.
// ---------------------------------------------------------------------------

// The deterministic exposure-match rule. D.1 uses it as the whole of Atlas's
// matching; D.2 keeps the match but replaces the placeholder scores with a real
// scoring model. A supplier matches when it satisfies every present constraint.
export type ScenarioMatch = {
  // ISO-3166 alpha-2 codes; e.g. Hormuz = the Gulf origins SA/AE/QA/KW.
  countries?: string[];
  // SectorSchema members; omitted means "any sector".
  sectors?: string[];
};

// Simulation PARAMETERS (not the resolved SimInputs). The Simulator combines
// these with the matched supplier ids at run time to build the SimInputs the
// arithmetic runs on -- so, again, no supplier id is pinned here. Present only
// when the scenario has inventory data (SEEDED / Tier-2); absent => Tier-1, no
// runway, and a dataGaps note saying why.
export type ScenarioSimParams = {
  durationDays: number;
  horizonDays: number[];
  // Per affected supplier; the Simulator fans this across the matched set.
  dailyRevenueUsdPerSupplier: number;
  inventory: { productId: string; onHandUnits: number; dailyUseUnits: number }[];
};

export type ActionOpsScenario = {
  id: string;
  name: string;
  // The threat the (deterministic, in D.1) Sentinel emits. D.5 will derive this
  // from raw signal text via the LLM classifier; the field shapes match ThreatCard.
  threat: {
    eventType: string;
    severity: ThreatCard["severity"];
    location: ThreatCard["location"];
    summary: string;
    evidenceUrls: string[];
    confidence: number;
  };
  match: ScenarioMatch;
  simulation?: ScenarioSimParams;
  dataTier: DataTier;
  // Extra human-readable gaps appended to whatever the Simulator records.
  dataGaps?: string[];
  // When the event is outside the closed vocabulary, every matched exposure is
  // held as OTHER_UNMAPPED rather than force-fit to a named sector.
  offTaxonomy?: boolean;
  // A replay-only scenario records REPLAY rather than DETERMINISTIC_RULES.
  requestedMode?: RequestedMode;
};

// GDELT + EIA are the recorded evidence backing the Hormuz demo; they are also
// the evidence-allowlist roots the gatekeeper/graders check rendered urls against.
const HORMUZ_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=Strait+of+Hormuz&mode=artlist&format=json";
const HORMUZ_EIA_URL = "https://www.eia.gov/todayinenergy/detail.php?id=hormuz";

// The flagship. Match = the Gulf origins; in the seed every Gulf supplier is
// ENERGY or CHEMICALS by design (P2.6's backward-from-scenario construction), so
// the country filter alone yields exactly the nine the Strait of Hormuz should
// touch -- the joint cell the demo rests on.
export const HORMUZ_SCENARIO: ActionOpsScenario = {
  id: "SCN-HORMUZ",
  name: "Hormuz chokepoint closure",
  threat: {
    eventType: "CHOKEPOINT_CLOSURE",
    severity: "HIGH",
    location: { region: "Persian Gulf", country: "OM", chokepoint: "Strait of Hormuz" },
    summary:
      "Transit through the Strait of Hormuz is disrupted, raising lead-time and war-risk surcharge exposure across Gulf-routed inbound. Insurers have repriced the lane and a partial closure window is in effect.",
    evidenceUrls: [HORMUZ_GDELT_URL, HORMUZ_EIA_URL],
    confidence: 0.82
  },
  match: { countries: ["SA", "AE", "QA", "KW"] },
  simulation: {
    durationDays: 30,
    horizonDays: [7, 30, 90],
    dailyRevenueUsdPerSupplier: 10_000,
    inventory: [{ productId: "PROD-GULF-CHEM", onHandUnits: 1_000, dailyUseUnits: 40 }]
  },
  dataTier: "SEEDED"
};

const SCENARIOS: Record<string, ActionOpsScenario> = {
  [HORMUZ_SCENARIO.id]: HORMUZ_SCENARIO
};

export const DEFAULT_SCENARIO_ID = HORMUZ_SCENARIO.id;

// Fail loud on an unknown id rather than silently running the default -- a typo'd
// scenario id is a defect, not a request for Hormuz.
export function getActionOpsScenario(id: string = DEFAULT_SCENARIO_ID): ActionOpsScenario {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    throw new Error(
      `Unknown ActionOps scenario ${id}. Known: ${Object.keys(SCENARIOS).join(", ")}`
    );
  }
  return scenario;
}

// Non-throwing existence check for the API boundary: an unknown scenario id from a
// client is a 400 (bad request), not a 500 (server fault). getActionOpsScenario
// stays fail-loud for internal callers that should never pass an unknown id.
export function hasActionOpsScenario(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCENARIOS, id);
}
