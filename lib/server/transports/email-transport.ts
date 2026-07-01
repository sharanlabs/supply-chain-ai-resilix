import type { ActionTransport, TransportMessage, TransportReceipt } from "@/lib/server/action-transport";
import { logger } from "@/lib/server/logger";
import { MAX_FIELD_LEN, sanitizeText } from "@/lib/signals/sanitize";

// ---------------------------------------------------------------------------
// Phase 5 transport adapter #2: EMAIL via Resend (mechanics-only scope).
//
// What it does: posts a digest-only notification email via Resend's REST API.
// SCOPE NOTE (owner-confirmed 2026-06-30): EMAIL is classified for
// SUPPLIER_EMAIL_SEND / RFQ_DISPATCH (action-taxonomy.ts), but those actions'
// digest is deliberately IDs-only (messageId/supplierId/draftChannel) -- the
// real subject/body prose stays server-side (the quarantine boundary), and no
// recipient address is resolved anywhere yet. So this adapter, like Slack,
// sends the SANITIZED DIGEST to an operator-owned inbox (RESEND_ALERT_EMAIL) --
// it proves the transport mechanics end-to-end; sending the actual drafted
// supplier message is a separate follow-up that extends the digest/lookup
// contract (a quarantine-boundary change, not a transport change).
//
// Design choices (mirrors slack-transport.ts):
//   - RAW fetch, NO SDK. fetchImpl is injected so every test runs with a fake
//     and ZERO network.
//   - DIGEST-ONLY message text, RE-BOUNDED here (sanitizeText on every key/value).
//
// THE FAIL-CLOSED TRAP: unlike Slack (HTTP 200 even on logical failure),
// Resend signals failure honestly via HTTP status with a JSON error body
// (verified against Resend's current API + errors reference, 2026-06-30:
// https://resend.com/docs/api-reference/emails/send-email,
// https://resend.com/docs/api-reference/errors). So deliver() throws on: a
// timeout, a non-2xx status (sanitized error name extracted from the body when
// parseable, else a status-coded fallback), an unparseable body, and a 200
// response missing the documented `id` field (Resend's only success shape is
// `{"id": "<uuid>"}` -- no id means don't trust it, same logic as Slack's
// missing-`ts` case). Every failure path throws; the ONLY return is a genuine
// delivered receipt.
//
// The thrown error's NAME (not message) becomes the audited errorClass
// (action-executor finalizes on error.name) and is LOGGED -- a sanitized,
// length-capped code, never raw Resend body prose, never the API key.
// ---------------------------------------------------------------------------

const RESEND_SEND_URL = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CODE_LEN = 40;

// A typed transport error whose NAME is the audited+logged errorClass. The name is always
// a sanitized, bounded code -- never the API key, never raw provider/body prose.
export class EmailTransportError extends Error {
  constructor(errorClass: string, humanReason: string) {
    super(humanReason);
    this.name = errorClass;
  }
}

// Sanitize an untrusted Resend error `name` into a stable, bounded errorClass code. Resend's
// documented names are snake_case (e.g. "validation_error"), but the value is
// provider-controlled and is PERSISTED+LOGGED as errorClass, so we strip to [a-z0-9_], cap
// the length, and map anything empty/odd to email_unknown.
function safeErrorCode(raw: unknown, fallbackStatus: number): string {
  if (typeof raw !== "string") return `email_http_${fallbackStatus}`;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, MAX_ERROR_CODE_LEN);
  return cleaned.length > 0 ? `email_${cleaned}` : `email_http_${fallbackStatus}`;
}

export type EmailTransportConfig = {
  apiKey: string;
  // Verified Resend sender, e.g. "RESILIX Alerts <alerts@yourdomain.com>".
  fromEmail: string;
  // The operator-owned inbox this digest notification goes to (mechanics-only
  // scope -- see file header; not a real supplier recipient).
  toEmail: string;
  // Injected for tests; defaults to the global fetch in production.
  fetchImpl?: typeof fetch;
  // Hard timeout for the Resend call. Defaults to 10s; a hung call must reach FAILED, not stall.
  timeoutMs?: number;
};

