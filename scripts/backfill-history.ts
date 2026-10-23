import { loadEnv } from "./load-env";
import { all, exec, getDb, transaction } from "../src/lib/db";
import {
  addMonths,
  compareIso,
  currentMonthKey,
  dateForDay,
  formatMonth,
} from "../src/lib/dates";
import { ensureCycles } from "../src/lib/engine";

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
  billing_month: string;
  invoice_status: string;
  approval_status: string;
  payment_status: string;
};

function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let key = from; compareIso(key, to) <= 0; key = addMonths(key, 1)) {
    months.push(key);
  }
  return months;
}

function main() {
  const fromArg = process.argv[2];
  const toArg = process.argv[3];
  const from = /^\d{4}-\d{2}$/.test(fromArg ?? "") ? (fromArg as string) : "2026-08";
  const to = /^\d{4}-\d{2}$/.test(toArg ?? "") ? (toArg as string) : currentMonthKey();
  const actor = process.env.BILLOPS_PAID_BY || "Sandeep Lohani";
  const pendingBills = (process.env.BILLOPS_PENDING_BILLS || "NetworkTech Lab")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  getDb();

  const billById = new Map(
    all<BillRow>(
      "SELECT id, name, arrival_end_day, payment_target_day FROM bills",
    ).map((bill) => [bill.id, bill]),
  );

  let created = 0;
  let paid = 0;
  let keptPending = 0;
  let suppressed = 0;

  transaction(() => {
    for (const month of monthRange(from, to)) {
      created += ensureCycles(month);

      const cycles = all<CycleRow>(
        `SELECT id, bill_id, billing_month, invoice_status, approval_status, payment_status
           FROM bill_cycles
          WHERE billing_month = ?
          ORDER BY id`,
        month,
      );

      for (const cycle of cycles) {
        const bill = billById.get(cycle.bill_id);
        if (!bill) continue;

        const isPending = pendingBills.includes(bill.name.trim().toLowerCase());

        if (isPending) {
          exec(
            `UPDATE bill_cycles
                SET invoice_status = 'awaiting', approval_status = 'pending', payment_status = 'pending',
                    invoice_received_at = NULL, approved_by = NULL, approved_at = NULL,
                    approval_note = NULL, payment_date = NULL, payment_reference = NULL,
                    updated_at = datetime('now')
              WHERE id = ?`,
            cycle.id,
          );
          exec(
            `DELETE FROM status_history
              WHERE bill_cycle_id = ? AND change_note LIKE 'Backfilled as paid on time%'`,
            cycle.id,
          );
          exec(
            `DELETE FROM notification_outbox
              WHERE bill_cycle_id = ? AND last_error = 'Suppressed: historical backfill'`,
            cycle.id,
          );
          exec(
            `UPDATE notification_outbox
                SET status = 'cancelled', next_attempt_at = NULL,
                    last_error = 'Cancelled: bill is still awaiting its invoice'
              WHERE bill_cycle_id = ? AND status = 'pending'
                AND event_type IN ('payment_reminder', 'overdue_reminder', 'payment_paid',
                                   'approval_request', 'approval_approved')`,
            cycle.id,
          );
          keptPending += 1;
          continue;
        }

        const targetState =
          cycle.invoice_status === "received" &&
          cycle.approval_status === "approved" &&
          cycle.payment_status === "paid";
        const paymentDate = dateForDay(month, bill.payment_target_day);
        const receivedAt = dateForDay(month, bill.arrival_end_day);
        const approvedAt = `${paymentDate}T09:00:00.000Z`;
        const reference = `PAID-${month}`;

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

        if (!targetState) {
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
            `Backfilled as paid on time for ${formatMonth(month)}`,
          );
          paid += 1;
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
              `[BillOps] Payment completed: ${bill.name} — ${formatMonth(month)}`,
              key,
              "Suppressed: historical backfill",
            );
            suppressed += result.changes;
          }
        }
      }
    }
  });

  console.log(`[BillOps] History backfill ${from} → ${to}`);
  console.log(`[BillOps] Cycles created: ${created}`);
  console.log(`[BillOps] Cycles marked paid on time: ${paid}`);
  console.log(
    `[BillOps] Cycles kept awaiting invoice (${pendingBills.join(", ")}): ${keptPending}`,
  );
  console.log(`[BillOps] Payment-completion emails suppressed: ${suppressed}`);
}

main();
