import { all, exec } from "./db";
import { dateForDay, formatDate, formatMonth } from "./dates";
import type { Bill, BillCycle, BillRecipient, ReminderRule } from "./types";

function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

export function queueStatusNotifications(params: {
  historyId: number;
  cycle: BillCycle;
  bill: Bill;
  previousInvoice: string;
  previousApproval: string;
  previousPayment: string;
  actor: string;
  note?: string | null;
}): number {
  const recipients = all<BillRecipient>(
    `SELECT * FROM bill_recipients
      WHERE bill_id = ? AND is_active = 1 AND receive_status_updates = 1`,
    params.bill.id,
  );

  if (recipients.length === 0) return 0;

  const month = formatMonth(params.cycle.billing_month);
  const subject = `[BillOps] Status update: ${params.bill.name} — ${month}`;
  const changes: string[] = [];

  if (params.previousInvoice !== params.cycle.invoice_status) {
    changes.push(
      `Invoice status: ${statusLabel(params.previousInvoice)} → ${statusLabel(
        params.cycle.invoice_status,
      )}`,
    );
  }
  if (params.previousApproval !== params.cycle.approval_status) {
    changes.push(
      `Approval status: ${statusLabel(params.previousApproval)} → ${statusLabel(
        params.cycle.approval_status,
      )}`,
    );
  }
  if (params.previousPayment !== params.cycle.payment_status) {
    changes.push(
      `Payment status: ${statusLabel(params.previousPayment)} → ${statusLabel(
        params.cycle.payment_status,
      )}`,
    );
  }

  const lines = [
    "Hello,",
    "",
    `${params.actor} updated the status of a bill in BillOps.`,
    "",
    `Bill: ${params.bill.name}`,
    `Provider: ${params.bill.provider}`,
    `Cycle: ${month}`,
    ...changes,
    `Approval status: ${statusLabel(params.cycle.approval_status)}`,
    `Invoice received on: ${formatDate(params.cycle.invoice_received_at)}`,
    `Approved by: ${params.cycle.approved_by || "—"}`,
    `Payment date: ${formatDate(params.cycle.payment_date)}`,
    `Payment reference: ${params.cycle.payment_reference || "—"}`,
  ];

  if (params.note) {
    lines.push("", `Note: ${params.note}`);
  }

  lines.push("", "This is an automated notification from BillOps.");
  const body = lines.join("\n");

  const payload = JSON.stringify({
    body,
    bill: params.bill.name,
    month: params.cycle.billing_month,
    invoiceStatus: params.cycle.invoice_status,
    approvalStatus: params.cycle.approval_status,
    paymentStatus: params.cycle.payment_status,
    actor: params.actor,
  });

  let created = 0;
  for (const recipient of recipients) {
    const key = `history-${params.historyId}-r${recipient.id}`;
    const result = exec(
      `INSERT OR IGNORE INTO notification_outbox (
        bill_cycle_id, bill_id, rule_id, event_type, recipient_email, recipient_type,
        subject, payload, idempotency_key, status
      ) VALUES (?, ?, NULL, 'status_change', ?, ?, ?, ?, ?, 'pending')`,
      params.cycle.id,
      params.bill.id,
      recipient.email,
      recipient.recipient_type,
      subject,
      payload,
      key,
    );
    created += result.changes;
  }

  return created;
}

