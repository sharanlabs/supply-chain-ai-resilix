// Live n8n smoke for the Phase-5 transport adapter #3 (N8N).
//
//   DRY  (default):  node --env-file=.env --import tsx scripts/n8n-smoke.ts
//        Prints the SYNTHETIC ERP_CASE message this smoke would send. Uses the Noop --
//        NOTHING is sent. (Unlike Slack/Email, there is no REAL derived ERP_CASE action
//        to print here -- deriveGovernableActions() never produces one; ERP integration
//        is out of MVP scope, action-taxonomy.ts / PLAN.md anti-scope. So DRY mode has
//        no "real action" section the way slack-smoke.ts / email-smoke.ts do.)
//
//   SEND (--send):   node --env-file=.env --import tsx scripts/n8n-smoke.ts --send
//        Resolves the transport from transportRegistryFromEnv() and POSTs the same
//        synthetic message for real to your configured n8n Webhook-trigger URL.
//
// Either mode runs the GENUINE adapter -- only the registry differs.
import { NoopTransport, transportRegistryFromEnv } from "@/lib/server/action-transport";

const send = process.argv.includes("--send");

const message = {
  idempotencyKey: `SMOKE:n8n-transport:${Date.now()}`,
  actionType: "ERP_CASE" as const,
  channel: "N8N" as const,
  digest: { smokeTest: "true", source: "n8n-smoke.ts" }
};

async function main() {
  console.log("The SYNTHETIC N8N smoke message:");
  console.log(JSON.stringify(message, null, 2));

  if (!send) {
    const receipt = await NoopTransport.deliver(message);
    console.log(`\n[DRY] delivered=${receipt.delivered} (Noop: nothing was sent). Re-run with --send to send for real.`);
    process.exit(0);
  }

  const registry = transportRegistryFromEnv();
  if (!registry.N8N) {
    console.error(
      "\n[SEND] No N8N transport wired -- N8N_ERP_WEBHOOK_URL missing from .env (or only ONE of " +
        "N8N_ERP_WEBHOOK_HEADER_NAME/VALUE is set -- that pair is both-or-neither)."
    );
    process.exit(1);
  }
  console.log("\n[SEND] Posting for real via transportRegistryFromEnv()...");
  const receipt = await registry.N8N.deliver(message);
  console.log(`[SEND] delivered=${receipt.delivered}  providerRef=${receipt.providerRef}`);
  process.exit(receipt.delivered ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
