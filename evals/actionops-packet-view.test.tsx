// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActionOpsPacketView } from "@/components/actionops-dashboard";
import type { AgentRun, RecoveryOption } from "@/lib/schemas";
import { makeV2Packet } from "./fixtures/decision-packet-v2";

// A minimal valid AgentRun for the deliberation-trail render tests. Defaults to a
// deterministic step; override mode/model/validationStatus/summary per case.
function makeRun(partial: Partial<AgentRun> & { agentName: string }): AgentRun {
  return {
    id: `RUN-${partial.agentName.toUpperCase()}`,
    model: "deterministic-rules",
    mode: "DETERMINISTIC_RULES",
    latencyMs: 0,
    tokenEstimate: 10,
    inputHash: "aaaaaaaa",
    outputHash: "bbbbbbbb",
    validationStatus: "PASS",
    summary: `${partial.agentName} ran.`,
    createdAt: "2026-06-13T12:00:00.000Z",
    ...partial
  };
}

// The full ordered chain a live ActionOps run emits (the Skeptic sits between the
// deterministic findings and the LLM responders). A Groq model on the Skeptic marks the
// genuine cross-family challenge (distinct from the deterministic affirmative placeholder).
const SEVEN_RUN_CHAIN: AgentRun[] = [
  makeRun({
    agentName: "Sentinel",
    model: "gemini-2.5-flash",
    mode: "LIVE_AI",
    summary: "Classified threat CHOKEPOINT_CLOSURE at CRITICAL severity."
  }),
  makeRun({ agentName: "Verifier", summary: "3 source(s); corroboration met." }),
  makeRun({ agentName: "Atlas", summary: "9 supplier(s) matched and scored." }),
  makeRun({ agentName: "Simulator", summary: "Projected 3 revenue horizon(s)." }),
  makeRun({
    agentName: "Skeptic",
    model: "groq/llama-4-maverick",
    mode: "LIVE_AI",
    summary: "Accepted: the cross-family critic stands behind acting on this finding."
  }),
  makeRun({
    agentName: "Strategist",
    model: "gemini-2.5-flash",
    mode: "LIVE_AI",
    summary: "3 playbook(s) grounded in 9 exposure claim(s)."
  }),
  makeRun({
    agentName: "Dispatcher",
    model: "gemini-2.5-flash",
    mode: "LIVE_AI",
    summary: "5 draft(s) queued for approval."
  })
];

const RECOVERY_OPTIONS: RecoveryOption[] = [
  {
    id: "REC-EXPEDITE",
    title: "Expedite inbound on the most exposed lanes",
    actionType: "EXPEDITE",
    summary: "Move the most exposed inbound to priority freight.",
    estimatedCostUsd: 67_500,
    speedGainDays: 24,
    riskReductionPct: 50,
    confidence: "HIGH",
    reversibility: "HIGH",
    score: 67,
    evidenceIds: ["EXP-001"],
    approvalRequired: true
  },
  {
    id: "REC-ESCALATE",
    title: "Escalate allocation with the single-source suppliers",
    actionType: "SUPPLIER_ESCALATION",
    summary: "Escalate to secure allocation from the single-source suppliers.",
    estimatedCostUsd: 22_500,
    speedGainDays: 12,
    riskReductionPct: 30,
    confidence: "LOW",
    reversibility: "LOW",
    score: 29,
    evidenceIds: ["EXP-001"],
    approvalRequired: true
  }
];

