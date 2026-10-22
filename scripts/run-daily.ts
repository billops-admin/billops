import { loadEnv } from "./load-env";
import { getDb } from "../src/lib/db";
import { processOutbox, runDailyEngine } from "../src/lib/engine";

loadEnv();

async function main() {
  getDb();
  const engine = runDailyEngine();
  console.log(
    `[BillOps] ${engine.month}: ${engine.cyclesCreated} cycle(s) created, ${engine.remindersCreated} reminder(s) queued, ${engine.skipped} skipped.`,
  );

  const outbox = await processOutbox(100);
  console.log(
    `[BillOps] Outbox: ${outbox.processed} processed, ${outbox.sent} sent, ${outbox.failed} failed.`,
  );
}

main().catch((error) => {
  console.error("[BillOps] Daily run failed:", error);
  process.exitCode = 1;
});
