// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeckView } from "@/components/deck/deck-view";
import type { AgentRun } from "@/lib/schemas";
import { makeV2Packet } from "./fixtures/decision-packet-v2";

// COLD-BRANCH coverage for the shipped `/` decision surface (acceptance-gate
// route-back, 2026-07-22): the e2e suite exercises DeckView only with the frozen
// ACT + gatekeeper-PASS replay packet, so the refusal branch, the blocked
// gatekeeper, the already-decided path, and the Skeptic states had NO test
// anywhere. These render the fixture VARIANTS the live surface can legitimately
// serve and pin each branch's behavior -- above all that the approve control
// stays gated exactly like the ported action-packet-view invariant.

function makeSkepticRun(partial: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "RUN-SKEPTIC",
    agentName: "Skeptic",
    model: "openai/gpt-oss-120b", // cross-family: NOT deterministic-rules
    mode: "LIVE_AI",
    latencyMs: 12,
    tokenEstimate: 10,
    inputHash: "aaaaaaaa",
    outputHash: "bbbbbbbb",
    validationStatus: "PASS",
    summary: "Challenged the finding; accepted.",
    createdAt: "2026-06-13T12:00:00.000Z",
    ...partial
  };
}

describe("DeckView / approve gate (the ported invariant, per branch)", () => {
  it("ACT + PASS: approve is enabled, and deciding writes the audit line + flips the stamps", () => {
    const { container } = render(<DeckView packet={makeV2Packet()} />);
    const approve = screen.getByTestId("approve-action");
    expect(approve).toBeEnabled();

    fireEvent.click(approve);

    // The decision is communicated by the logged line (the deck's contract),
    // and the letter stamps flip to their released state (AT1's letter).
    expect(screen.getByTestId("decision-logged")).toHaveTextContent(
      /Signed & released — logged/
    );
    expect(container.querySelector(".dk-lcard.released")).not.toBeNull();
    // Both controls settle disabled -- the decision is one-shot.
    expect(screen.getByTestId("approve-action")).toBeDisabled();
  });

  it("BLOCKED gatekeeper: approve is disabled and the blocked reason is on the glass", () => {
    render(
      <DeckView
        packet={makeV2Packet({
          gatekeeper: {
            status: "BLOCKED",
            failures: ["Citation check failed on MSG-001"],
            warnings: [],
            approvedForHumanReview: false,
            checkedAt: "2026-06-13T12:00:00.000Z"
          }
        })}
      />
    );
    const approve = screen.getByTestId("approve-action");
    expect(approve).toBeDisabled();
    // The reason is bound to the control (aria-describedby -> #dk-approve-blocked).
    expect(approve).toHaveAttribute("aria-describedby", "dk-approve-blocked");
    expect(
      screen.getByText(/Automatic checks blocked this plan/i)
    ).toBeInTheDocument();
    // The blocked state can never read as released.
    expect(screen.queryByTestId("decision-logged")).not.toBeInTheDocument();
  });

  it("already-decided (REJECTED) packet: both controls are disabled, no blocked reason invented", () => {
    render(<DeckView packet={makeV2Packet({ approvalStatus: "REJECTED" })} />);
    expect(screen.getByTestId("approve-action")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hold" })).toBeDisabled();
    // Not-PENDING is communicated by the logged line, not a fabricated
    // "blocked" explanation (approveBlockedReason is null on this branch).
    expect(
      screen.queryByText(/Automatic checks blocked this plan/i)
    ).not.toBeInTheDocument();
  });
});

describe("DeckView / NO_ACTION refusal branch", () => {
  const noActionPacket = () =>
    makeV2Packet({
      recommendation: "NO_ACTION",
      missingEvidence: [
        {
          requirement: "Independent corroboration",
          detail: "Only one unconfirmed source reported the disruption.",
          wouldFlipIf: "A second independent outlet confirms the closure."
        }
      ],
      // NO_ACTION withholds all outbound action (mirrors the schema superRefine).
      playbooks: [],
      supplierMessages: [],
      actionItems: [],
      recoveryOptions: []
    });

  it("renders the refusal + missing evidence, and the approve control is ABSENT", () => {
    render(<DeckView packet={noActionPacket()} />);
    expect(
      screen.getByText(/Outbound action withheld — the evidence is too thin/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Independent corroboration")).toBeInTheDocument();
    expect(
      screen.getByText(/A second independent outlet confirms the closure/i)
    ).toBeInTheDocument();
    // Nothing to approve: the control pair does not render at all.
    expect(screen.queryByTestId("approve-action")).not.toBeInTheDocument();
  });

  it("withholds the recovery options ('What we could do') on NO_ACTION", () => {
    render(<DeckView packet={noActionPacket()} />);
    expect(screen.queryByText("What we could do")).not.toBeInTheDocument();
  });
});

describe("DeckView / Skeptic states (graceful absence, never fabricated)", () => {
  it("no Skeptic run -> no second-opinion chip and no reviewer line", () => {
    render(<DeckView packet={makeV2Packet()} />);
    expect(screen.queryByText(/2nd AI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/independent reviewer/i)).not.toBeInTheDocument();
  });

  it("a deterministic Skeptic placeholder is NOT a cross-family challenge (no chip)", () => {
    render(
      <DeckView
        packet={makeV2Packet({
          agentRuns: [makeSkepticRun({ model: "deterministic-rules" })]
        })}
      />
    );
    expect(screen.queryByText(/2nd AI/)).not.toBeInTheDocument();
  });

  it("a genuine cross-family Skeptic accept renders '2nd AI agreed'", () => {
    render(
      <DeckView packet={makeV2Packet({ agentRuns: [makeSkepticRun()] })} />
    );
    expect(screen.getByText(/2nd AI agreed/)).toBeInTheDocument();
  });

  it("ANNOTATED gate outcome on an ACT packet renders the caution, not the accept", () => {
    render(
      <DeckView
        packet={makeV2Packet({
          agentRuns: [makeSkepticRun()],
          skepticGateOutcome: "ANNOTATED"
        })}
      />
    );
    expect(screen.getByText(/2nd AI cautioned/)).toBeInTheDocument();
    expect(screen.queryByText(/2nd AI agreed/)).not.toBeInTheDocument();
  });
});
