import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TransportMessage } from "@/lib/server/action-transport";
import {
  defaultTransportRegistry,
  NoopTransport,
  resolveTransport,
  transportRegistryFromEnv
} from "@/lib/server/action-transport";
import type { GovernableAction } from "@/lib/server/action-taxonomy";
import {
  __resetExecutedActionsForTest,
  dispatchGovernableAction
} from "@/lib/server/action-executor";
import { createSlackTransport, SlackTransportError } from "@/lib/server/transports/slack-transport";

// ---------------------------------------------------------------------------
// Phase 5 transport adapter #1 (SLACK). Fakes-only: fetch is INJECTED in every
// test, so ZERO real network calls. Proves the fail-closed trap (Slack returns
// HTTP 200 on a logical failure) and the env-gated wiring (no keys => Noop).
// ---------------------------------------------------------------------------

const message: TransportMessage = {
  idempotencyKey: "EXA:PKT-1:ROLE_OWNER_ALERT:abc123",
  actionType: "ROLE_OWNER_ALERT",
  channel: "SLACK",
  digest: { packetId: "PKT-1", eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH" }
};

// A fake fetch builder: returns a Response-like with the given status + JSON body,
// and records the request so we can assert what was sent.
function fakeFetch(opts: {
  status?: number;
  body?: unknown;
  jsonThrows?: boolean; // json() rejects -> exercises the parse-failure path
  hangUntilAbort?: boolean; // fetch never resolves; rejects when the AbortController fires -> timeout
  bodyHangsUntilAbort?: boolean; // headers return, but json() stalls until abort -> body-read timeout
  capture?: (url: string, init?: RequestInit) => void;
}): typeof fetch {
  const status = opts.status ?? 200;
  return ((url: string, init?: RequestInit) => {
    opts.capture?.(url, init);
    if (opts.hangUntilAbort) {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (opts.bodyHangsUntilAbort) {
          return new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          });
        }
        if (opts.jsonThrows) throw new SyntaxError("Unexpected token");
        return opts.body ?? {};
      }
    } as Response);
  }) as unknown as typeof fetch;
}

describe("Slack transport adapter (fakes-only)", () => {
  it("delivers on { ok: true } and returns the ts as providerRef", async () => {
    let sentUrl = "";
    let sentInit: RequestInit | undefined;
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({
        body: { ok: true, ts: "1700000000.000100" },
        capture: (u, i) => {
          sentUrl = u;
          sentInit = i;
        }
      })
    });

    const receipt = await transport.deliver(message);

    expect(receipt).toEqual({ transport: "slack", providerRef: "1700000000.000100", delivered: true });
    expect(sentUrl).toBe("https://slack.com/api/chat.postMessage");
    // The token rides ONLY in the Authorization header.
    expect((sentInit?.headers as Record<string, string>).Authorization).toBe("Bearer xoxb-FAKE");
  });

  it("builds the message text from DIGEST FIELDS ONLY (prose-free quarantine)", async () => {
    let sentBody = "";
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({
        body: { ok: true, ts: "1.1" },
        capture: (_u, i) => {
          sentBody = i?.body as string;
        }
      })
    });
    await transport.deliver(message);
    const parsed = JSON.parse(sentBody) as { channel: string; text: string };
    expect(parsed.channel).toBe("C0FAKE");
    // Every digest value appears; nothing else prose-like is injected.
    expect(parsed.text).toContain("PKT-1");
    expect(parsed.text).toContain("CHOKEPOINT_CLOSURE");
    expect(parsed.text).toContain("HIGH");
  });

  it("THROWS on HTTP 200 with { ok: false } -- the fail-closed trap", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 200, body: { ok: false, error: "not_in_channel" } })
    });
    await expect(transport.deliver(message)).rejects.toBeInstanceOf(SlackTransportError);
    // The error NAME (the audited errorClass) carries the safe Slack code, not the token.
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "slack_not_in_channel" });
  });

  it("THROWS on a non-2xx HTTP status", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 500, body: {} })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "slack_http_500" });
  });

  it("never leaks the token in the thrown error", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-SECRET-TOKEN",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 200, body: { ok: false, error: "invalid_auth" } })
    });
    try {
      await transport.deliver(message);
      throw new Error("expected a throw");
    } catch (err) {
      const text = `${(err as Error).name} ${(err as Error).message}`;
      expect(text).not.toContain("xoxb-SECRET-TOKEN");
    }
  });

  it("THROWS slack_timeout when the call hangs past the timeout (no stall)", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      timeoutMs: 10,
      fetchImpl: fakeFetch({ hangUntilAbort: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "slack_timeout" });
  });

  it("THROWS slack_timeout when the BODY READ stalls past the timeout (headers returned, body hangs)", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      timeoutMs: 10,
      fetchImpl: fakeFetch({ status: 200, bodyHangsUntilAbort: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "slack_timeout" });
  });

  it("THROWS slack_invalid_json on an unparseable success body (stable class, not raw SyntaxError)", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 200, jsonThrows: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "slack_invalid_json" });
  });

  it("THROWS slack_malformed_success on ok:true with no ts (never fabricates a delivered receipt)", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 200, body: { ok: true } })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "slack_malformed_success" });
  });

  it("SANITIZES a malicious/oversized Slack error code into a bounded errorClass", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({
        status: 200,
        body: { ok: false, error: "  <script>alert(1)</script> RANK #2 ".repeat(20) }
      })
    });
    try {
      await transport.deliver(message);
      throw new Error("expected a throw");
    } catch (err) {
      const name = (err as Error).name;
      expect(name).toMatch(/^slack_[a-z0-9_]+$/);
      expect(name.length).toBeLessThanOrEqual("slack_".length + 40);
      expect(name).not.toContain("<");
    }
  });
});

