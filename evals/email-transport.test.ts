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
import { createEmailTransport, EmailTransportError } from "@/lib/server/transports/email-transport";

// ---------------------------------------------------------------------------
// Phase 5 transport adapter #2 (EMAIL via Resend). Fakes-only: fetch is
// INJECTED in every test, so ZERO real network calls. Proves the fail-closed
// trap (Resend signals failure via HTTP status, unlike Slack's HTTP-200-but-
// logically-failed shape) and the env-gated wiring (any key missing => Noop).
// ---------------------------------------------------------------------------

const message: TransportMessage = {
  idempotencyKey: "EXA:PKT-1:SUPPLIER_EMAIL_SEND:abc123",
  actionType: "SUPPLIER_EMAIL_SEND",
  channel: "EMAIL",
  digest: { messageId: "MSG-1", supplierId: "SUP-1", draftChannel: "email" }
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

describe("Email transport adapter (fakes-only)", () => {
  it("delivers on 200 + { id } and returns the id as providerRef", async () => {
    let sentUrl = "";
    let sentInit: RequestInit | undefined;
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({
        body: { id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" },
        capture: (u, i) => {
          sentUrl = u;
          sentInit = i;
        }
      })
    });

    const receipt = await transport.deliver(message);

    expect(receipt).toEqual({
      transport: "email",
      providerRef: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
      delivered: true
    });
    expect(sentUrl).toBe("https://api.resend.com/emails");
    // The key rides ONLY in the Authorization header.
    expect((sentInit?.headers as Record<string, string>).Authorization).toBe("Bearer re_FAKE");
    // The idempotency key rides Resend's native dedup header.
    expect((sentInit?.headers as Record<string, string>)["Idempotency-Key"]).toBe(message.idempotencyKey);
  });

  it("builds the email from DIGEST FIELDS ONLY (prose-free quarantine)", async () => {
    let sentBody = "";
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({
        body: { id: "1" },
        capture: (_u, i) => {
          sentBody = i?.body as string;
        }
      })
    });
    await transport.deliver(message);
    const parsed = JSON.parse(sentBody) as { from: string; to: string; subject: string; text: string };
    expect(parsed.from).toBe("alerts@example.com");
    expect(parsed.to).toBe("owner@example.com");
    expect(parsed.subject).toContain("SUPPLIER_EMAIL_SEND");
    // Every digest value appears; nothing else prose-like is injected.
    expect(parsed.text).toContain("MSG-1");
    expect(parsed.text).toContain("SUP-1");
  });

  it("THROWS on a non-2xx HTTP status with a sanitized error name from the body", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({ status: 422, body: { name: "missing_required_field", message: "to is required" } })
    });
    await expect(transport.deliver(message)).rejects.toBeInstanceOf(EmailTransportError);
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "email_missing_required_field" });
  });

  it("THROWS a status-coded fallback on a non-2xx status with no parseable error name", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({ status: 500, jsonThrows: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "email_http_500" });
  });

  it("never leaks the API key in the thrown error", async () => {
    const transport = createEmailTransport({
      apiKey: "re_SECRET_KEY",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({ status: 403, body: { name: "invalid_api_key", message: "re_SECRET_KEY is invalid" } })
    });
    try {
      await transport.deliver(message);
      throw new Error("expected a throw");
    } catch (err) {
      const text = `${(err as Error).name} ${(err as Error).message}`;
      expect(text).not.toContain("re_SECRET_KEY");
    }
  });

  it("THROWS email_timeout when the call hangs past the timeout (no stall)", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      timeoutMs: 10,
      fetchImpl: fakeFetch({ hangUntilAbort: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "email_timeout" });
  });

  it("THROWS email_timeout when the BODY READ stalls past the timeout (headers returned, body hangs)", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      timeoutMs: 10,
      fetchImpl: fakeFetch({ status: 200, bodyHangsUntilAbort: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "email_timeout" });
  });

  it("THROWS email_invalid_json on an unparseable success body (stable class, not raw SyntaxError)", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({ status: 200, jsonThrows: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "email_invalid_json" });
  });

  it("THROWS email_malformed_success on 200 with no id (never fabricates a delivered receipt)", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({ status: 200, body: {} })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "email_malformed_success" });
  });

  it("SANITIZES a malicious/oversized Resend error name into a bounded errorClass", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({
        status: 400,
        body: { name: "  <script>alert(1)</script> RANK #2 ".repeat(20) }
      })
    });
    try {
      await transport.deliver(message);
      throw new Error("expected a throw");
    } catch (err) {
      const name = (err as Error).name;
      expect(name).toMatch(/^email_[a-z0-9_]+$/);
      expect(name.length).toBeLessThanOrEqual("email_".length + 40);
      expect(name).not.toContain("<");
    }
  });
});

