import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { deriveGovernableActions } from "@/lib/server/action-taxonomy";

// S6 -- the committed ERP_CASE n8n workflow export is a real artifact, not a stub:
// it must parse as JSON, be shaped as an n8n workflow, listen for the RESILIX
// dispatch, and route on the exact fields the n8n transport actually sends. This
// guards against the export drifting from the transport payload it consumes.

const WORKFLOW = JSON.parse(
  readFileSync(new URL("../workflows/resilix_erp_case_workflow.json", import.meta.url), "utf8")
);

describe("S6 ERP_CASE workflow export", () => {
  it("is a valid n8n workflow with a webhook entry node", () => {
    expect(Array.isArray(WORKFLOW.nodes)).toBe(true);
    const webhook = WORKFLOW.nodes.find((n: { type: string }) => n.type === "n8n-nodes-base.webhook");
    expect(webhook, "workflow must have a webhook trigger").toBeDefined();
    expect(webhook.parameters.httpMethod).toBe("POST");
  });

  it("guards on the EXACT fields the RESILIX n8n transport sends (actionType + idempotencyKey)", () => {
    // The transport body is {actionType, channel, idempotencyKey, ...digest}. The
    // workflow's guard references these by JSON path -- a rename on either side
    // would strand the dispatch, so pin the coupling.
    const json = JSON.stringify(WORKFLOW);
    expect(json).toContain("$json.body.actionType");
    expect(json).toContain("$json.body.idempotencyKey");
    expect(json).toContain("ERP_CASE");
  });

  it("ERP_CASE is a real classified action type routed to N8N as IRREVERSIBLE (moat)", () => {
    // The workflow's whole reason to exist: ERP_CASE is the code-classified outbound
    // action. Confirm the taxonomy still classifies it that way (so the workflow can
    // never be reached by an auto-recovered/reversible path).
    // deriveGovernableActions is data-driven; the taxonomy row is the invariant.
    const taxonomy = readFileSync(
      new URL("../lib/server/action-taxonomy.ts", import.meta.url),
      "utf8"
    );
    expect(taxonomy).toMatch(/ERP_CASE:\s*\{\s*reversibility:\s*"IRREVERSIBLE",\s*channel:\s*"N8N"\s*\}/);
    // Sanity: the derivation function exists and is importable (structural, not a mock).
    expect(typeof deriveGovernableActions).toBe("function");
  });
});

// S6 gate route-back: the "n8n absent from any (outbound) approval path" AT, made a
// real structural assertion. The OUTBOUND n8n transport can only DELIVER -- it has no
// approve/execute/authorize capability -- and every N8N-routed action is IRREVERSIBLE
// (human-gated, never auto-fired). This is the honest, scoped version of the claim:
// it covers the outbound channel; the SEPARATE legacy inbound approval-callback route
// (app/api/n8n/approval-callback) is a predecessor artifact, disclosed on the README,
// hardened + do-not-extend (AGENTS.md), out of the ActionOps core loop.
describe("S6 outbound n8n has NO authority (scoped approval-path-absence AT)", () => {
  it("the ActionTransport contract is delivery-only -- no approve/execute/authorize method", () => {
    const src = readFileSync(new URL("../lib/server/action-transport.ts", import.meta.url), "utf8");
    // The interface exposes exactly `name` + `deliver`. Any approval/execution verb on
    // the transport surface would be a moat breach.
    const iface = src.slice(src.indexOf("export interface ActionTransport"));
    const body = iface.slice(0, iface.indexOf("}") + 1);
    expect(body).toContain("deliver(");
    expect(body).not.toMatch(/approve\(|execute\(|authorize\(|transition\(/);
  });

  it("every N8N-routed action is IRREVERSIBLE (never auto-fired; always human-gated)", () => {
    const taxonomy = readFileSync(
      new URL("../lib/server/action-taxonomy.ts", import.meta.url),
      "utf8"
    );
    // Extract every `channel: "N8N"` row and assert each is IRREVERSIBLE.
    const n8nRows = [...taxonomy.matchAll(/reversibility:\s*"(\w+)",\s*channel:\s*"N8N"/g)];
    expect(n8nRows.length).toBeGreaterThan(0);
    for (const m of n8nRows) {
      expect(m[1]).toBe("IRREVERSIBLE");
    }
  });
});