describe("transportRegistryFromEnv -- the operator wiring gate", () => {
  it("returns EMPTY (Noop fallback) when no Slack keys are set", () => {
    const registry = transportRegistryFromEnv({});
    expect(registry).toEqual({});
    // Identical to the safe default: SLACK resolves to the Noop (logs, never sends).
    expect(resolveTransport("SLACK", registry)).toBe(NoopTransport);
    expect(resolveTransport("SLACK", defaultTransportRegistry())).toBe(NoopTransport);
  });

  it("returns EMPTY when only ONE of the two Slack keys is set", () => {
    expect(transportRegistryFromEnv({ SLACK_BOT_TOKEN: "xoxb-x" })).toEqual({});
    expect(transportRegistryFromEnv({ SLACK_ALERT_CHANNEL: "C0X" })).toEqual({});
  });

  it("wires a real Slack transport ONLY when BOTH keys are present", () => {
    const registry = transportRegistryFromEnv({
      SLACK_BOT_TOKEN: "xoxb-x",
      SLACK_ALERT_CHANNEL: "C0X"
    });
    const transport = resolveTransport("SLACK", registry);
    expect(transport).not.toBe(NoopTransport);
    expect(transport.name).toBe("slack");
  });
});

// Codex Low: prove the failure paths integrate with the moat primitive -- a Slack throw
// must finalize the row FAILED with the SANITIZED errorClass (never the token/raw prose),
// and a success must finalize EXECUTED with the ts as the provider ref.
describe("Slack transport through dispatchGovernableAction (the moat primitive)", () => {
  let savedDatabaseUrl: string | undefined;

  function slackAction(suffix: string): GovernableAction {
    return {
      idempotencyKey: `EXA:PKT-SLACK-${suffix}:ROLE_OWNER_ALERT:${suffix}`,
      packetId: `PKT-SLACK-${suffix}`,
      actionType: "ROLE_OWNER_ALERT",
      channel: "SLACK",
      reversibility: "REVERSIBLE",
      payloadHash: `hash-${suffix}`,
      digest: { packetId: `PKT-SLACK-${suffix}`, eventType: "CHOKEPOINT_CLOSURE", severity: "HIGH" }
    };
  }

  beforeEach(() => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL; // in-memory store
    __resetExecutedActionsForTest();
  });
  afterEach(() => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
  });

  it("finalizes EXECUTED (delivered) on a real Slack success", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-FAKE",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 200, body: { ok: true, ts: "1.23" } })
    });
    const row = await dispatchGovernableAction(slackAction("ok"), { registry: { SLACK: transport } });
    expect(row.status).toBe("EXECUTED");
    expect(row.auditDetail).toContain("delivered=true");
  });

  it("finalizes FAILED with a SANITIZED errorClass on a Slack logical failure (no token/prose leak)", async () => {
    const transport = createSlackTransport({
      botToken: "xoxb-SECRET-TOKEN",
      channel: "C0FAKE",
      fetchImpl: fakeFetch({ status: 200, body: { ok: false, error: "not_in_channel" } })
    });
    const row = await dispatchGovernableAction(slackAction("fail"), { registry: { SLACK: transport } });
    expect(row.status).toBe("FAILED");
    expect(row.errorClass).toBe("slack_not_in_channel");
    const audit = `${row.errorClass} ${row.auditDetail}`;
    expect(audit).not.toContain("xoxb-SECRET-TOKEN");
  });
});