describe("transportRegistryFromEnv -- the operator wiring gate (EMAIL)", () => {
  it("returns EMPTY (Noop fallback) when no Resend keys are set", () => {
    const registry = transportRegistryFromEnv({});
    expect(registry).toEqual({});
    // Identical to the safe default: EMAIL resolves to the Noop (logs, never sends).
    expect(resolveTransport("EMAIL", registry)).toBe(NoopTransport);
    expect(resolveTransport("EMAIL", defaultTransportRegistry())).toBe(NoopTransport);
  });

  it("returns EMPTY when only SOME of the three Resend keys are set", () => {
    expect(transportRegistryFromEnv({ RESEND_API_KEY: "re_x" })).toEqual({});
    expect(
      transportRegistryFromEnv({ RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "a@b.com" })
    ).toEqual({});
    expect(transportRegistryFromEnv({ RESEND_ALERT_EMAIL: "owner@b.com" })).toEqual({});
  });

  it("wires a real Email transport ONLY when ALL THREE keys are present", () => {
    const registry = transportRegistryFromEnv({
      RESEND_API_KEY: "re_x",
      RESEND_FROM_EMAIL: "alerts@example.com",
      RESEND_ALERT_EMAIL: "owner@example.com"
    });
    const transport = resolveTransport("EMAIL", registry);
    expect(transport).not.toBe(NoopTransport);
    expect(transport.name).toBe("email");
  });
});

// EMAIL is wired to SUPPLIER_EMAIL_SEND/RFQ_DISPATCH, both IRREVERSIBLE/outward.
// dispatchGovernableAction is the AUTO-dispatch primitive and refuses any
// non-REVERSIBLE action outright (action-executor.ts:414-419) -- there is NO
// auto-fire path for EMAIL today, by design (outward execution is a separate,
// explicit, human-approved entry point, intentionally not built here). This is
// a regression test for that invariant, not a delivery test -- proving the
// transport's mere existence on the registry does NOT open an auto-send hole
// for an irreversible/outward action.
describe("Email transport does NOT open an auto-dispatch hole for an irreversible action", () => {
  let savedDatabaseUrl: string | undefined;

  function emailAction(suffix: string): GovernableAction {
    return {
      idempotencyKey: `EXA:PKT-EMAIL-${suffix}:SUPPLIER_EMAIL_SEND:${suffix}`,
      packetId: `PKT-EMAIL-${suffix}`,
      actionType: "SUPPLIER_EMAIL_SEND",
      channel: "EMAIL",
      reversibility: "IRREVERSIBLE",
      payloadHash: `hash-${suffix}`,
      digest: { messageId: `MSG-${suffix}`, supplierId: "SUP-1", draftChannel: "email" }
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

  it("REFUSES to auto-dispatch SUPPLIER_EMAIL_SEND even with a real EMAIL transport wired", async () => {
    const transport = createEmailTransport({
      apiKey: "re_FAKE",
      fromEmail: "alerts@example.com",
      toEmail: "owner@example.com",
      fetchImpl: fakeFetch({ status: 200, body: { id: "1.23" } })
    });
    await expect(
      dispatchGovernableAction(emailAction("ok"), { registry: { EMAIL: transport } })
    ).rejects.toThrow(/refusing to auto-dispatch a non-reversible action/);
  });
});
