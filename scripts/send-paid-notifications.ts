import { loadEnv } from "./load-env";
import { all, exec, getDb, transaction } from "../src/lib/db";
import { currentMonthKey, formatMonth } from "../src/lib/dates";
import { processOutbox } from "../src/lib/engine";
import { queuePaidConfirmationNotifications } from "../src/lib/notify";
import type { Bill, BillCycle } from "../src/lib/types";

loadEnv();

const AUDIENCE = ["sandeep.lohani@doubletick.io", "nishant@quicksell.co"];

async function main() {
  const monthArg = process.argv[2];
  const month = /^\d{4}-\d{2}$/.test(monthArg ?? "") ? (monthArg as string) : currentMonthKey();
  const confirm = process.argv.includes("--confirm");
  const pendingBills = (process.env.BILLOPS_PENDING_BILLS || "NetworkTech Lab")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  getDb();

  const cycles = all<BillCycle>(
    `SELECT * FROM bill_cycles WHERE billing_month = ? AND payment_status = 'paid' ORDER BY id`,
    month,
  );
  const bills = new Map(
    all<Bill>(`SELECT * FROM bills`).map((bill) => [bill.id, bill]),
  );

  const targets = cycles.filter((cycle) => {
    const bill = bills.get(cycle.bill_id);
    return bill && !pendingBills.includes(bill.name.trim().toLowerCase());
  });

  console.log(`[BillOps] Paid notifications for ${formatMonth(month)}`);
  console.log(
    `[BillOps] Paid cycles: ${cycles.length}; notifying for ${targets.length} (excluding ${pendingBills.join(", ") || "none"})`,
  );
  for (const cycle of targets) {
    console.log(`  - ${bills.get(cycle.bill_id)?.name} (cycle ${cycle.id})`);
  }
  console.log(`[BillOps] Paid audience: ${AUDIENCE.join(", ")}`);

  if (!confirm) {
    console.log("[BillOps] Dry run. Re-run with --confirm to queue and send.");
    return;
  }

  let queued = 0;
  transaction(() => {
    const others = all<{ id: number }>(
      `SELECT id FROM bill_recipients
        WHERE receive_paid = 1 AND email NOT IN (?, ?)`,
      ...AUDIENCE,
    ).map((row) => row.id);
    const placeholders = others.map(() => "?").join(",");
    try {
      if (others.length) {
        exec(`UPDATE bill_recipients SET receive_paid = 0 WHERE id IN (${placeholders})`, ...others);
      }

      for (const cycle of targets) {
        const bill = bills.get(cycle.bill_id);
        if (!bill) continue;
        exec(
          `DELETE FROM notification_outbox
            WHERE bill_cycle_id = ? AND event_type = 'payment_paid' AND recipient_email IN (?, ?)`,
          cycle.id,
          ...AUDIENCE,
        );
        queued += queuePaidConfirmationNotifications({ cycle, bill });
      }
    } finally {
      if (others.length) {
        exec(`UPDATE bill_recipients SET receive_paid = 1 WHERE id IN (${placeholders})`, ...others);
      }
    }
  });

  console.log(`[BillOps] Queued paid confirmations: ${queued}`);
  const result = await processOutbox(500);
  console.log(
    `[BillOps] Outbox processed=${result.processed} sent=${result.sent} failed=${result.failed}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
