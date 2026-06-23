// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActionOpsPacketView } from "@/components/actionops-dashboard";
import { makeV2Packet } from "./fixtures/decision-packet-v2";

// Fixture-based render test for the V2 (ActionOps) view. The live pipeline does
// not emit V2 yet, so this is the only place the V2 branch is exercised -- it
// proves the version-aware UI seam renders the plan-locked fields (not a stub),
// without driving the whole app (no e2e).
describe("ActionOpsPacketView (V2 render)", () => {
  it("renders the plan-locked ActionOps sections", () => {
    render(<ActionOpsPacketView packet={makeV2Packet()} />);

    // Threat card.
    expect(screen.getByText(/Hormuz transit disruption/)).toBeInTheDocument();
    expect(screen.getByText("CHOKEPOINT_CLOSURE")).toBeInTheDocument();
    expect(screen.getByText("SEEDED")).toBeInTheDocument();
    // Exposure.
    expect(screen.getByText("Gulf Components Ltd")).toBeInTheDocument();
    // Runway simulation horizon (revenue-at-risk formatted).
    expect(screen.getByText("7-day")).toBeInTheDocument();
    // Supplier draft + its claim sourcePath, and the never-sends guard. The
    // re-sequenced "drafted response" section states the guard in plain prose
    // ("nothing leaves the building until a person sends them") -- assert that
    // honest never-sends promise is present, not the old kicker wording.
    expect(
      screen.getByText(/nothing leaves the building until a person sends/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/simulation\.horizons\[0\]\.revenueAtRiskUsd/)
    ).toBeInTheDocument();
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
    expect(screen.getByText(/Degraded - no live AI/)).toBeInTheDocument();
  });

  it("announces mode changes via a persistent live region (WCAG 2.2 SC 4.1.3)", () => {
    const { rerender } = render(<ActionOpsPacketView packet={makeV2Packet()} />);

    // Always mounted (a conditionally-mounted region never announces), with the
    // status role + polite setting; no degraded text on a healthy packet.
    const region = screen.getByTestId("mode-status");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).not.toHaveTextContent(/degraded fallback/i);

    // The SAME persistent node's text changes on a degraded rerender, so AT
    // announces it without moving focus.
    rerender(
      <ActionOpsPacketView
        packet={makeV2Packet({ effectiveMode: "FAILED_TO_FALLBACK" })}
      />
    );
    expect(screen.getByTestId("mode-status")).toHaveTextContent(
      /degraded fallback mode/i
    );
  });
});
