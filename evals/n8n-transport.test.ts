import { describe, expect, it } from "vitest";
import type { TransportMessage } from "@/lib/server/action-transport";
import {
  defaultTransportRegistry,
  NoopTransport,
  resolveTransport,
  transportRegistryFromEnv
} from "@/lib/server/action-transport";
import type { GovernableAction } from "@/lib/server/action-taxonomy";
import { __resetExecutedActionsForTest, dispatchGovernableAction } from "@/lib/server/action-executor";
import { createN8nTransport, N8nTransportError } from "@/lib/server/transports/n8n-transport";

// ---------------------------------------------------------------------------
// Phase 5 transport adapter #3 (N8N). Fakes-only: fetch is INJECTED in every
// test, so ZERO real network calls. Proves the fail-closed trap (HTTP status
// is the ONLY signal n8n guarantees -- its response body is entirely
// workflow-defined, unlike Slack's {ok:false} or Resend's {id}/{name}) and the
// env-gated wiring (URL missing, or a partial header pair, => Noop).
// ---------------------------------------------------------------------------

const message: TransportMessage = {
  idempotencyKey: "EXA:PKT-1:ERP_CASE:abc123",
  actionType: "ERP_CASE",
  channel: "N8N",
  digest: { caseId: "CASE-1", supplierId: "SUP-1", severity: "HIGH" }
};

// Body content is deliberately IRRELEVANT to this adapter (providerRef is always
// synthetic) -- so unlike slack/email's fakeFetch, there's no json()/jsonThrows/
// body-read-timeout machinery to fake here. Only status + the drain call matter.
function fakeFetch(opts: {
  status?: number;
  hangUntilAbort?: boolean;
  cancelHangsForever?: boolean; // body.cancel() never settles -- must not block deliver()
  onCancel?: () => void; // spy: proves the body was drained even on the failure path
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
      body: {
        cancel: () => {
          opts.onCancel?.();
          return opts.cancelHangsForever ? new Promise(() => {}) : Promise.resolve();
        }
      }
    } as unknown as Response);
  }) as unknown as typeof fetch;
}

describe("N8N transport adapter (fakes-only)", () => {
  it("delivers on 2xx and uses the SYNTHETIC providerRef (never body-derived)", async () => {
    let sentUrl = "";
    let sentInit: RequestInit | undefined;
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({
        capture: (u, i) => {
          sentUrl = u;
          sentInit = i;
        }
      })
    });

    const receipt = await transport.deliver(message);

    // providerRef is ALWAYS n8n-<idempotencyKey>, regardless of anything the response
    // body might contain -- this adapter never calls response.json() at all (see the
    // file-header note: 3 rounds of Codex review each found a new way a workflow-
    // echoed body value, or the configured header secret, could leak into providerRef
    // via ever-narrower pattern-matching fixes; the fix that actually closes the class
    // is to never derive providerRef from body content in the first place).
    expect(receipt).toEqual({
      transport: "n8n",
      providerRef: `n8n-${message.idempotencyKey}`,
      delivered: true
    });
    expect(sentUrl).toBe("https://n8n.example.com/webhook/erp");
    expect((sentInit?.headers as Record<string, string>)["Content-Type"]).toContain("application/json");
  });

  it("still delivers with a synthetic providerRef when header auth is configured (no body ever consulted)", async () => {
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      headerName: "X-My-Secret",
      headerValue: "s3cr3t-value",
      fetchImpl: fakeFetch({ status: 200 })
    });
    const receipt = await transport.deliver(message);
    expect(receipt.delivered).toBe(true);
    expect(receipt.providerRef).toBe(`n8n-${message.idempotencyKey}`);
  });

  it("builds the payload from DIGEST FIELDS ONLY (prose-free quarantine)", async () => {
    let sentBody = "";
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({
        capture: (_u, i) => {
          sentBody = i?.body as string;
        }
      })
    });
    await transport.deliver(message);
    const parsed = JSON.parse(sentBody) as Record<string, string>;
    expect(parsed.actionType).toBe("ERP_CASE");
    expect(parsed.caseId).toBe("CASE-1");
    expect(parsed.supplierId).toBe("SUP-1");
    expect(parsed.severity).toBe("HIGH");
  });

  it("sends the operator-configured header name+value when both are set", async () => {
    let sentHeaders: Record<string, string> = {};
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      headerName: "X-My-Secret",
      headerValue: "s3cr3t-value",
      fetchImpl: fakeFetch({
        capture: (_u, i) => {
          sentHeaders = i?.headers as Record<string, string>;
        }
      })
    });
    await transport.deliver(message);
    expect(sentHeaders["X-My-Secret"]).toBe("s3cr3t-value");
  });

  it("THROWS on a non-2xx HTTP status -- the ONLY fail-closed signal n8n guarantees", async () => {
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({ status: 500 })
    });
    await expect(transport.deliver(message)).rejects.toBeInstanceOf(N8nTransportError);
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "n8n_http_500" });
  });

  it("DRAINS the body on a non-2xx response too, not just on success (Codex round 5 #2)", async () => {
    let cancelled = false;
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({ status: 500, onCancel: () => (cancelled = true) })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "n8n_http_500" });
    expect(cancelled).toBe(true);
  });

  it("does NOT hang waiting on a stalled body.cancel() on a 2xx response (Codex round 5 #1: drain must be fire-and-forget)", async () => {
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({ status: 200, cancelHangsForever: true })
    });
    // If drain were awaited, this would hang past the test's own timeout. It resolves
    // immediately because success is decided on HTTP status alone.
    const receipt = await transport.deliver(message);
    expect(receipt.delivered).toBe(true);
    expect(receipt.providerRef).toBe(`n8n-${message.idempotencyKey}`);
  });

  it("THROWS on a 4xx HTTP status (e.g. inactive workflow / bad path)", async () => {
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({ status: 404 })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "n8n_http_404" });
  });

  it("never leaks the header value in the thrown error", async () => {
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      headerName: "X-My-Secret",
      headerValue: "s3cr3t-value",
      fetchImpl: fakeFetch({ status: 500 })
    });
    try {
      await transport.deliver(message);
      throw new Error("expected a throw");
    } catch (err) {
      const text = `${(err as Error).name} ${(err as Error).message}`;
      expect(text).not.toContain("s3cr3t-value");
    }
  });

  it("THROWS n8n_timeout when the call hangs past the timeout (no stall)", async () => {
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      timeoutMs: 10,
      fetchImpl: fakeFetch({ hangUntilAbort: true })
    });
    await expect(transport.deliver(message)).rejects.toMatchObject({ name: "n8n_timeout" });
  });

  // NOTE: no "body read stalls" timeout test -- unlike Slack/Email, this adapter never
  // reads body CONTENT (providerRef is always synthetic), so success/failure is fully
  // decided on HTTP status alone; a slow/stalled body drain (response.body?.cancel())
  // cannot block delivery. See the file-header note on why body content is never trusted.
});

