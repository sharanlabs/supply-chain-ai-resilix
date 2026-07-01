import type { ActionChannel, GovernableActionType } from "@/lib/schemas";
import { logger } from "@/lib/server/logger";
import { createSlackTransport } from "@/lib/server/transports/slack-transport";
import { createEmailTransport } from "@/lib/server/transports/email-transport";
import { createN8nTransport } from "@/lib/server/transports/n8n-transport";

// ---------------------------------------------------------------------------
// Phase 5 -- the executor's TRANSPORT PORT (hexagonal): the seam between the
// governed-execution core and the outside world. The core depends ONLY on this
// interface; concrete adapters (the enterprise path) are pluggable behind it:
//   - SLACK  -> Slack Web API (free; interactive approval buttons)   [enterprise]
//   - EMAIL  -> Resend (free 3k/mo, wired -- mechanics-only/digest-to-operator
//               scope, see email-transport.ts); SES is the enterprise path
//   - N8N    -> an n8n webhook (OSS self-host, wired -- see n8n-transport.ts) that
//               fires an ERP exception case; managed n8n is the enterprise path.
//               n8n stays DOWNSTREAM of the in-app gate -- it executes already-
//               approved actions, never authorizes (AGENTS.md:30, reconciled).
//   - TICKET/INTERNAL -> in-app ticket/log sinks.
//
// SAFETY INVARIANT: the DEFAULT transport is the NoopTransport -- it LOGS and never
// performs a real outward send. A real transport is wired in by the operator at
// runtime (a later, owner-gated step); it is NEVER the default, so neither a test
// nor a default-config deployment can fire a real Slack/email/n8n/ERP call. Tests
// inject a fake. No real Slack/email/n8n SDK is a dependency of this module.
// ---------------------------------------------------------------------------

// What the dispatcher hands a transport: a SANITIZED digest only (IDs/enums/numbers)
// -- never raw supplier or news prose (the quarantine extends to transports, NEW-1).
export type TransportMessage = {
  idempotencyKey: string;
  actionType: GovernableActionType;
  channel: ActionChannel;
  digest: Record<string, string | number>;
};

export type TransportReceipt = {
  // Which transport handled the message (e.g. "noop", "slack").
  transport: string;
  // A provider reference for the audit trail (synthetic for noop).
  providerRef: string;
  // Whether a REAL outward delivery occurred. The Noop returns false: it logs but
  // does not send, so an audit reader can see the action was governed-but-not-sent.
  delivered: boolean;
};

// The driven port. A transport either returns a receipt (delivered or noop-logged)
// or THROWS -- a throw is the fail-closed signal the executor records as FAILED.
export interface ActionTransport {
  readonly name: string;
  deliver(message: TransportMessage): Promise<TransportReceipt>;
}

// The safe default. Logs a redacted record (the pino logger redacts secrets by
// construction) and returns delivered:false. NEVER performs a network call.
export const NoopTransport: ActionTransport = {
  name: "noop",
  async deliver(message: TransportMessage): Promise<TransportReceipt> {
    logger.info(
      {
        event: "action.noop_dispatch",
        actionType: message.actionType,
        channel: message.channel,
        idempotencyKey: message.idempotencyKey
      },
      "action-transport: NoopTransport logged (no real send)"
    );
    return {
      transport: "noop",
      providerRef: `noop-${message.idempotencyKey}`,
      delivered: false
    };
  }
};

// A channel -> transport map. A channel with no entry falls back to the Noop.
export type TransportRegistry = Partial<Record<ActionChannel, ActionTransport>>;

// The default registry: EMPTY, so every channel resolves to the NoopTransport. This
// is what the route uses -- no real send is ever wired by default. The operator
// constructs a populated registry at runtime to enable real transports.
export function defaultTransportRegistry(): TransportRegistry {
  return {};
}

// The OPERATOR wiring point: build the registry from environment. A real transport is
// included ONLY when its per-channel credentials are present -- otherwise the channel
// stays on the NoopTransport. This is what makes "nothing sends unless an operator
// wires it" literally true: with no keys set this returns {} (identical to the default),
// so a default deployment and the whole test suite never construct a real sender.
//
// SLACK: included only when BOTH SLACK_BOT_TOKEN and SLACK_ALERT_CHANNEL are set.
// EMAIL: included only when ALL of RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_ALERT_EMAIL
// are set (mechanics-only scope -- see email-transport.ts header; sends a digest
// notification to the operator's own inbox, not a real supplier recipient).
// N8N: included only when N8N_ERP_WEBHOOK_URL is set. Header auth
// (N8N_ERP_WEBHOOK_HEADER_NAME/VALUE) is optional but BOTH-OR-NEITHER -- n8n's
// Header Auth lets the operator pick both the header name AND value (no standard
// scheme like Slack/Resend's Authorization: Bearer), so a partial pair is a
// misconfiguration; fail closed by NOT wiring N8N rather than sending unauthenticated
// or guessing which half is missing. Deliberately DISTINCT env names from the legacy
// N8N_APPROVAL_WEBHOOK_URL/N8N_CALLBACK_SECRET (the predecessor's inbound callback
// path, AGENTS.md:37, do-not-extend) -- this is a separate, new outbound integration.
export function transportRegistryFromEnv(
  env: Record<string, string | undefined> = process.env
): TransportRegistry {
  const registry: TransportRegistry = {};
  const slackToken = env.SLACK_BOT_TOKEN?.trim();
  const slackChannel = env.SLACK_ALERT_CHANNEL?.trim();
  if (slackToken && slackChannel) {
    registry.SLACK = createSlackTransport({ botToken: slackToken, channel: slackChannel });
  }
  const resendApiKey = env.RESEND_API_KEY?.trim();
  const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();
  const resendAlertEmail = env.RESEND_ALERT_EMAIL?.trim();
  if (resendApiKey && resendFromEmail && resendAlertEmail) {
    registry.EMAIL = createEmailTransport({
      apiKey: resendApiKey,
      fromEmail: resendFromEmail,
      toEmail: resendAlertEmail
    });
  }
  const n8nWebhookUrl = env.N8N_ERP_WEBHOOK_URL?.trim();
  const n8nHeaderName = env.N8N_ERP_WEBHOOK_HEADER_NAME?.trim();
  const n8nHeaderValue = env.N8N_ERP_WEBHOOK_HEADER_VALUE?.trim();
  const n8nHeaderPairValid = Boolean(n8nHeaderName) === Boolean(n8nHeaderValue);
  if (n8nWebhookUrl && n8nHeaderPairValid) {
    registry.N8N = createN8nTransport({
      webhookUrl: n8nWebhookUrl,
      headerName: n8nHeaderName || undefined,
      headerValue: n8nHeaderValue || undefined
    });
  }
  return registry;
}

// Resolve the transport for a channel, defaulting to Noop. This is the fail-safe:
// an unconfigured channel logs-not-sends rather than erroring or sending blindly.
export function resolveTransport(
  channel: ActionChannel,
  registry: TransportRegistry = defaultTransportRegistry()
): ActionTransport {
  return registry[channel] ?? NoopTransport;
}