export function queueApprovalRequestNotifications(params: {
  historyId: number;
  cycle: BillCycle;
  bill: Bill;
  actor: string;
}): number {
  if (params.cycle.approval_status !== "pending") return 0;

  const recipients = all<BillRecipient>(
    `SELECT * FROM bill_recipients
      WHERE bill_id = ? AND is_active = 1 AND receive_approval = 1`,
    params.bill.id,
  );
  if (recipients.length === 0) return 0;

  const month = formatMonth(params.cycle.billing_month);
  const target = formatDate(dateForDay(params.cycle.billing_month, params.bill.payment_target_day));
  const deadline = formatDate(
    dateForDay(params.cycle.billing_month, params.bill.payment_deadline_day),
  );
  const subject = `[BillOps] Approval needed: ${params.bill.name} — ${month}`;
  const body = [
    "Hello,",
    "",
    `${params.actor} marked the invoice as received. This bill now needs approval before payment reminders are sent.`,
    "",
    `Bill: ${params.bill.name}`,
    `Provider: ${params.bill.provider}`,
    `Category: ${params.bill.category}`,
    `Cycle: ${month}`,
    `Invoice status: ${statusLabel(params.cycle.invoice_status)}`,
    `Approval status: pending`,
    `Internal payment target: ${target}`,
    `Final deadline: ${deadline}`,
    "",
    "Please review the invoice and approve or reject it in BillOps.",
    "Payment reminders are paused until this bill is approved.",
    "",
    "This is an automated approval request from BillOps.",
  ].join("\n");

  const payload = JSON.stringify({
    body,
    bill: params.bill.name,
    month: params.cycle.billing_month,
    event: "approval_request",
    approvalStatus: params.cycle.approval_status,
  });

  let created = 0;
  for (const recipient of recipients) {
    const key = `history-${params.historyId}-approval-r${recipient.id}`;
    const result = exec(
      `INSERT OR IGNORE INTO notification_outbox (
        bill_cycle_id, bill_id, rule_id, event_type, recipient_email, recipient_type,
        subject, payload, idempotency_key, status, next_attempt_at
      ) VALUES (?, ?, NULL, 'approval_request', ?, ?, ?, ?, ?, 'pending', ?)`,
      params.cycle.id,
      params.bill.id,
      recipient.email,
      recipient.recipient_type,
      subject,
      payload,
      key,
      new Date().toISOString(),
    );
    created += result.changes;
  }

  return created;
}

export function queueApprovalApprovedNotifications(params: {
  historyId: number;
  cycle: BillCycle;
  bill: Bill;
  actor: string;
}): number {
  if (params.cycle.approval_status !== "approved" || params.cycle.payment_status === "paid") {
    return 0;
  }

  const recipients = all<BillRecipient>(
    `SELECT * FROM bill_recipients
      WHERE bill_id = ? AND is_active = 1 AND receive_payment = 1`,
    params.bill.id,
  );
  if (recipients.length === 0) return 0;

  const month = formatMonth(params.cycle.billing_month);
  const target = formatDate(dateForDay(params.cycle.billing_month, params.bill.payment_target_day));
  const deadline = formatDate(
    dateForDay(params.cycle.billing_month, params.bill.payment_deadline_day),
  );
  const subject = `[BillOps] Approved — payment can proceed: ${params.bill.name} — ${month}`;
  const body = [
    "Hello,",
    "",
    `${params.bill.name} has been approved for payment.`,
    "",
    `Bill: ${params.bill.name}`,
    `Provider: ${params.bill.provider}`,
    `Category: ${params.bill.category}`,
    `Cycle: ${month}`,
    `Approved by: ${params.actor}`,
    `Internal payment target: ${target}`,
    `Final deadline: ${deadline}`,
    "",
    "Please check the card balance and complete the payment before the deadline.",
    "Record the payment reference in BillOps once done.",
    "",
    "This is an automated approval notification from BillOps.",
  ].join("\n");

  const payload = JSON.stringify({
    body,
    bill: params.bill.name,
    month: params.cycle.billing_month,
    event: "approval_approved",
    approvalStatus: params.cycle.approval_status,
  });

  let created = 0;
  for (const recipient of recipients) {
    const key = `history-${params.historyId}-approval-approved-r${recipient.id}`;
    const result = exec(
      `INSERT OR IGNORE INTO notification_outbox (
        bill_cycle_id, bill_id, rule_id, event_type, recipient_email, recipient_type,
        subject, payload, idempotency_key, status, next_attempt_at
      ) VALUES (?, ?, NULL, 'approval_approved', ?, ?, ?, ?, ?, 'pending', ?)`,
      params.cycle.id,
      params.bill.id,
      recipient.email,
      recipient.recipient_type,
      subject,
      payload,
      key,
      new Date().toISOString(),
    );
    created += result.changes;
  }

  return created;
}

