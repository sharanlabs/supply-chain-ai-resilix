import type { ActionTransport, TransportMessage, TransportReceipt } from "@/lib/server/action-transport";
import { logger } from "@/lib/server/logger";
import { MAX_FIELD_LEN, sanitizeText } from "@/lib/signals/sanitize";

// ---------------------------------------------------------------------------
// Phase 5 transport adapter #1: SLACK (the ROLE_OWNER_ALERT channel).
//
// What it does: posts the reversible, INTERNAL role-owner alert to a Slack
// channel the operator owns. It is NOT the outbound supplier path (that is
// SUPPLIER_EMAIL_SEND -> EMAIL, irreversible, always human-gated). This adapter
// is outbound-only: it implements ActionTransport.deliver -> chat.postMessage.
//
// Design choices (deliberate):
//   - RAW fetch, NO @slack SDK. The seam forbids a real SDK dependency (keeps the
//     supply-chain surface minimal); chat.postMessage is a single JSON POST.
//   - fetch is INJECTED (createSlackTransport({ fetchImpl })) so every test runs
//     with a fake and ZERO network, mirroring how the codebase injects generate/enabled.
//   - DIGEST-ONLY message text, RE-BOUNDED here. digestToText sanitizes every key/value
//     (control-strip + length cap) even though the ROLE_OWNER_ALERT digest is already
//     bounded upstream -- the adapter does not trust its caller (Codex Med, defense in depth).
//
// THE FAIL-CLOSED TRAP (load-bearing): Slack returns HTTP 200 even on a LOGICAL
// failure -- { ok: false, error: "not_in_channel" | "invalid_auth" | ... }. Checking
// only the HTTP status would record a FAILED post as EXECUTED/delivered:true (a lie in
// the audit trail). So deliver() THROWS on a non-2xx status, on body.ok !== true, on an
// unparseable body, on a timeout, AND on an ok-but-malformed success (ok:true with no ts).
// Every failure path throws; the ONLY return is a genuine delivered receipt. A throw is
// the fail-closed signal dispatchAndFinalize records as FAILED.
//
// The thrown error's NAME (not message) becomes the audited errorClass (action-executor
// finalizes on error.name) and is LOGGED. So the name is a SANITIZED, length-capped code
// (safeErrorCode) -- never the raw Slack string, never the token, never body prose.
// ---------------------------------------------------------------------------

const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CODE_LEN = 40;

// A typed transport error whose NAME is the audited+logged errorClass. The name is always
// a sanitized, bounded code -- never the token, never raw provider/body prose.
export class SlackTransportError extends Error {
  constructor(errorClass: string, humanReason: string) {
    super(humanReason);
    this.name = errorClass;
  }
}

// Sanitize an untrusted Slack error string into a stable, bounded errorClass code. Slack
// codes are snake_case enums, but the value is provider-controlled and is PERSISTED+LOGGED
// as errorClass, so we strip to [a-z0-9_], cap the length, and map anything empty/odd to
// slack_unknown (Codex High #2: no unbounded/poisoned string into the audit ledger).
function safeErrorCode(raw: unknown): string {
  if (typeof raw !== "string") return "slack_unknown";
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, MAX_ERROR_CODE_LEN);
  return cleaned.length > 0 ? `slack_${cleaned}` : "slack_unknown";
}

export type SlackTransportConfig = {
  botToken: string;
  channel: string;
  // Injected for tests; defaults to the global fetch in production.
  fetchImpl?: typeof fetch;
  // Hard timeout for the Slack call. Defaults to 10s; a hung call must reach FAILED, not stall.
  timeoutMs?: number;
};

// Build the Slack message text from the digest ALONE, sanitizing each field (control-strip
// + length cap). Every value is already an ID / enum / number bounded upstream, but the
// adapter re-bounds so no caller can route unbounded prose into the message (defense in depth).
function digestToText(message: TransportMessage): string {
  const lines = Object.entries(message.digest).map(
    ([key, value]) => `• ${sanitizeText(key, MAX_FIELD_LEN)}: ${sanitizeText(String(value), MAX_FIELD_LEN)}`
  );
  return [`:rotating_light: RESILIX ${message.actionType} (${message.channel})`, ...lines].join("\n");
}

export function createSlackTransport(config: SlackTransportConfig): ActionTransport {
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "slack",
    async deliver(message: TransportMessage): Promise<TransportReceipt> {
      // Hard timeout spanning the ENTIRE call -- the fetch AND the body read. A server can
      // return 200 headers then stall the body forever (Codex closure High), so the timer
      // stays armed through response.json() and is cleared only in the outer finally. Any
      // abort -> slack_timeout -> FAILED; deliver() never blocks dispatchAndFinalize.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response: Response;
        try {
          response = await doFetch(SLACK_POST_MESSAGE_URL, {
            method: "POST",
            headers: {
              // The token is sent ONLY in the Authorization header -- never logged, never in an error.
              Authorization: `Bearer ${config.botToken}`,
              "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({ channel: config.channel, text: digestToText(message) }),
            signal: controller.signal
          });
        } catch {
          if (controller.signal.aborted) {
            throw new SlackTransportError("slack_timeout", "Slack chat.postMessage timed out");
          }
          // A network/transport error -> stable class (no token/prose in the error).
          throw new SlackTransportError("slack_network_error", "Slack chat.postMessage network error");
        }

        // Trap part 1: a non-2xx HTTP status is a hard failure (fail-closed).
        if (!response.ok) {
          throw new SlackTransportError(
            `slack_http_${response.status}`,
            `Slack chat.postMessage returned HTTP ${response.status}`
          );
        }

        // Parse the body (still under the timeout). A parse failure is classified stably
        // (Codex Med: no raw SyntaxError); an abort DURING the body read is a timeout
        // (Codex closure High: a stalled body must still fail-closed).
        let body: { ok?: boolean; error?: string; ts?: string };
        try {
          body = (await response.json()) as { ok?: boolean; error?: string; ts?: string };
        } catch {
          if (controller.signal.aborted) {
            throw new SlackTransportError("slack_timeout", "Slack chat.postMessage body read timed out");
          }
          throw new SlackTransportError("slack_invalid_json", "Slack chat.postMessage returned unparseable JSON");
        }

        // Trap part 2: HTTP 200 with { ok: false } is STILL a failure. The error code is SANITIZED.
        if (body.ok !== true) {
          throw new SlackTransportError(safeErrorCode(body.error), "Slack chat.postMessage reported a logical failure");
        }

        // Trap part 3: a real Slack success ALWAYS carries ts (the message id). ok:true with no ts is
        // malformed -- do NOT fabricate a ref and claim delivered (Codex Med): throw, fail-closed.
        if (typeof body.ts !== "string" || body.ts.length === 0) {
          throw new SlackTransportError("slack_malformed_success", "Slack chat.postMessage returned ok without a message ts");
        }

        // Success: ts is Slack's message id -> the audit providerRef. delivered:true.
        logger.info(
          {
            event: "action.slack_dispatch",
            actionType: message.actionType,
            channel: message.channel,
            idempotencyKey: message.idempotencyKey,
            delivered: true
          },
          "slack-transport: message delivered"
        );
        return { transport: "slack", providerRef: body.ts, delivered: true };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
