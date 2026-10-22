import { all, exec, one } from "./db";
import {
  addDaysIso,
  addMonths,
  compareIso,
  currentMonthKey,
  dateForDay,
  formatDate,
  formatMonth,
  zonedToday,
} from "./dates";
import { sendEmail } from "./email";
import {
  cancelPendingPaymentReminders,
  queuePaidConfirmationNotifications,
} from "./notify";
import type {
  Bill,
  BillCycle,
  BillRecipient,
  OutboxRow,
  ReminderRule,
  ReminderRuleType,
} from "./types";

export type EngineSummary = {
  month: string;
  cyclesCreated: number;
  remindersCreated: number;
  skipped: number;
};

export type OutboxSummary = {
  processed: number;
  sent: number;
  failed: number;
};

export function ensureCycles(monthKey = currentMonthKey()): number {
  const bills = all<Bill>(
    "SELECT * FROM bills WHERE is_active = 1 AND status = 'active' ORDER BY id",
  );

  let created = 0;
  for (const bill of bills) {
    const result = exec(
      "INSERT OR IGNORE INTO bill_cycles (bill_id, billing_month, approval_status) VALUES (?, ?, 'pending')",
      bill.id,
      monthKey,
    );
    created += result.changes;
  }
  return created;
}

export function scheduledDateForRule(
  rule: ReminderRule,
  bill: Bill,
  monthKey: string,
): string | null {
  if (rule.day_of_month != null) {
    return dateForDay(monthKey, rule.day_of_month);
  }

  if (rule.offset_days != null && rule.anchor) {
    const anchorDay =
      rule.anchor === "arrival_end"
        ? bill.arrival_end_day
        : rule.anchor === "payment_target"
          ? bill.payment_target_day
          : bill.payment_deadline_day;
    return addDaysIso(dateForDay(monthKey, anchorDay), rule.offset_days);
  }

  return null;
}

function reminderEvent(
  ruleType: ReminderRuleType,
  cycle: BillCycle,
  bill: Bill,
  monthKey: string,
  todayIso: string,
): "invoice_reminder" | "payment_reminder" | "overdue_reminder" | null {
  if (ruleType === "invoice_arrival") {
    return cycle.invoice_status === "awaiting" ? "invoice_reminder" : null;
  }

  if (ruleType === "payment_pending") {
    return cycle.payment_status === "pending" ? "payment_reminder" : null;
  }

  if (ruleType === "overdue") {
    if (cycle.payment_status !== "pending") return null;
    const deadline = dateForDay(monthKey, bill.payment_deadline_day);
    return compareIso(todayIso, deadline) > 0 ? "overdue_reminder" : null;
  }

  return null;
}