describe("transportRegistryFromEnv -- the operator wiring gate (N8N)", () => {
  it("returns EMPTY (Noop fallback) when no N8N config is set", () => {
    const registry = transportRegistryFromEnv({});
    expect(registry).toEqual({});
    expect(resolveTransport("N8N", registry)).toBe(NoopTransport);
    expect(resolveTransport("N8N", defaultTransportRegistry())).toBe(NoopTransport);
  });

  it("wires N8N with just the URL (auth is optional)", () => {
    const registry = transportRegistryFromEnv({ N8N_ERP_WEBHOOK_URL: "https://n8n.example.com/webhook/erp" });
    const transport = resolveTransport("N8N", registry);
    expect(transport).not.toBe(NoopTransport);
    expect(transport.name).toBe("n8n");
  });

  it("returns EMPTY (fail-closed) when only ONE of the header name/value pair is set", () => {
    expect(
      transportRegistryFromEnv({
        N8N_ERP_WEBHOOK_URL: "https://n8n.example.com/webhook/erp",
        N8N_ERP_WEBHOOK_HEADER_NAME: "X-Secret"
      })
    ).toEqual({});
    expect(
      transportRegistryFromEnv({
        N8N_ERP_WEBHOOK_URL: "https://n8n.example.com/webhook/erp",
        N8N_ERP_WEBHOOK_HEADER_VALUE: "s3cr3t"
      })
    ).toEqual({});
  });

  it("wires N8N with BOTH header name and value present", () => {
    const registry = transportRegistryFromEnv({
      N8N_ERP_WEBHOOK_URL: "https://n8n.example.com/webhook/erp",
      N8N_ERP_WEBHOOK_HEADER_NAME: "X-Secret",
      N8N_ERP_WEBHOOK_HEADER_VALUE: "s3cr3t"
    });
    const transport = resolveTransport("N8N", registry);
    expect(transport).not.toBe(NoopTransport);
    expect(transport.name).toBe("n8n");
  });

  it("does NOT confuse the legacy N8N_APPROVAL_WEBHOOK_URL/N8N_CALLBACK_SECRET with the new Phase-5 vars", () => {
    // The legacy inbound-callback env vars must NOT wire the new outbound N8N transport.
    const registry = transportRegistryFromEnv({
      N8N_APPROVAL_WEBHOOK_URL: "https://legacy.example.com/callback",
      N8N_CALLBACK_SECRET: "legacy-secret"
    });
    expect(registry).toEqual({});
  });
});

// ERP_CASE is IRREVERSIBLE/outward (action-taxonomy.ts), same as SUPPLIER_EMAIL_SEND.
// dispatchGovernableAction refuses any non-REVERSIBLE action outright -- there is NO
// auto-fire path for N8N today, by design. Regression test mirroring email-transport.test.ts.
describe("N8N transport does NOT open an auto-dispatch hole for an irreversible action", () => {
  function erpAction(suffix: string): GovernableAction {
    return {
      idempotencyKey: `EXA:PKT-N8N-${suffix}:ERP_CASE:${suffix}`,
      packetId: `PKT-N8N-${suffix}`,
      actionType: "ERP_CASE",
      channel: "N8N",
      reversibility: "IRREVERSIBLE",
      payloadHash: `hash-${suffix}`,
      digest: { caseId: `CASE-${suffix}`, supplierId: "SUP-1", severity: "HIGH" }
    };
  }

  it("REFUSES to auto-dispatch ERP_CASE even with a real N8N transport wired", async () => {
    __resetExecutedActionsForTest();
    const transport = createN8nTransport({
      webhookUrl: "https://n8n.example.com/webhook/erp",
      fetchImpl: fakeFetch({ status: 200 })
    });
    await expect(
      dispatchGovernableAction(erpAction("ok"), { registry: { N8N: transport } })
    ).rejects.toThrow(/refusing to auto-dispatch a non-reversible action/);
  });
});
