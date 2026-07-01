import type { ActionTransport, TransportMessage, TransportReceipt } from "@/lib/server/action-transport";
import { logger } from "@/lib/server/logger";
import { MAX_FIELD_LEN, sanitizeText } from "@/lib/signals/sanitize";

// ---------------------------------------------------------------------------
// Phase 5 transport adapter #3: N8N (the ERP_CASE channel, OSS self-host webhook).
//
// What it does: POSTs the sanitized action digest to an operator-owned n8n
// Webhook-trigger URL, downstream of the in-app gate. n8n only EXECUTES an
// already-approved action here (fires an ERP exception case) -- it never
// authorizes anything (AGENTS.md:30, reconciled 2026-07-01).
//
// SCOPE NOTE: ERP_CASE is classified (action-taxonomy.ts, channel N8N,
// IRREVERSIBLE) but never actually DERIVED by deriveGovernableActions() --
// there is no ERP integration in this MVP (PLAN.md anti-scope). So this
// adapter proves the transport mechanics against a synthetic message; there
// is no real packet-derived ERP_CASE action to point a smoke script at
// (unlike Slack/Email, which both smoke a real derived action).
//
// Design choices (differ from slack-transport.ts / email-transport.ts,
// verified against n8n's CURRENT live docs 2026-07-01, not memory):
//   - RAW fetch, NO n8n SDK, fetchImpl injected -- same as Slack/Email.
//   - DIGEST-ONLY JSON body, every value re-sanitized here (same quarantine
//     discipline as the other two adapters).
//   - NO FIXED RESPONSE ENVELOPE: unlike Slack ({ok:false} on HTTP 200) or
//     Resend ({id}/{name}), an n8n Webhook-trigger node's response is
//     ENTIRELY WORKFLOW-DEFINED (docs.n8n.io/integrations/builtin/core-nodes/
//     n8n-nodes-base.webhook/) -- "Immediately" returns a fixed message with
//     no data, "When Last Node Finishes" returns whatever the workflow
//     produced, and a "Respond to Webhook" node can return anything. There is
//     NO {ok:true}/{id} we can rely on. So the fail-closed trap keys ONLY on
//     the one thing n8n guarantees: HTTP STATUS. A non-2xx is a hard failure.
//   - providerRef is ALWAYS SYNTHETIC (n8n-<idempotencyKey>), NEVER derived
//     from response body content, by deliberate design (not an oversight --
//     3 rounds of Codex cross-model review each found a new way reading the
//     body for an "id" leaked data: an unbounded workflow-echoed string, the
//     configured header credential echoed back, then a truncated/partial
//     echo of a long credential surviving a naive substring check). Since the
//     body is entirely operator-workflow-defined and untrusted, no amount of
//     pattern-matching it closes that class of leak for good -- so this
//     adapter never reads body content into any persisted/logged field. The
//     idempotencyKey already correlates the audit row to the dispatch, which
//     is what actually matters; the response body is drained via
//     `response.body?.cancel()` (to release the connection) but never
//     inspected. This means a hung/stalled body CANNOT block delivery either
//     -- success/failure is fully decided on HTTP status before the drain.
//   - CONFIGURABLE AUTH: n8n's Header Auth credential lets the OPERATOR pick
//     both the header NAME and VALUE (docs.n8n.io/integrations/builtin/
//     credentials/webhook/) -- there is no standard header like Slack/Resend's
//     Authorization: Bearer. So the header name is itself configuration, not
//     hardcoded. Auth is optional (many self-hosted n8n setups skip it); if
//     configured, BOTH name and value are required together.
//
// The thrown error's NAME (not message) becomes the audited errorClass
// (action-executor finalizes on error.name) and is LOGGED -- a sanitized,
// length-capped code, never the header value, never body prose.
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

export class N8nTransportError extends Error {
  constructor(errorClass: string, humanReason: string) {
    super(humanReason);
    this.name = errorClass;
  }
}

export type N8nTransportConfig = {
  webhookUrl: string;
  // Optional operator-configured header auth (both required together, or neither).
  headerName?: string;
  headerValue?: string;
  // Injected for tests; defaults to the global fetch in production.
  fetchImpl?: typeof fetch;
  // Hard timeout for the webhook call. Defaults to 10s; a hung call must reach FAILED, not stall.
  timeoutMs?: number;
};