function reminderCopy(params: {
  event: "invoice_reminder" | "payment_reminder" | "overdue_reminder";
  bill: Bill;
  cycle: BillCycle;
  monthKey: string;
  todayIso: string;
}): { subject: string; body: string } {
  const { event, bill, cycle, monthKey, todayIso } = params;
  const month = formatMonth(monthKey);
  const arrival = `${formatDate(
    dateForDay(monthKey, bill.arrival_start_day),
  )} – ${formatDate(dateForDay(monthKey, bill.arrival_end_day))}`;
  const target = formatDate(dateForDay(monthKey, bill.payment_target_day));
  const deadline = formatDate(dateForDay(monthKey, bill.payment_deadline_day));

  const common = [
    "Hello,",
    "",
    "This is an automated reminder from BillOps.",
    "",
    `Bill: ${bill.name}`,
    `Provider: ${bill.provider}`,
    `Category: ${bill.category}`,
    `Cycle: ${month}`,
    `Invoice status: ${cycle.invoice_status.replace(/_/g, " ")}`,
    `Approval status: ${cycle.approval_status.replace(/_/g, " ")}`,
    `Payment status: ${cycle.payment_status.replace(/_/g, " ")}`,
    `Expected arrival: ${arrival}`,
    `Internal payment target: ${target}`,
    `Final deadline: ${deadline}`,
    "",
  ];

  if (event === "invoice_reminder") {
    return {
      subject: `[BillOps] Invoice awaited: ${bill.name} — ${month}`,
      body: [
        ...common,
        `The invoice for ${bill.name} has not been marked as received yet.`,
        "Please confirm with the provider or update the invoice status in BillOps.",
        "",
        "This is an automated reminder from BillOps.",
      ].join("\n"),
    };
  }

  if (event === "overdue_reminder") {
    const deadlineIso = dateForDay(monthKey, bill.payment_deadline_day);
    const days = Math.max(
      1,
      Math.round(
        (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${deadlineIso}T00:00:00Z`)) /
          86_400_000,
      ),
    );
    return {
      subject: `[BillOps] OVERDUE: ${bill.name} payment was due ${deadline}`,
      body: [
        ...common,
        `This payment is overdue by ${days} day${days === 1 ? "" : "s"}.`,
        "Please pay immediately or mark the bill as on hold with a note.",
        "",
        "This is an automated escalation from BillOps.",
      ].join("\n"),
    };
  }

  return {
    subject: `[BillOps] Payment pending: ${bill.name} — ${month}`,
    body: [
      ...common,
      `The payment for ${bill.name} is still pending. The final deadline is ${deadline}.`,
      "Please complete the payment and record the reference in BillOps.",
      "",
      "This is an automated reminder from BillOps.",
    ].join("\n"),
  };
}

export function runDailyEngine(now = new Date()): EngineSummary {
  const today = zonedToday(undefined, now);
  const month = today.monthKey;
  const cyclesCreated = ensureCycles(month);

  const bills = all<Bill>(
    "SELECT * FROM bills WHERE is_active = 1 AND status = 'active' ORDER BY id",
  );

  let remindersCreated = 0;
  let skipped = 0;

  for (const bill of bills) {
    const cycle = one<BillCycle>(
      "SELECT * FROM bill_cycles WHERE bill_id = ? AND billing_month = ?",
      bill.id,
      month,
    );
    if (!cycle) continue;

    const approverCount = one<{ count: number }>(
      `SELECT COUNT(*) AS count FROM bill_recipients
        WHERE bill_id = ? AND is_active = 1 AND receive_approval = 1`,
      bill.id,
    );
    const approvalRequired = Number(approverCount?.count ?? 0) > 0;
    const paymentApproved = !approvalRequired || cycle.approval_status === "approved";

    if (cycle.payment_status === "paid") {
      cancelPendingPaymentReminders(cycle.id);
      remindersCreated += queuePaidConfirmationNotifications({ cycle, bill });
    }

    const rules = all<ReminderRule>(
      "SELECT * FROM reminder_rules WHERE bill_id = ? AND is_active = 1 ORDER BY id",
      bill.id,
    );

    for (const rule of rules) {
      if (rule.rule_type === "payment_paid") continue;

      const scheduled = scheduledDateForRule(rule, bill, month);
      if (!scheduled) continue;
      if (compareIso(scheduled, today.iso) > 0) continue;

      const event = reminderEvent(rule.rule_type, cycle, bill, month, today.iso);
      if (!event) {
        skipped += 1;
        continue;
      }

      if (
        !paymentApproved &&
        (event === "payment_reminder" || event === "overdue_reminder")
      ) {
        skipped += 1;
        continue;
      }

      const ageDays = Math.round(
        (Date.parse(`${today.iso}T00:00:00Z`) - Date.parse(`${scheduled}T00:00:00Z`)) /
          86_400_000,
      );
      if (ageDays > 7 && event !== "overdue_reminder") {
        skipped += 1;
        continue;
      }

      const recipientColumn =
        event === "invoice_reminder"
          ? "receive_invoice"
          : event === "payment_reminder"
            ? "receive_payment"
            : "receive_overdue";
      const recipients = all<BillRecipient>(
        `SELECT * FROM bill_recipients
          WHERE bill_id = ? AND is_active = 1 AND ${recipientColumn} = 1`,
        bill.id,
      );

      if (recipients.length === 0) continue;

      const copy = reminderCopy({ event, bill, cycle, monthKey: month, todayIso: today.iso });
      const payload = JSON.stringify({
        body: copy.body,
        bill: bill.name,
        month,
        event,
        invoiceStatus: cycle.invoice_status,
        paymentStatus: cycle.payment_status,
      });

      for (const recipient of recipients) {
        const idempotencyKey = `cycle-${cycle.id}-rule-${rule.id}-${scheduled}-r${recipient.id}`;
        const result = exec(
          `INSERT OR IGNORE INTO notification_outbox (
            bill_cycle_id, bill_id, rule_id, event_type, recipient_email, recipient_type,
            subject, payload, idempotency_key, status, next_attempt_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
          cycle.id,
          bill.id,
          rule.id,
          event,
          recipient.email,
          recipient.recipient_type,
          copy.subject,
          payload,
          idempotencyKey,
          new Date().toISOString(),
        );
        remindersCreated += result.changes;
      }
    }
  }

  return { month, cyclesCreated, remindersCreated, skipped };
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [5, 15, 60, 240];

export async function processOutbox(limit = 25): Promise<OutboxSummary> {
  const nowIso = new Date().toISOString();

  exec(
    `UPDATE notification_outbox
        SET status = 'pending', next_attempt_at = ?
      WHERE status = 'processing' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    nowIso,
    nowIso,
  );

  const rows = all<OutboxRow>(
    `SELECT * FROM notification_outbox
      WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY id LIMIT ?`,
    nowIso,
    limit,
  );

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    exec(
      `UPDATE notification_outbox
          SET status = 'processing', attempt_count = attempt_count + 1, next_attempt_at = ?
        WHERE id = ?`,
      lockUntil,
      row.id,
    );

    let body = "";
    try {
      const parsed = JSON.parse(row.payload) as { body?: string };
      body = parsed.body ?? "";
    } catch {
      body = "";
    }

    const result = await sendEmail({
      to: row.recipient_email,
      subject: row.subject,
      body,
    });

    if (result.ok) {
      const sentAt = new Date().toISOString();
      exec(
        `UPDATE notification_outbox
            SET status = 'sent', sent_at = ?, last_error = NULL, next_attempt_at = NULL
          WHERE id = ?`,
        sentAt,
        row.id,
      );
      exec(
        `INSERT INTO email_logs (outbox_id, to_email, subject, status, provider, provider_message_id)
         VALUES (?, ?, ?, 'sent', ?, ?)`,
        row.id,
        row.recipient_email,
        row.subject,
        result.provider,
        result.messageId ?? null,
      );
      sent += 1;
      continue;
    }

    const attempt = row.attempt_count + 1;
    const finalAttempt = attempt >= MAX_ATTEMPTS;
    const delay = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
    const nextAttempt = finalAttempt
      ? null
      : new Date(Date.now() + delay * 60 * 1000).toISOString();

    exec(
      `UPDATE notification_outbox
          SET status = ?, last_error = ?, next_attempt_at = ?
        WHERE id = ?`,
      finalAttempt ? "failed" : "pending",
      result.error ?? "Unknown send failure",
      nextAttempt,
      row.id,
    );
    exec(
      `INSERT INTO email_logs (outbox_id, to_email, subject, status, provider, error)
       VALUES (?, ?, ?, 'failed', ?, ?)`,
      row.id,
      row.recipient_email,
      row.subject,
      result.provider,
      result.error ?? "Unknown send failure",
    );
    failed += 1;
  }

  return { processed: rows.length, sent, failed };
}

export function engineWindow(): { current: string; previous: string } {
  const current = currentMonthKey();
  return { current, previous: addMonths(current, -1) };
}
