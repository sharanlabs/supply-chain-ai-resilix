// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActionOpsPacketView } from "@/components/launchops-dashboard";
import { makeV2Packet } from "./fixtures/decision-packet-v2";

// Fixture-based render test for the V2 (ActionOps) view. The live pipeline does
// not emit V2 yet, so this is the only place the V2 branch is exercised — it
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
    // Supplier draft + its claim sourcePath, and the never-sends guard.
    expect(screen.getByText(/Drafts only/)).toBeInTheDocument();
    expect(
      screen.getByText(/simulation\.horizons\[0\]\.revenueAtRiskUsd/)
    ).toBeInTheDocument();
    // Action item.
    expect(screen.getByText("Confirm backup supplier capacity")).toBeInTheDocument();
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
});
