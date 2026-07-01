// Live Resend smoke for the Phase-5 transport adapter #2 (EMAIL).
//
//   DRY  (default):  node --env-file=.env --import tsx scripts/email-smoke.ts
//        Derives a real SUPPLIER_EMAIL_SEND (EMAIL) action from a real ACT packet and
//        prints the EXACT digest text that WOULD send. Uses the Noop -- NOTHING is sent.
//
//   SEND (--send):   node --env-file=.env --import tsx scripts/email-smoke.ts --send
//        Resolves the transport from transportRegistryFromEnv() and sends a SYNTHETIC
//        smoke message via the GENUINE adapter -- deliberately NOT the real derived
//        SUPPLIER_EMAIL_SEND action (Codex review finding, fixed 2026-06-30: sending the
//        real governed action's digest/idempotencyKey here would be a live-send path for
//        an IRREVERSIBLE, audited action type outside the executor moat and audit trail
//        -- dispatchGovernableAction REFUSES any non-REVERSIBLE action by design, and
//        EMAIL has no auto-fire moat path -- intentionally not built. So --send proves
//        ONLY the Resend transport mechanics, structurally distinct from a real dispatch).
//
// DRY mode still prints the REAL derived action (informational) so the digest the real
// pipeline would send is visible; --send never transmits it.
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { deriveGovernableActions } from "@/lib/server/action-taxonomy";
import { NoopTransport, transportRegistryFromEnv } from "@/lib/server/action-transport";

const send = process.argv.includes("--send");

async function main() {
delete process.env.DATABASE_URL; // force the in-memory store -- no Postgres needed for the smoke

const packet = await buildDecisionPacket({ useLiveSignals: false });
console.log(`packet ${packet.id} -> recommendation=${packet.recommendation}`);

const actions = deriveGovernableActions({ ...packet, approvalStatus: "APPROVED" });
const email = actions.find((a) => a.actionType === "SUPPLIER_EMAIL_SEND" && a.channel === "EMAIL");
if (!email) {
  console.error(
    "No SUPPLIER_EMAIL_SEND/EMAIL action on this packet (NO_ACTION packets withhold it, or no supplier messages were drafted). Use an ACT packet."
  );
  process.exit(1);
}

console.log("\nThe EMAIL action:");
console.log(
  JSON.stringify({ actionType: email.actionType, channel: email.channel, digest: email.digest }, null, 2)
);
console.log(`\nText that the REAL pipeline would send (digest-only, mechanics-only scope -- see email-transport.ts header):`);
console.log(`RESILIX ${email.actionType} (${email.channel})`);
for (const [k, v] of Object.entries(email.digest)) console.log(`- ${k}: ${v}`);

if (!send) {
  const message = {
    idempotencyKey: email.idempotencyKey,
    actionType: email.actionType,
    channel: email.channel,
    digest: email.digest
  };
  const receipt = await NoopTransport.deliver(message);
  console.log(`\n[DRY] delivered=${receipt.delivered} (Noop: nothing was sent). Re-run with --send to send for real.`);
  process.exit(0);
}

const registry = transportRegistryFromEnv();
if (!registry.EMAIL) {
  console.error(
    "\n[SEND] No EMAIL transport wired -- RESEND_API_KEY / RESEND_FROM_EMAIL / RESEND_ALERT_EMAIL missing from .env."
  );
  process.exit(1);
}
// SYNTHETIC smoke message -- NOT email.idempotencyKey/email.digest (the real, audited
// SUPPLIER_EMAIL_SEND action printed above). Sending the real one here would be a live
// dispatch of an irreversible governed action with no executor reservation, no
// finalized row, and no audit trail -- exactly the hole this smoke must not open.
const smokeMessage = {
  idempotencyKey: `SMOKE:email-transport:${Date.now()}`,
  actionType: email.actionType,
  channel: email.channel,
  digest: { smokeTest: "true", source: "email-smoke.ts" }
};
console.log("\n[SEND] Sending a SYNTHETIC smoke message for real via transportRegistryFromEnv() (transport mechanics only, not the real action above)...");
const receipt = await registry.EMAIL.deliver(smokeMessage);
console.log(`[SEND] delivered=${receipt.delivered}  providerRef=${receipt.providerRef}`);
process.exit(receipt.delivered ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