export function cancelPendingPaymentReminders(cycleId: number): number {
  const result = exec(
    `UPDATE notification_outbox
        SET status = 'cancelled',
            next_attempt_at = NULL,
            last_error = 'Cancelled because the payment was marked paid'
      WHERE bill_cycle_id = ?
        AND status = 'pending'
        AND event_type IN ('payment_reminder', 'overdue_reminder')`,
    cycleId,
  );
  return result.changes;
}

export function restoreCancelledPaymentReminders(cycleId: number): void {
  exec(
    `DELETE FROM notification_outbox
      WHERE bill_cycle_id = ?
        AND status = 'cancelled'
        AND event_type IN ('payment_reminder', 'overdue_reminder')`,
    cycleId,
  );
}

export function queuePaidConfirmationNotifications(params: {
  cycle: BillCycle;
  bill: Bill;
  actor?: string;
}): number {
  if (params.cycle.payment_status !== "paid") return 0;

  const rules = all<ReminderRule>(
    `SELECT * FROM reminder_rules
      WHERE bill_id = ? AND rule_type = 'payment_paid' AND is_active = 1
      ORDER BY id`,
    params.bill.id,
  );
  if (rules.length === 0) return 0;

  const recipients = all<BillRecipient>(
    `SELECT * FROM bill_recipients
      WHERE bill_id = ? AND is_active = 1 AND receive_paid = 1`,
    params.bill.id,
  );
  if (recipients.length === 0) return 0;

  const month = formatMonth(params.cycle.billing_month);
  const subject = `[BillOps] Payment completed: ${params.bill.name} — ${month}`;
  const lines = [
    "Hello,",
    "",
    `${params.bill.name} has been marked as paid for ${month}.`,
    "",
    `Bill: ${params.bill.name}`,
    `Provider: ${params.bill.provider}`,
    `Category: ${params.bill.category}`,
    `Cycle: ${month}`,
    `Payment status: paid`,
    `Payment date: ${formatDate(params.cycle.payment_date)}`,
    `Payment reference: ${params.cycle.payment_reference || "—"}`,
  ];

  if (params.actor) {
    lines.push("", `Recorded by: ${params.actor}`);
  }

  lines.push(
    "",
    "Payment reminders for this bill are now stopped for this month.",
    "The next monthly cycle will start as pending automatically.",
    "",
    "This is an automated payment confirmation from BillOps.",
  );

  const body = lines.join("\n");
  const payload = JSON.stringify({
    body,
    bill: params.bill.name,
    month: params.cycle.billing_month,
    event: "payment_paid",
    paymentStatus: params.cycle.payment_status,
    paymentDate: params.cycle.payment_date,
    paymentReference: params.cycle.payment_reference,
  });

  let created = 0;
  for (const rule of rules) {
    for (const recipient of recipients) {
      const key = `cycle-${params.cycle.id}-rule-${rule.id}-paid-r${recipient.id}`;
      const result = exec(
        `INSERT OR IGNORE INTO notification_outbox (
          bill_cycle_id, bill_id, rule_id, event_type, recipient_email, recipient_type,
          subject, payload, idempotency_key, status, next_attempt_at
        ) VALUES (?, ?, ?, 'payment_paid', ?, ?, ?, ?, ?, 'pending', ?)`,
        params.cycle.id,
        params.bill.id,
        rule.id,
        recipient.email,
        recipient.recipient_type,
        subject,
        payload,
        key,
        new Date().toISOString(),
      );
      created += result.changes;
    }
  }

  return created;
}
