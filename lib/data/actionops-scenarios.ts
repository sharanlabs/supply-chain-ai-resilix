import type { DataTier, PublicSignal, RequestedMode, ThreatCard } from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Production ActionOps scenario inputs (the live pipeline's parameters). These
// are DELIBERATELY independent of the frozen golden records in evals/golden/* --
// the golden records are the test oracle, and an oracle that imported the thing
// it grades would be circular. So a scenario here mirrors the shape of a golden
// spec but is its own source of truth; the golden test grades a frozen snapshot,
// the live pipeline produces from these.
//
// Seven scenarios (eight records) ship end-to-end: the six disruption-coverage scenarios
// (the zero-exposure + off-taxonomy controls are the two halves of scenario 6) PLUS the
// thin-evidence refusal control (scenario 7), which proves the NO_ACTION path. Supplier
// ids are NOT hard-coded --
// a scenario declares a MATCH RULE (country / sector / region / risk-tier filter)
// that Atlas applies to the real ingested seed, so a scenario can never reference an
// id the pipeline could not produce.
//
// Each scenario also carries its own REPLAY SIGNALS: dated, synthetic, CACHED public
// signals whose prose describes THIS scenario's disruption. They are the input the
// live Sentinel classifies, so the live threat matches the scenario (a generic signal
// board would let the Sentinel classify some other event). The signals are illustrative
// demo data -- never real measurements -- captured at a fixed instant for deterministic
// replay. Their sourceUrls are the scenario's evidence allowlist.
// ---------------------------------------------------------------------------

// The deterministic exposure-match rule. A supplier matches when it satisfies every
// present constraint (absent constraints are "any"). The real scoring model lives in
// Atlas; this rule only selects WHO is in scope.
export type ScenarioMatch = {
  // ISO-3166 alpha-2 codes; e.g. Hormuz = the Gulf origins SA/AE/QA/KW.
  countries?: string[];
  // SectorSchema members; omitted means "any sector".
  sectors?: string[];
  // Seed `region` values (e.g. "Texas Gulf Coast"). ANDed with the others. Lets a
  // single-source scenario (a hurricane on one Gulf-Coast plant) select its supplier
  // declaratively, without pinning an id the seed might re-hash.
  regions?: string[];
  // SeveritySchema risk-tier values (CRITICAL/HIGH/MEDIUM/LOW), ANDed with the others.
  // Used to narrow a scenario to a critical-tier supplier (e.g. a named bankruptcy).
  riskTiers?: string[];
};

// Simulation PARAMETERS (not the resolved SimInputs). The Simulator combines these
// with the matched supplier ids at run time to build the SimInputs the arithmetic runs
// on -- so, again, no supplier id is pinned here. Present only when the scenario has
// inventory data (SEEDED / Tier-2); absent => Tier-1, no runway, and a dataGaps note.
export type ScenarioSimParams = {
  durationDays: number;
  horizonDays: number[];
  // Per affected supplier; the Simulator fans this across the matched set.
  dailyRevenueUsdPerSupplier: number;
  inventory: { productId: string; onHandUnits: number; dailyUseUnits: number }[];
  // P1 margin-at-risk: the contribution-margin fraction (0..1) for the affected lines.
  // Finance decides on contribution, not gross revenue, so each scenario declares the
  // margin the Simulator applies to revenue-at-risk. Illustrative, modeled per sector.
  marginPct: number;
};

export type ActionOpsScenario = {
  id: string;
  name: string;
  // The threat the DETERMINISTIC fallback emits, and (key-OFF) what renders. The live
  // Sentinel re-derives the threat from replaySignals; these fields shape a ThreatCard.
  threat: {
    eventType: string;
    severity: ThreatCard["severity"];
    location: ThreatCard["location"];
    summary: string;
    evidenceUrls: string[];
    confidence: number;
  };
  match: ScenarioMatch;
  // The dated, synthetic, CACHED signals the live Sentinel classifies for this scenario
  // (the replay input). Their sourceUrls are the run's fetched-evidence allowlist.
  replaySignals: PublicSignal[];
  simulation?: ScenarioSimParams;
  dataTier: DataTier;
  // Extra human-readable gaps appended to whatever the Simulator records.
  dataGaps?: string[];
  // When the event is outside the closed vocabulary, every matched exposure is held as
  // OTHER_UNMAPPED rather than force-fit to a named sector.
  offTaxonomy?: boolean;
  // A replay-only scenario records REPLAY rather than DETERMINISTIC_RULES.
  requestedMode?: RequestedMode;
};

// Fixed capture instant for every replay signal -- makes freshness deterministic and
// labels the board honestly as a dated replay, never live.
const REPLAY_CAPTURE_ISO = "2026-06-17T12:00:00.000Z";

// Build a CACHED replay signal with the common fields filled. summary is the prose the
// live Sentinel reads to classify; sourceUrl is a real source on the scenario's allowlist.
function replaySignal(s: {
  id: string;
  source: string;
  sourceUrl: string;
  eventType: string;
  severity: ThreatCard["severity"];
  summary: string;
  location?: PublicSignal["location"];
}): PublicSignal {
  return {
    id: s.id,
    source: s.source,
    sourceUrl: s.sourceUrl,
    fetchedAt: REPLAY_CAPTURE_ISO,
    eventType: s.eventType,
    location: s.location ?? {},
    severity: s.severity,
    summary: s.summary,
    freshnessMinutes: 0,
    status: "CACHED"
  };
}

// --- 1. Hormuz chokepoint closure (flagship, SEEDED + simulation) -----------
// Match = the Gulf origins; in the seed every Gulf supplier is ENERGY or CHEMICALS by
// design (P2.6's backward-from-scenario construction), so the country filter alone yields
// exactly the nine the Strait of Hormuz should touch -- the joint cell the demo rests on.
const HORMUZ_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=Strait+of+Hormuz&mode=artlist&format=json";
const HORMUZ_EIA_URL = "https://www.eia.gov/todayinenergy/detail.php?id=hormuz";
const HORMUZ_REUTERS_URL = "https://www.reuters.com/markets/commodities/hormuz-transit-risk";

export const HORMUZ_SCENARIO: ActionOpsScenario = {
  id: "SCN-HORMUZ",
  name: "Hormuz chokepoint closure",
  threat: {
    eventType: "CHOKEPOINT_CLOSURE",
    severity: "HIGH",
    location: { region: "Persian Gulf", country: "OM", chokepoint: "Strait of Hormuz" },
    summary:
      "Transit through the Strait of Hormuz is disrupted, raising lead-time and war-risk surcharge exposure across Gulf-routed inbound. Insurers have repriced the lane and a partial closure window is in effect.",
    evidenceUrls: [HORMUZ_GDELT_URL, HORMUZ_EIA_URL, HORMUZ_REUTERS_URL],
    confidence: 0.82
  },
  match: { countries: ["SA", "AE", "QA", "KW"] },
  replaySignals: [
    replaySignal({
      id: "SIG-HORMUZ-GDELT",
      source: "GDELT DOC 2.0",
      sourceUrl: HORMUZ_GDELT_URL,
      eventType: "MARITIME_SECURITY",
      severity: "HIGH",
      summary:
        "Multiple wire reports describe transit through the Strait of Hormuz disrupted after a maritime security incident; several tankers are holding or rerouting and war-risk insurance premiums on Gulf-routed cargo have jumped sharply.",
      location: { region: "Persian Gulf", country: "OM" }
    }),
    replaySignal({
      id: "SIG-HORMUZ-EIA",
      source: "EIA Today in Energy",
      sourceUrl: HORMUZ_EIA_URL,
      eventType: "ENERGY_FLOWS",
      severity: "HIGH",
      summary:
        "EIA notes a large share of seaborne crude and LNG transits the Strait of Hormuz; a sustained closure would force long reroutes and lengthen lead times for Gulf-origin energy and chemical inbound.",
      location: { region: "Persian Gulf" }
    }),
    replaySignal({
      id: "SIG-HORMUZ-REUTERS",
      source: "Reuters (via GDELT)",
      sourceUrl: HORMUZ_REUTERS_URL,
      eventType: "MARITIME_SECURITY",
      severity: "MEDIUM",
      summary:
        "Shipping desks report a partial closure window at the Strait of Hormuz with carriers pausing bookings on the Gulf lane pending a security review.",
      location: { region: "Persian Gulf", country: "AE" }
    })
  ],
  simulation: {
    durationDays: 30,
    horizonDays: [7, 30, 90],
    dailyRevenueUsdPerSupplier: 10_000,
    inventory: [{ productId: "PROD-GULF-CHEM", onHandUnits: 1_000, dailyUseUnits: 40 }],
    // Gulf petrochemical inputs run a thinner contribution margin (commodity-ish).
    marginPct: 0.34
  },
  dataTier: "SEEDED"
};

// --- 2. Tariff-deadline countdown (Tier-1, no simulation) -------------------
const TARIFF_USTR_URL = "https://ustr.gov/tariff-actions";
const TARIFF_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=section+301+tariff+semiconductors&mode=artlist&format=json";

const TARIFF_SCENARIO: ActionOpsScenario = {
  id: "SCN-TARIFF",
  name: "Tariff-deadline countdown",
  threat: {
    eventType: "TARIFF_DEADLINE",
    severity: "MEDIUM",
    location: { country: "CN" },
    summary:
      "A tariff action with a fixed effective date raises landed-cost risk for China-origin semiconductor and electronics inbound. A countdown to the effective date is in effect.",
    evidenceUrls: [TARIFF_USTR_URL, TARIFF_GDELT_URL],
    confidence: 0.7
  },
  match: { countries: ["CN"], sectors: ["SEMICONDUCTORS", "ELECTRONICS"] },
  replaySignals: [
    replaySignal({
      id: "SIG-TARIFF-USTR",
      source: "USTR",
      sourceUrl: TARIFF_USTR_URL,
      eventType: "TRADE_POLICY",
      severity: "MEDIUM",
      summary:
        "USTR announces additional Section 301 tariffs on listed China-origin semiconductor and electronics HS codes, effective on a fixed date; importers face a countdown after which landed cost rises.",
      location: { country: "CN" }
    }),
    replaySignal({
      id: "SIG-TARIFF-GDELT",
      source: "GDELT DOC 2.0",
      sourceUrl: TARIFF_GDELT_URL,
      eventType: "TRADE_POLICY",
      severity: "MEDIUM",
      summary:
        "Trade-press coverage warns buyers sourcing China-origin chips and electronics to confirm pre-deadline shipments or qualify alternate-origin supply before the tariff effective date.",
      location: { country: "CN" }
    })
  ],
  dataGaps: ["Tier-1 upload: no inventory columns provided, so runway is not simulated."],
  dataTier: "TIER_1"
};

// --- 3. Red Sea / Suez diversion persistence (SEEDED + simulation) ----------
const REDSEA_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=Red+Sea+diversion+Suez&mode=artlist&format=json";
const REDSEA_LLOYDS_URL = "https://www.lloydslist.com/red-sea-diversions";

const REDSEA_SCENARIO: ActionOpsScenario = {
  id: "SCN-REDSEA",
  name: "Red Sea / Suez diversion persistence",
  threat: {
    eventType: "ROUTE_DIVERSION",
    severity: "MEDIUM",
    // Region/country-matched (no strict chokepoint): a Red Sea diversion is named variably
    // ("Red Sea" / "Suez Canal" / "Bab-el-Mandeb"), and Atlas matches by country (IN), so a
    // strict chokepoint would only false-reject a correctly-classified-but-differently-named
    // live threat. The route-diversion summary still names the lane.
    location: { region: "Red Sea", country: "IN" },
    summary:
      "Sustained Red Sea diversions keep carriers routing around the Cape of Good Hope instead of transiting Suez, adding transit days to India-origin Europe- and US-East-bound inbound and compounding lead times.",
    evidenceUrls: [REDSEA_GDELT_URL, REDSEA_LLOYDS_URL],
    confidence: 0.68
  },
  match: { countries: ["IN"] },
  replaySignals: [
    replaySignal({
      id: "SIG-REDSEA-GDELT",
      source: "GDELT DOC 2.0",
      sourceUrl: REDSEA_GDELT_URL,
      eventType: "SHIPPING_DIVERSION",
      severity: "MEDIUM",
      summary:
        "Security risk in the Red Sea persists; major container lines continue diverting around the Cape of Good Hope rather than transiting the Suez Canal, adding well over a week of transit to Asia-Europe and India-origin lanes.",
      location: { region: "Red Sea" }
    }),
    replaySignal({
      id: "SIG-REDSEA-LLOYDS",
      source: "Lloyd's List (via GDELT)",
      sourceUrl: REDSEA_LLOYDS_URL,
      eventType: "SHIPPING_DIVERSION",
      severity: "MEDIUM",
      summary:
        "Carriers signal the Suez diversion will persist; shippers are advised to rebuild buffer stock and re-time India-origin orders for the longer Cape routing.",
      location: { region: "Red Sea", country: "IN" }
    })
  ],
  simulation: {
    durationDays: 60,
    horizonDays: [7, 30, 90],
    dailyRevenueUsdPerSupplier: 8_000,
    inventory: [{ productId: "PROD-IN-PHARMA", onHandUnits: 900, dailyUseUnits: 30 }],
    // Pharma inputs carry a higher contribution margin than commodity chemicals.
    marginPct: 0.42
  },
  dataTier: "SEEDED"
};

// --- 4. Hurricane strike on a single-source plant (replay-only, SEEDED) -----
// region + sector select exactly one seed supplier (the Texas Gulf-Coast ENERGY plant),
// modelling a single-source dependency with no qualified backup.
const HURRICANE_NWS_URL = "https://api.weather.gov/alerts/active?area=TX";

const HURRICANE_SCENARIO: ActionOpsScenario = {
  id: "SCN-HURRICANE",
  name: "Hurricane strike on a single-source plant (replay)",
  threat: {
    eventType: "NATURAL_DISASTER",
    severity: "HIGH",
    location: { region: "US Gulf Coast", country: "US" },
    summary:
      "A hurricane making landfall on the Texas Gulf Coast threatens a single-source plant with no qualified backup supplier in the current dataset.",
    evidenceUrls: [HURRICANE_NWS_URL],
    confidence: 0.75
  },
  match: { regions: ["Texas Gulf Coast"], sectors: ["ENERGY"] },
  replaySignals: [
    replaySignal({
      id: "SIG-HURRICANE-NWS",
      source: "National Weather Service",
      sourceUrl: HURRICANE_NWS_URL,
      eventType: "HURRICANE_WARNING",
      severity: "HIGH",
      summary:
        "NWS issues a hurricane warning for the Texas Gulf Coast with landfall expected near a major petrochemical corridor; plant operations and inbound logistics in the area are at risk.",
      location: { region: "US Gulf Coast", country: "US" }
    })
  ],
  simulation: {
    durationDays: 14,
    horizonDays: [7, 30],
    dailyRevenueUsdPerSupplier: 25_000,
    inventory: [{ productId: "PROD-SINGLE-SOURCE", onHandUnits: 300, dailyUseUnits: 30 }],
    // A specialty single-source part commands the richest contribution margin.
    marginPct: 0.46
  },
  dataGaps: ["Single-source plant: no qualified backup supplier in the current dataset."],
  dataTier: "SEEDED",
  requestedMode: "REPLAY"
};

// --- 5. Supplier bankruptcy with sudden liquidation (Tier-1) ----------------
// country + sector + risk tier select exactly one seed supplier (the critical-tier
// Maharashtra pharmaceutical supplier), modelling a named insolvency.
const BANKRUPTCY_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=supplier+liquidation+insolvency&mode=artlist&format=json";

const BANKRUPTCY_SCENARIO: ActionOpsScenario = {
  id: "SCN-BANKRUPTCY",
  name: "Supplier bankruptcy with sudden liquidation",
  threat: {
    eventType: "SUPPLIER_BANKRUPTCY",
    severity: "HIGH",
    location: { country: "IN", region: "Maharashtra" },
    summary:
      "A news-derived signal indicates sudden liquidation at a critical-tier pharmaceutical supplier, threatening continuity of supply for dependent buyers.",
    evidenceUrls: [BANKRUPTCY_GDELT_URL],
    confidence: 0.66
  },
  match: { countries: ["IN"], sectors: ["PHARMACEUTICALS"], riskTiers: ["CRITICAL"] },
  replaySignals: [
    replaySignal({
      id: "SIG-BANKRUPTCY-GDELT",
      source: "GDELT DOC 2.0",
      sourceUrl: BANKRUPTCY_GDELT_URL,
      eventType: "FINANCIAL_DISTRESS",
      severity: "HIGH",
      summary:
        "News wires report a critical-tier pharmaceutical supplier in Maharashtra, India has entered sudden liquidation proceedings; dependent buyers face an abrupt continuity-of-supply risk and should confirm open orders.",
      location: { country: "IN", region: "Maharashtra" }
    })
  ],
  dataGaps: ["Tier-1 upload: no inventory columns provided, so runway is not simulated."],
  dataTier: "TIER_1"
};

// --- 6a. Zero-exposure hallucination control --------------------------------
// A valid, well-formed event that matches NO supplier in the dataset (PE has none) ->
// Atlas returns zero exposures and a "no direct exposure" data gap, never an invented match.
const ZERO_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=Callao+port+strike&mode=artlist&format=json";

const ZERO_EXPOSURE_SCENARIO: ActionOpsScenario = {
  id: "SCN-ZERO-EXPOSURE",
  name: "Zero-exposure control (valid taxonomy, no match)",
  threat: {
    eventType: "PORT_DISRUPTION",
    severity: "MEDIUM",
    location: { region: "South America Pacific", country: "PE" },
    summary:
      "A port labour strike at Callao, Peru is a valid, well-formed event that matches no supplier in the current dataset.",
    evidenceUrls: [ZERO_GDELT_URL],
    confidence: 0.6
  },
  match: { countries: ["PE"] },
  replaySignals: [
    replaySignal({
      id: "SIG-ZERO-GDELT",
      source: "GDELT DOC 2.0",
      sourceUrl: ZERO_GDELT_URL,
      eventType: "PORT_LABOR",
      severity: "MEDIUM",
      summary:
        "A port labour strike at Callao, Peru halts container operations at the terminal; the action is well-formed but affects a region with no suppliers in this dataset.",
      location: { region: "South America Pacific", country: "PE" }
    })
  ],
  dataGaps: [
    "No direct exposure: the event location and lanes match no supplier in the current dataset."
  ],
  dataTier: "TIER_1"
};

// --- 6b. Off-taxonomy control (OTHER_UNMAPPED, never force-fit) --------------
// The event type is OUTSIDE the closed vocabulary, so the live Sentinel maps it to
// OTHER_UNMAPPED and Atlas (offTaxonomy) holds every matched exposure as OTHER_UNMAPPED
// rather than force-fitting a named sector. Matches a grid-exposed regional cluster.
const OFFTAX_SWPC_URL = "https://www.swpc.noaa.gov/products/geomagnetic-storm";

const OFF_TAXONOMY_SCENARIO: ActionOpsScenario = {
  id: "SCN-OFF-TAXONOMY",
  name: "Off-taxonomy control (OTHER_UNMAPPED)",
  threat: {
    eventType: "SOLAR_FLARE_GRID_EVENT",
    severity: "MEDIUM",
    location: { region: "Global" },
    summary:
      "A severe geomagnetic / solar-flare grid event is outside the closed event vocabulary; affected suppliers are classified OTHER_UNMAPPED pending taxonomy review, never force-fit to a named type.",
    evidenceUrls: [OFFTAX_SWPC_URL],
    confidence: 0.5
  },
  match: { regions: ["Arizona Sun Corridor"] },
  offTaxonomy: true,
  replaySignals: [
    replaySignal({
      id: "SIG-OFFTAX-SWPC",
      source: "NOAA SWPC",
      sourceUrl: OFFTAX_SWPC_URL,
      eventType: "SPACE_WEATHER",
      severity: "MEDIUM",
      summary:
        "NOAA issues a severe geomagnetic storm watch after a strong solar flare and coronal mass ejection; power grids and satellite operations could be stressed -- an event outside the standard supply-chain disruption taxonomy.",
      location: { region: "Global" }
    })
  ],
  dataGaps: [
    "Event type is outside the closed event vocabulary; matched suppliers are classified OTHER_UNMAPPED pending taxonomy review."
  ],
  dataTier: "TIER_1"
};

// --- 7. Thin-evidence refusal control (single UNVERIFIED, low-confidence source) -------
// The accountability differentiator made runnable: a real, mapped, actionable disruption
// (US logistics) reported by ONE unverified, low-confidence source. corroborated is false
// (a single source) AND confidence is in the "low" band (< the action floor) AND a real
// sector is exposed -> the pipeline emits recommendation NO_ACTION, WITHHOLDS the playbooks
// + drafted messages, and states what evidence is missing (decideRecommendation). Distinct
// from the zero-exposure control (no exposure at all) and the off-taxonomy control
// (OTHER_UNMAPPED): here there IS an actionable exposure, we just refuse to act on a lone
// unverified source. The signal is written OVERTLY unverified so the LIVE Sentinel also
// reads it low-confidence -- the live leg confirms what the deterministic leg (hardcoded
// 0.35 confidence) guarantees. This is the demo's "Run B" (refuses).
const THIN_EVIDENCE_GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=west+coast+port+shutdown+rumor&mode=artlist&format=json";

const THIN_EVIDENCE_SCENARIO: ActionOpsScenario = {
  id: "SCN-THIN-EVIDENCE",
  name: "Thin-evidence refusal control (single unverified source)",
  threat: {
    eventType: "PORT_DISRUPTION",
    severity: "MEDIUM",
    location: { region: "US West Coast", country: "US" },
    summary:
      "An unconfirmed report alleges a major US West Coast container port has abruptly halted operations. The claim is single-source and unverified; no official authority or second source has corroborated it.",
    evidenceUrls: [THIN_EVIDENCE_GDELT_URL],
    // Below the action confidence floor (the "low" band): a single unverified source is
    // too weak to draft outbound action on. Guarantees the deterministic refusal.
    confidence: 0.35
  },
  match: { countries: ["US"], sectors: ["LOGISTICS"] },
  replaySignals: [
    replaySignal({
      id: "SIG-THIN-EVIDENCE-GDELT",
      source: "GDELT DOC 2.0",
      sourceUrl: THIN_EVIDENCE_GDELT_URL,
      eventType: "PORT_RUMOR",
      severity: "MEDIUM",
      summary:
        "A single unconfirmed social-media post alleges a major US West Coast container port has abruptly halted all operations. There is no official Port Authority, US Coast Guard, or carrier confirmation and no corroborating wire report -- the claim is unverified and may be inaccurate.",
      location: { region: "US West Coast", country: "US" }
    })
  ],
  dataGaps: [
    "Single unverified source: the disruption is reported by one uncorroborated, low-confidence signal."
  ],
  dataTier: "TIER_1"
};

const SCENARIOS: Record<string, ActionOpsScenario> = {
  [HORMUZ_SCENARIO.id]: HORMUZ_SCENARIO,
  [TARIFF_SCENARIO.id]: TARIFF_SCENARIO,
  [REDSEA_SCENARIO.id]: REDSEA_SCENARIO,
  [HURRICANE_SCENARIO.id]: HURRICANE_SCENARIO,
  [BANKRUPTCY_SCENARIO.id]: BANKRUPTCY_SCENARIO,
  [ZERO_EXPOSURE_SCENARIO.id]: ZERO_EXPOSURE_SCENARIO,
  [OFF_TAXONOMY_SCENARIO.id]: OFF_TAXONOMY_SCENARIO,
  [THIN_EVIDENCE_SCENARIO.id]: THIN_EVIDENCE_SCENARIO
};

// The ordered scenario list (flagship first) -- the UI's scenario picker and any
// "run all" coverage check iterate this; the map above is the id lookup.
export const ACTIONOPS_SCENARIOS: readonly ActionOpsScenario[] = [
  HORMUZ_SCENARIO,
  TARIFF_SCENARIO,
  REDSEA_SCENARIO,
  HURRICANE_SCENARIO,
  BANKRUPTCY_SCENARIO,
  ZERO_EXPOSURE_SCENARIO,
  OFF_TAXONOMY_SCENARIO,
  THIN_EVIDENCE_SCENARIO
];

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