// Build the email subject + plain-text body from the digest ALONE, sanitizing each field
// (control-strip + length cap). Mirrors slack-transport.ts's digestToText.
function digestToSubject(message: TransportMessage): string {
  return sanitizeText(`RESILIX ${message.actionType} (${message.channel})`, MAX_FIELD_LEN);
}

function digestToText(message: TransportMessage): string {
  const lines = Object.entries(message.digest).map(
    ([key, value]) => `- ${sanitizeText(key, MAX_FIELD_LEN)}: ${sanitizeText(String(value), MAX_FIELD_LEN)}`
  );
  return [digestToSubject(message), ...lines].join("\n");
}

export function createEmailTransport(config: EmailTransportConfig): ActionTransport {
  const doFetch = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: "email",
    async deliver(message: TransportMessage): Promise<TransportReceipt> {
      // Hard timeout spanning the ENTIRE call -- the fetch AND the body read, mirroring
      // slack-transport.ts. Any abort -> email_timeout -> FAILED; deliver() never blocks
      // dispatchAndFinalize.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response: Response;
        try {
          response = await doFetch(RESEND_SEND_URL, {
            method: "POST",
            headers: {
              // The key is sent ONLY in the Authorization header -- never logged, never in an error.
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json; charset=utf-8",
              // Resend-native dedup: a retry of the SAME logical action reuses the same key,
              // so a stranded/retried dispatch cannot double-send (Resend dedupes for 24h).
              "Idempotency-Key": message.idempotencyKey
            },
            body: JSON.stringify({
              from: config.fromEmail,
              to: config.toEmail,
              subject: digestToSubject(message),
              text: digestToText(message)
            }),
            signal: controller.signal
          });
        } catch {
          if (controller.signal.aborted) {
            throw new EmailTransportError("email_timeout", "Resend send timed out");
          }
          // A network/transport error -> stable class (no key/prose in the error).
          throw new EmailTransportError("email_network_error", "Resend send network error");
        }

        // Trap part 1: a non-2xx HTTP status is a hard failure (fail-closed). Resend signals
        // failure honestly via status, so this -- unlike Slack -- IS the primary failure path.
        if (!response.ok) {
          let body: { name?: string } = {};
          try {
            body = (await response.json()) as { name?: string };
          } catch {
            // Body unreadable/not JSON -- fall through with the status-coded class below.
          }
          if (controller.signal.aborted) {
            throw new EmailTransportError("email_timeout", "Resend send body read timed out");
          }
          throw new EmailTransportError(
            safeErrorCode(body.name, response.status),
            `Resend send returned HTTP ${response.status}`
          );
        }

        // Parse the success body (still under the timeout). A parse failure is classified
        // stably; an abort DURING the body read is a timeout, not a parse error.
        let body: { id?: string };
        try {
          body = (await response.json()) as { id?: string };
        } catch {
          if (controller.signal.aborted) {
            throw new EmailTransportError("email_timeout", "Resend send body read timed out");
          }
          throw new EmailTransportError("email_invalid_json", "Resend send returned unparseable JSON");
        }

        // Trap part 2: a real Resend success ALWAYS carries id. 200 with no id is malformed --
        // do NOT fabricate a ref and claim delivered: throw, fail-closed.
        if (typeof body.id !== "string" || body.id.length === 0) {
          throw new EmailTransportError("email_malformed_success", "Resend send returned ok without an id");
        }

        // Success: id is Resend's message id -> the audit providerRef. delivered:true.
        logger.info(
          {
            event: "action.email_dispatch",
            actionType: message.actionType,
            channel: message.channel,
            idempotencyKey: message.idempotencyKey,
            delivered: true
          },
          "email-transport: message delivered"
        );
        return { transport: "email", providerRef: body.id, delivered: true };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
