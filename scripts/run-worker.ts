import { loadEnv } from "./load-env";
import { getDb } from "../src/lib/db";
import { processOutbox } from "../src/lib/engine";

loadEnv();

async function main() {
  getDb();
  const outbox = await processOutbox(100);
  console.log(
    `[BillOps] Outbox: ${outbox.processed} processed, ${outbox.sent} sent, ${outbox.failed} failed.`,
  );
}

main().catch((error) => {
  console.error("[BillOps] Email worker failed:", error);
  process.exitCode = 1;
});