// Fixture-based render test for the V2 (ActionOps) view. The live pipeline does
// not emit V2 yet, so this is the only place the V2 branch is exercised -- it
// proves the version-aware UI seam renders the plan-locked fields (not a stub),
// without driving the whole app (no e2e).
describe("ActionOpsPacketView (V2 render)", () => {
  it("renders the plan-locked ActionOps sections", () => {
    render(<ActionOpsPacketView packet={makeV2Packet()} />);

    // Threat card. The raw eventType enum (CHOKEPOINT_CLOSURE) and the dataTier
    // token (SEEDED) were removed from the glass in the calm-command-center
    // relanguage -- they are builder machinery a procurement lead does not read.
    // The human threat headline carries the meaning instead.
    expect(screen.getByText(/Hormuz transit disruption/)).toBeInTheDocument();
    // Regression guard: the stripped builder machinery must NOT render on the
    // default view -- assert ABSENCE, so a future re-leak fails loud (the raw
    // eventType enum, the dataTier token, and the raw run-mode enum).
    expect(screen.queryByText("CHOKEPOINT_CLOSURE")).not.toBeInTheDocument();
    expect(screen.queryByText("SEEDED")).not.toBeInTheDocument();
    expect(screen.queryByText("REPLAY")).not.toBeInTheDocument();
    // Exposure -- the supplier name now reads in BOTH the exposure table and the
    // draft card header (the card shows the human name, no longer the raw ID).
    expect(
      screen.getAllByText("Gulf Components Ltd").length
    ).toBeGreaterThan(0);
    // Runway simulation horizon (revenue-at-risk formatted).
    expect(screen.getByText("7-day")).toBeInTheDocument();
    // Supplier draft + its claim sourcePath, and the never-sends guard. The
    // re-sequenced "drafted response" section states the guard in plain prose
    // ("nothing leaves the building until a person sends them") -- assert that
    // honest never-sends promise is present, not the old kicker wording.
    expect(
      screen.getByText(/nothing leaves the building until a person sends/i)
    ).toBeInTheDocument();
    // The plain-English provenance leads on the glass; the exact machine path is
    // tucked behind a per-claim "trace" disclosure (drill-down), so a procurement
    // lead never reads a dotted code path by default -- assert BOTH: the human
    // phrase is present, and the raw path lives inside a <details>.
    expect(
      screen.getAllByText(/from the runway simulation/i).length
    ).toBeGreaterThan(0);
    const tracePath = screen.getByText(
      /simulation\.horizons\[0\]\.revenueAtRiskUsd/
    );
    const traceDetails = tracePath.closest("details");
    expect(traceDetails).toBeInTheDocument();
    // The disclosure is CLOSED by default -- the raw path is drill-down, never on
    // the default glass (a stray `open` would re-leak it).
    expect(traceDetails).not.toHaveAttribute("open");
    // Action item (now under the collapsed "working detail" disclosure, but
    // still rendered in the DOM, so getByText resolves it).
    expect(screen.getByText("Confirm backup supplier capacity")).toBeInTheDocument();
  });

  it("drives each exposure bar from the row's ACTUAL risk tier, not a flat color", () => {
    // The marquee MUST-FIX (M1): the WHO-IS-HIT exposure bars must read as a true
    // heat ramp -- a CRITICAL row red, a LOW row blue -- driven by the tier parsed
    // from the rationale, NOT hardcoded to one severity. Two rows of different
    // tiers must therefore carry different data-sev on their .runway-fill.
    render(
      <ActionOpsPacketView
        packet={makeV2Packet({
          exposureResults: [
            {
              id: "EXP-CRIT",
              supplierId: "SUP-CRIT",
              supplierName: "Gulf Critical Components",
              country: "AE",
              sector: "ELECTRONICS",
              exposureScore: 84,
              rationale: "CRITICAL risk tier; 49-day lead time.",
              evidenceIds: ["THREAT-001"]
            },
            {
              id: "EXP-LOW",
              supplierId: "SUP-LOW",
              supplierName: "Coastal Low-Exposure Parts",
              country: "OM",
              sector: "ELECTRONICS",
              exposureScore: 22,
              rationale: "LOW risk tier; 31-day lead time.",
              evidenceIds: ["THREAT-001"]
            }
          ]
        })}
      />
    );

    // Scope STRICTLY to the WHO-IS-HIT section -- the runway-horizons section also
    // renders .runway-fill (and already emits critical/high), so a global query
    // would false-pass even if the exposure bars were broken. The section's
    // aria-labelledby="exp-h" ("Who is hit") gives it that accessible name.
    const exposure = screen.getByRole("region", { name: /who is hit/i });
    const bars = within(exposure)
      .getAllByText((_, el) => el?.classList.contains("runway-fill") ?? false)
      .map((el) => el.getAttribute("data-sev"));
    expect(bars).toContain("critical");
    expect(bars).toContain("low");
    // The two rows must NOT render the same severity (the old `sev="high"` bug).
    expect(new Set(bars).size).toBeGreaterThan(1);
  });

  it("states the runway plateau honestly when revenue at risk saturates", () => {
    // M3: when exposure saturates (revenueAtRisk = min(H, durationDays)), the later
    // horizon holds flat at the peak -- two equal adjacent bars are correct data,
    // not a render bug. The copy must say so ("then holds" + "Saturated"), never
    // claim it "climbs across the window".
    render(
      <ActionOpsPacketView
        packet={makeV2Packet({
          simulation: {
            horizons: [
              { days: 7, revenueAtRiskUsd: 1_000_000 },
              { days: 30, revenueAtRiskUsd: 2_700_000 },
              { days: 90, revenueAtRiskUsd: 2_700_000 }
            ],
            productRunouts: [{ productId: "PROD-1", runoutDate: "2026-07-01" }],
            generatedAt: "2026-06-13T12:00:00.000Z"
          }
        })}
      />
    );

    expect(screen.getByText(/then holds/i)).toBeInTheDocument();
    expect(screen.getByText(/full exposure reached by day 30/i)).toBeInTheDocument();
    // The misleading "climbs across the window" lede must NOT appear on a plateau.
    expect(screen.queryByText(/climbs across the window/i)).not.toBeInTheDocument();
  });

  it("shows the data-gaps note instead of a simulation on a Tier-1 packet", () => {
    const base = makeV2Packet({
      dataTier: "TIER_1",
      dataGaps: ["No runway: Tier-1 upload has no inventory columns."]
    });
    // A Tier-1-only packet has no simulation section.
    const { simulation: _simulation, ...tier1 } = base;
    void _simulation;
    render(<ActionOpsPacketView packet={tier1} />);

    expect(
      screen.getByText(/No runway: Tier-1 upload has no inventory columns\./)
    ).toBeInTheDocument();
    // The seeded revenue-at-risk horizon must not appear.
    expect(screen.queryByText("7-day")).not.toBeInTheDocument();
  });

  it("renders the degraded badge only when a live AI attempt failed", () => {
    const { rerender } = render(
      <ActionOpsPacketView packet={makeV2Packet()} />
    );
    expect(screen.queryByText(/Degraded/)).not.toBeInTheDocument();

    rerender(
      <ActionOpsPacketView
        packet={makeV2Packet({ effectiveMode: "FAILED_TO_FALLBACK" })}
      />
    );
    // "Live feed down" now reads consistently in BOTH the approve-rail badge and
    // the humanized audit-footer mode chip -- so assert at least one, not exactly
    // one (the old raw "FAILED_TO_FALLBACK" enum is gone from the glass; it lives
    // only in the chip's title attribute now).
    expect(
      screen.getAllByText(/Live feed down/).length
    ).toBeGreaterThan(0);
  });

  it("announces mode changes via a persistent live region (WCAG 2.2 SC 4.1.3)", () => {
    const { rerender } = render(<ActionOpsPacketView packet={makeV2Packet()} />);

    // Always mounted (a conditionally-mounted region never announces), with the
    // status role + polite setting; no degraded text on a healthy packet.
    const region = screen.getByTestId("mode-status");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).not.toHaveTextContent(/running on recorded data/i);

    // The SAME persistent node's text changes on a degraded rerender, so AT
    // announces it without moving focus.
    rerender(
      <ActionOpsPacketView
        packet={makeV2Packet({ effectiveMode: "FAILED_TO_FALLBACK" })}
      />
    );
    expect(screen.getByTestId("mode-status")).toHaveTextContent(
      /running on recorded data/i
    );
  });
});

