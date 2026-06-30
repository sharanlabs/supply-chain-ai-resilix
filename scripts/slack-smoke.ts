// Live Slack smoke for the Phase-5 transport adapter #1.
//
//   DRY  (default):  node --env-file=.env --import tsx scripts/slack-smoke.ts
//        Derives the real ROLE_OWNER_ALERT (SLACK) action from a real ACT packet and
//        prints the EXACT text that WOULD post. Uses the Noop -- NOTHING is sent.
//
//   SEND (--send):   node --env-file=.env --import tsx scripts/slack-smoke.ts --send
//        Same path, but resolves the transport from transportRegistryFromEnv() and
//        actually posts to your channel via dispatchGovernableAction (the real moat
//        primitive: reserve -> deliver -> finalize EXECUTED/FAILED).
//
// Either mode runs the GENUINE machinery -- only the registry differs.
import { buildDecisionPacket } from "@/lib/pipeline/build-packet";
import { deriveGovernableActions } from "@/lib/server/action-taxonomy";
import {
  __resetExecutedActionsForTest,
  dispatchGovernableAction
} from "@/lib/server/action-executor";
import { NoopTransport, transportRegistryFromEnv } from "@/lib/server/action-transport";

const send = process.argv.includes("--send");

async function main() {
delete process.env.DATABASE_URL; // force the in-memory store -- no Postgres needed for the smoke
__resetExecutedActionsForTest();

const packet = await buildDecisionPacket({ useLiveSignals: false });
console.log(`packet ${packet.id} -> recommendation=${packet.recommendation}`);

const actions = deriveGovernableActions({ ...packet, approvalStatus: "APPROVED" });
const slack = actions.find((a) => a.actionType === "ROLE_OWNER_ALERT" && a.channel === "SLACK");
if (!slack) {
  console.error(
    "No ROLE_OWNER_ALERT/SLACK action on this packet (NO_ACTION packets withhold it). Use an ACT packet."
  );
  process.exit(1);
}

console.log("\nThe SLACK action:");
console.log(
  JSON.stringify({ actionType: slack.actionType, channel: slack.channel, digest: slack.digest }, null, 2)
);
console.log(`\nText that posts:\n:rotating_light: RESILIX ${slack.actionType} (${slack.channel})`);
for (const [k, v] of Object.entries(slack.digest)) console.log(`• ${k}: ${v}`);

if (!send) {
  const row = await dispatchGovernableAction(slack, { registry: { SLACK: NoopTransport } });
  console.log(`\n[DRY] status=${row.status} (Noop: nothing was sent). Re-run with --send to post for real.`);
  process.exit(0);
}

const registry = transportRegistryFromEnv();
if (!registry.SLACK) {
  console.error(
    "\n[SEND] No SLACK transport wired -- SLACK_BOT_TOKEN / SLACK_ALERT_CHANNEL missing from .env."
  );
  process.exit(1);
}
console.log("\n[SEND] Posting for real via transportRegistryFromEnv()...");
const row = await dispatchGovernableAction(slack, { registry });
console.log(`[SEND] status=${row.status}  audit=${row.auditDetail}`);
process.exit(row.status === "EXECUTED" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