// Build the JSON payload from the digest ALONE, sanitizing each field (control-strip
// + length cap) -- same quarantine discipline as slack-transport.ts / email-transport.ts.
function digestToPayload(message: TransportMessage): Record<string, string> {
  const payload: Record<string, string> = {
    actionType: sanitizeText(message.actionType, MAX_FIELD_LEN),
    channel: sanitizeText(message.channel, MAX_FIELD_LEN),
    idempotencyKey: sanitizeText(message.idempotencyKey, MAX_FIELD_LEN)
  };
  for (const [key, value] of Object.entries(message.digest)) {
    payload[sanitizeText(key, MAX_FIELD_LEN)] = sanitizeText(String(value), MAX_FIELD_LEN);
  }
  return payload;
}

// Release the response body's stream/connection WITHOUT ever inspecting its content and
// WITHOUT blocking the caller -- deliberately not awaited. A stalled or never-settling
// cancel() must not delay deliver()'s resolution (Codex round 5 #1): the outer
// AbortController's timer only reaches the original fetch signal, not a separate promise
// created after the response already arrived.
function drainBodyFireAndForget(response: Response): void {
  response.body?.cancel().catch(() => {
    // Draining failed -- irrelevant, we never used the body's content.
  });
}

export function createN8nTransport(config: N8nTransportConfig): ActionTransport {
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "n8n",
    async deliver(message: TransportMessage): Promise<TransportReceipt> {
      // Hard timeout spanning the ENTIRE call -- the fetch AND the body read, mirroring
      // slack-transport.ts / email-transport.ts. Any abort -> n8n_timeout -> FAILED;
      // deliver() never blocks dispatchAndFinalize.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
        // The header VALUE is sent ONLY here -- never logged, never in an error.
        if (config.headerName && config.headerValue) {
          headers[config.headerName] = config.headerValue;
        }

        let response: Response;
        try {
          response = await doFetch(config.webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(digestToPayload(message)),
            signal: controller.signal
          });
        } catch {
          if (controller.signal.aborted) {
            throw new N8nTransportError("n8n_timeout", "n8n webhook call timed out");
          }
          throw new N8nTransportError("n8n_network_error", "n8n webhook network error");
        }

        // The ONLY fail-closed signal n8n guarantees: HTTP status. A non-2xx is a hard
        // failure -- n8n has no {ok:false}-on-200 shape to additionally trap (unlike Slack).
        if (!response.ok) {
          // Drain (never inspect) the body before throwing -- otherwise every failing
          // webhook response leaks an open connection/stream (Codex round 5 #2: the
          // success path drained, the failure path didn't).
          drainBodyFireAndForget(response);
          throw new N8nTransportError(
            `n8n_http_${response.status}`,
            `n8n webhook returned HTTP ${response.status}`
          );
        }

        // providerRef is ALWAYS synthetic (n8n-<idempotencyKey>), never derived from the
        // response body. n8n's response is entirely WORKFLOW-DEFINED and untrusted --
        // rounds 1-3 each found a new way a workflow-echoed body value (an id field, a
        // truncated echo, a partial overlap) could leak arbitrary data or the configured
        // header credential into providerRef -> auditDetail (a plain string outside the
        // logger's structured redaction) and scripts/n8n-smoke.ts stdout. No amount of
        // pattern-matching the body closes that class for good, so this adapter never reads
        // body CONTENT for providerRef purposes at all -- the idempotencyKey already
        // correlates the audit row to the dispatch, which is what actually matters. The body
        // is still drained (not inspected) so the connection is released rather than left
        // dangling. Round 5: this drain is FIRE-AND-FORGET (never awaited) -- awaiting it
        // would let a body whose cancel() never settles keep deliver() pending even though
        // success was already decided on HTTP status, potentially stranding the action in
        // DISPATCHING past the intended timeout (the AbortController's timer only aborts the
        // ORIGINAL fetch signal, not a separate cancel() promise).
        const providerRef = `n8n-${message.idempotencyKey}`;
        drainBodyFireAndForget(response);

        logger.info(
          {
            event: "action.n8n_dispatch",
            actionType: message.actionType,
            channel: message.channel,
            idempotencyKey: message.idempotencyKey,
            delivered: true
          },
          "n8n-transport: message delivered"
        );
        return { transport: "n8n", providerRef, delivered: true };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