// ===========================================================================
// Phase 6 -- the war-room deliberation UI: the multi-agent trajectory, the
// cross-family Skeptic's verdict, and the Phase-1 domain fields woven in. All
// additive-optional, so absence renders nothing (never a crash).
// ===========================================================================
describe("ActionOpsPacketView (Phase 6 deliberation surfaces)", () => {
  it("renders the ordered agent trail with honest, humanized run modes", () => {
    render(<ActionOpsPacketView packet={makeV2Packet({ agentRuns: SEVEN_RUN_CHAIN })} />);

    // The disclosure that holds the machinery (machinery off the default glass).
    expect(screen.getByText(/How this was reasoned/i)).toBeInTheDocument();
    // Every step in the chain renders by name -- the visible multi-agent loop.
    for (const name of [
      "Sentinel",
      "Verifier",
      "Atlas",
      "Simulator",
      "Skeptic",
      "Strategist",
      "Dispatcher"
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // The mode is humanized, never the raw enum on the glass: live calls read
    // "Live AI", deterministic steps read "Rules". The exact enum lives only in the
    // chip title (agentModeTitle), so it is NOT a visible text node.
    expect(screen.getAllByText("Live AI").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rules").length).toBeGreaterThan(0);
    expect(screen.queryByText("LIVE_AI")).not.toBeInTheDocument();
    expect(screen.queryByText("DETERMINISTIC_RULES")).not.toBeInTheDocument();
  });

  it("labels a degraded (FAILED_TO_FALLBACK) agent step honestly, not as live", () => {
    const runs = [
      makeRun({ agentName: "Sentinel", model: "gemini-2.5-flash", mode: "LIVE_AI" }),
      makeRun({
        agentName: "Skeptic",
        model: "groq/llama-4-maverick",
        mode: "FAILED_TO_FALLBACK",
        validationStatus: "FAIL",
        summary: "Skeptic live AI call failed. Holding the finding (fail-closed)."
      })
    ];
    render(<ActionOpsPacketView packet={makeV2Packet({ agentRuns: runs })} />);
    // The degraded step reads "Degraded" + carries the "Needs review" validation badge.
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });

  it("shows the Skeptic trust line as HELD on a cleared (ACT) cross-family challenge", () => {
    render(<ActionOpsPacketView packet={makeV2Packet({ agentRuns: SEVEN_RUN_CHAIN })} />);
    // The calm, on-glass trust signal -- a different AI model challenged it and it held.
    expect(
      screen.getByText(/a different AI model.*challenged this finding, and it held/i)
    ).toBeInTheDocument();
  });

  it("shows the Skeptic line as a CAUTION on an ANNOTATED downgrade -- never the 'it held' clear", () => {
    // The "scope the gate" path: the live cross-family critic OBJECTED, but the finding was
    // independently strong + geo-coherent, so the gate downgraded the veto to a recorded caution
    // (skepticGateOutcome ANNOTATED) and the plan ACTs. The glass must NOT show the positive
    // "and it held" clear (that would overclaim the critic endorsed it) -- it shows the honest
    // caution + that action proceeds on the finding's own merits, with approval still required.
    render(
      <ActionOpsPacketView
        packet={makeV2Packet({
          agentRuns: SEVEN_RUN_CHAIN, // a genuine live cross-family Skeptic ran
          recommendation: "ACT",
          skepticGateOutcome: "ANNOTATED"
        })}
      />
    );
    expect(screen.getByText(/raised a caution about this finding/i)).toBeInTheDocument();
    expect(screen.getByText(/requires your approval before anything is sent/i)).toBeInTheDocument();
    // Must NOT claim the positive clear.
    expect(screen.queryByText(/and it held/i)).not.toBeInTheDocument();
  });

  it("shows the Skeptic line as ON HOLD on a NO_ACTION reject -- never 'it held'", () => {
    // A live REJECT is a HEALTHY run (validationStatus PASS) that forces NO_ACTION: keying
    // the verdict off validationStatus would ship a false "it held". The held-vs-hold read
    // must come from the packet recommendation.
    const rejectChain = SEVEN_RUN_CHAIN.map((r) =>
      r.agentName === "Skeptic"
        ? makeRun({
            agentName: "Skeptic",
            model: "groq/llama-4-maverick",
            mode: "LIVE_AI",
            validationStatus: "PASS",
            summary:
              "Rejected: the cross-family critic could not stand behind acting -- holding."
          })
        : r
    );
    render(
      <ActionOpsPacketView
        packet={makeV2Packet({
          agentRuns: rejectChain,
          recommendation: "NO_ACTION",
          missingEvidence: [
            {
              requirement: "Independent adversarial review",
              detail: "An independent cross-family critic could not stand behind acting.",
              wouldFlipIf: "An analyst confirms the finding is sound."
            }
          ],
          // NO_ACTION withholds all outbound action (mirrors the schema superRefine).
          playbooks: [],
          supplierMessages: [],
          actionItems: [],
          recoveryOptions: []
        })}
      />
    );
    // The held-back copy is NEUTRAL by design: it states the reviewer ran and action is on
    // hold, WITHOUT claiming "it held" (false) or attributing the hold to the Skeptic (a
    // thin-evidence hold can co-occur with a Skeptic accept; the AgentRun has no accepted bool).
    expect(
      screen.getByText(/reviewed this finding; outbound\s+action is on hold/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/and it held/i)).not.toBeInTheDocument();
  });

  it("shows NO Skeptic trust line for the deterministic affirmative pass (no real challenge)", () => {
    // A deterministic-pass Skeptic (model "deterministic-rules") adds no real adversarial
    // gate -- claiming "a second AI challenged this" would overclaim. It still appears in
    // the trail, but earns no on-glass trust line.
    const runs = [
      makeRun({ agentName: "Sentinel", model: "gemini-2.5-flash", mode: "LIVE_AI" }),
      makeRun({ agentName: "Skeptic" }) // deterministic default: model "deterministic-rules"
    ];
    render(<ActionOpsPacketView packet={makeV2Packet({ agentRuns: runs })} />);
    expect(screen.getByText("Skeptic")).toBeInTheDocument(); // in the trail
    expect(screen.queryByText(/challenged this finding/i)).not.toBeInTheDocument();
  });

  it("renders nothing for the deliberation/Skeptic when there are no agent runs", () => {
    // The demo fallback packet ships agentRuns: [] -- the surface must not blank or break.
    render(<ActionOpsPacketView packet={makeV2Packet({ agentRuns: [] })} />);
    expect(screen.queryByText(/How this was reasoned/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/challenged this finding/i)).not.toBeInTheDocument();
  });

  it("renders the scored recovery options with reversibility as the governance dial", () => {
    render(
      <ActionOpsPacketView packet={makeV2Packet({ recoveryOptions: RECOVERY_OPTIONS })} />
    );
    expect(screen.getByText(/What we could do/i)).toBeInTheDocument();
    expect(
      screen.getByText("Expedite inbound on the most exposed lanes")
    ).toBeInTheDocument();
    // The action label is humanized; the governance signal (reversibility) is on the glass.
    expect(screen.getByText("Expedite")).toBeInTheDocument();
    expect(screen.getByText("Escalate")).toBeInTheDocument();
    expect(screen.getByText("Easily reversible")).toBeInTheDocument();
    expect(screen.getByText("Hard to reverse")).toBeInTheDocument();
    // Ranked by score: the top option is marked, and the harder-to-reverse move needs sign-off.
    expect(screen.getByText("Lead option")).toBeInTheDocument();
    expect(screen.getAllByText("Needs your approval").length).toBeGreaterThan(0);
  });

  it("withholds the recovery options on a NO_ACTION packet", () => {
    render(
      <ActionOpsPacketView
        packet={makeV2Packet({
          recommendation: "NO_ACTION",
          missingEvidence: [
            { requirement: "Corroboration", detail: "thin", wouldFlipIf: "a second source" }
          ],
          playbooks: [],
          supplierMessages: [],
          actionItems: [],
          recoveryOptions: RECOVERY_OPTIONS
        })}
      />
    );
    expect(screen.queryByText(/What we could do/i)).not.toBeInTheDocument();
  });

  it("weaves in the Phase-1 fields: single-source count, TTR, survival read, and margin", () => {
    render(
      <ActionOpsPacketView
        packet={makeV2Packet({
          exposureResults: [
            {
              id: "EXP-SS",
              supplierId: "SUP-SS",
              supplierName: "Abu Chemical Partners",
              country: "AE",
              sector: "CHEMICALS",
              exposureScore: 81,
              rationale: "CRITICAL risk tier; 44-day lead time.",
              singleSource: true,
              recoveryDays: 58,
              evidenceIds: ["THREAT-001"]
            },
            {
              id: "EXP-BK",
              supplierId: "SUP-BK",
              supplierName: "Eastern Energy Partners",
              country: "SA",
              sector: "ENERGY",
              exposureScore: 60,
              rationale: "HIGH risk tier; 43-day lead time.",
              singleSource: false,
              recoveryDays: 43,
              evidenceIds: ["THREAT-001"]
            }
          ],
          simulation: {
            horizons: [
              { days: 7, revenueAtRiskUsd: 0, marginAtRiskUsd: 0 },
              { days: 30, revenueAtRiskUsd: 450_000, marginAtRiskUsd: 153_000 }
            ],
            productRunouts: [{ productId: "PROD-1", runoutDate: "2026-07-01" }],
            survivalDays: 25,
            generatedAt: "2026-06-13T12:00:00.000Z"
          }
        })}
      />
    );
    // The exposure note is data-driven off singleSource (1 of 2), never the false
    // hardcoded "none with a qualified backup".
    expect(
      screen.getByText(/1 of them are single-source with no qualified backup/i)
    ).toBeInTheDocument();
    // Per-row TTR (recoveryDays).
    expect(screen.getAllByText(/Est\. time to restore/i).length).toBeGreaterThan(0);
    // The survival read (TTS 25 vs worst TTR 58 -> a 33-day gap).
    expect(screen.getByText(/Cover vs restore time/i)).toBeInTheDocument();
    expect(screen.getByText(/33-day gap/i)).toBeInTheDocument();
    // Margin-at-risk beside revenue.
    expect(screen.getAllByText(/margin/i).length).toBeGreaterThan(0);
  });
});
