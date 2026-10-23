import { loadEnv } from "./load-env";
import { all, exec, getDb } from "../src/lib/db";
import { currentMonthKey, dateForDay, formatMonth } from "../src/lib/dates";

loadEnv();

type BillRow = {
  id: number;
  name: string;
  arrival_end_day: number;
  payment_target_day: number;
};

type CycleRow = {
  id: number;
  bill_id: number;
  invoice_status: string;
  approval_status: string;
  payment_status: string;
};

function main() {
  const arg = process.argv[2];
  const month = /^\d{4}-\d{2}$/.test(arg ?? "") ? (arg as string) : currentMonthKey();
  const actor = process.env.BILLOPS_PAID_BY || "Sandeep Lohani";

  getDb();

  const cycles = all<CycleRow>(
    `SELECT id, bill_id, invoice_status, approval_status, payment_status
       FROM bill_cycles
      WHERE billing_month = ?
      ORDER BY id`,
    month,
  );

  if (cycles.length === 0) {
    console.log(`[BillOps] No cycles found for ${month}. Nothing to mark paid.`);
    return;
  }

  const billById = new Map(
    all<BillRow>(
      "SELECT id, name, arrival_end_day, payment_target_day FROM bills",
    ).map((bill) => [bill.id, bill]),
  );

  const reference = `PAID-${month}`;
  const monthLabel = formatMonth(month);
  let marked = 0;
  let already = 0;
  let suppressed = 0;

  for (const cycle of cycles) {
    const bill = billById.get(cycle.bill_id);
    if (!bill) continue;

    const targetState =
      cycle.invoice_status === "received" &&
      cycle.approval_status === "approved" &&
      cycle.payment_status === "paid";

    const paymentDate = dateForDay(month, bill.payment_target_day);
    const receivedAt = dateForDay(month, bill.arrival_end_day);
    const approvedAt = `${paymentDate}T09:00:00.000Z`;

    exec(
      `UPDATE bill_cycles
          SET invoice_status = 'received', approval_status = 'approved', payment_status = 'paid',
              invoice_received_at = ?, approved_by = ?, approved_at = ?, approval_note = NULL,
              payment_date = ?, payment_reference = ?, updated_at = datetime('now')
        WHERE id = ?`,
      receivedAt,
      actor,
      approvedAt,
      paymentDate,
      reference,
      cycle.id,
    );

    if (targetState) {
      already += 1;
    } else {
      exec(
        `INSERT INTO status_history (
           bill_cycle_id, previous_invoice_status, new_invoice_status,
           previous_approval_status, new_approval_status,
           previous_payment_status, new_payment_status, changed_by, change_note
         ) VALUES (?, ?, 'received', ?, 'approved', ?, 'paid', ?, ?)`,
        cycle.id,
        cycle.invoice_status,
        cycle.approval_status,
        cycle.payment_status,
        actor,
        `Backfilled as paid on time for ${monthLabel}`,
      );

      marked += 1;
    }

    exec(
      `UPDATE notification_outbox
          SET status = 'cancelled', next_attempt_at = NULL,
              last_error = 'Cancelled because the payment was marked paid'
        WHERE bill_cycle_id = ? AND status = 'pending'
          AND event_type IN ('payment_reminder', 'overdue_reminder', 'payment_paid')`,
      cycle.id,
    );

    const rules = all<{ id: number }>(
      `SELECT id FROM reminder_rules
        WHERE bill_id = ? AND rule_type = 'payment_paid' AND is_active = 1`,
      cycle.bill_id,
    );
    const recipients = all<{ id: number; email: string; recipient_type: string }>(
      `SELECT id, email, recipient_type FROM bill_recipients
        WHERE bill_id = ? AND is_active = 1 AND receive_paid = 1`,
      cycle.bill_id,
    );

    for (const rule of rules) {
      for (const recipient of recipients) {
        const key = `cycle-${cycle.id}-rule-${rule.id}-paid-r${recipient.id}`;
        const result = exec(
          `INSERT OR IGNORE INTO notification_outbox (
             bill_cycle_id, bill_id, rule_id, event_type, recipient_email, recipient_type,
             subject, payload, idempotency_key, status, last_error
           ) VALUES (?, ?, ?, 'payment_paid', ?, ?, ?, '{}', ?, 'cancelled', ?)`,
          cycle.id,
          cycle.bill_id,
          rule.id,
          recipient.email,
          recipient.recipient_type,
          `[BillOps] Payment completed: ${bill.name} — ${monthLabel}`,
          key,
          "Suppressed: historical backfill",
        );
        suppressed += result.changes;
      }
    }
  }

  console.log(`[BillOps] Marked ${marked} cycle(s) as paid on time for ${month}.`);
  if (already > 0) {
    console.log(`[BillOps] ${already} cycle(s) already paid — left unchanged.`);
  }
  console.log(`[BillOps] Suppressed ${suppressed} payment-completion email(s).`);
  console.log(`[BillOps] Reference: ${reference} · Recorded by: ${actor}`);
}

main();
