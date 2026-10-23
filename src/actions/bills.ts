"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { exec, one, transaction } from "@/lib/db";
import { currentMonthKey } from "@/lib/dates";
import { ensureCycles, processOutbox, runDailyEngine } from "@/lib/engine";
import type { Bill, BillRecipient, ReminderAnchor, ReminderRuleType } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function day(formData: FormData, key: string): number {
  return Math.trunc(Number(text(formData, key)));
}

function validDay(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 31;
}

function failure(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function safeRedirect(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/bills");
  revalidatePath("/cycles");
  revalidatePath("/reports");
  revalidatePath("/settings");
}

function insertDefaultRules(
  billId: number,
  arrivalEnd: number,
  target: number,
  deadline: number,
) {
  const insertRule = (ruleType: ReminderRuleType, label: string, dayOfMonth: number | null, offsetDays: number | null, anchor: ReminderAnchor | null) => {
    exec(
      `INSERT INTO reminder_rules (bill_id, rule_type, label, day_of_month, offset_days, anchor, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      billId,
      ruleType,
      label,
      dayOfMonth,
      offsetDays,
      anchor,
    );
  };

  insertRule("invoice_arrival", "Invoice arrival check", arrivalEnd, null, null);
  insertRule("payment_pending", "Payment reminder (3 days before deadline)", null, -3, "payment_deadline");
  insertRule("payment_pending", "Payment target reminder", target, null, null);
  insertRule("overdue", "Overdue escalation", deadline, null, null);
  insertRule("payment_paid", "Paid confirmation", null, null, null);
}

function parseRecipients(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\s]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export async function createBillAction(formData: FormData): Promise<void> {
  await requireUser();

  const name = text(formData, "name");
  const provider = text(formData, "provider");
  const category = text(formData, "category");
  const accountNumber = text(formData, "account_number") || null;
  const timezone = text(formData, "timezone") || "Asia/Kolkata";
  const notes = text(formData, "notes") || null;

  const arrivalStart = day(formData, "arrival_start_day");
  const arrivalEnd = day(formData, "arrival_end_day");
  const target = day(formData, "payment_target_day");
  const deadline = day(formData, "payment_deadline_day");

  if (!name || !provider || !category) {
    failure("/bills/new", "Bill name, provider and category are required.");
  }
  if (!validDay(arrivalStart) || !validDay(arrivalEnd) || !validDay(target) || !validDay(deadline)) {
    failure("/bills/new", "All schedule days must be between 1 and 31.");
  }
  if (arrivalStart > arrivalEnd) {
    failure("/bills/new", "The arrival window start must be before the end.");
  }
  if (target > deadline) {
    failure("/bills/new", "The internal payment target must not be after the final deadline.");
  }

  const recipients = parseRecipients(text(formData, "recipients"));
  const invalidEmail = recipients.find((email) => !EMAIL_RE.test(email));
  if (invalidEmail) {
    failure("/bills/new", `Invalid recipient email: ${invalidEmail}`);
  }

  const receiveReminders = formData.get("receive_reminders") ? 1 : 0;
  const receiveStatusUpdates = formData.get("receive_status_updates") ? 1 : 0;

  const billId = transaction(() => {
    const result = exec(
      `INSERT INTO bills (
        name, provider, category, account_number, arrival_start_day, arrival_end_day,
        payment_target_day, payment_deadline_day, timezone, notes, status, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
      name,
      provider,
      category,
      accountNumber,
      arrivalStart,
      arrivalEnd,
      target,
      deadline,
      timezone,
      notes,
    );

    for (const email of recipients) {
      exec(
        `INSERT OR IGNORE INTO bill_recipients (
          bill_id, email, recipient_type, receive_reminders,
          receive_invoice, receive_approval, receive_payment, receive_overdue, receive_paid,
          receive_status_updates, is_active
        ) VALUES (?, ?, 'to', ?, ?, 0, ?, ?, ?, ?, 1)`,
        result.lastInsertRowid,
        email,
        receiveReminders,
        receiveReminders,
        receiveReminders,
        receiveReminders,
        receiveReminders,
        receiveStatusUpdates,
      );
    }

    insertDefaultRules(result.lastInsertRowid, arrivalEnd, target, deadline);
    return result.lastInsertRowid;
  });

  ensureCycles(currentMonthKey());
  revalidateAll();
  redirect(`/bills/${billId}?notice=${encodeURIComponent("Bill created and reminder rules configured.")}`);
}

export async function updateBillAction(formData: FormData): Promise<void> {
  await requireUser();

  const id = Math.trunc(Number(text(formData, "id")));
  const existing = one<Bill>("SELECT * FROM bills WHERE id = ?", id);
  if (!existing) failure("/bills", "Bill not found.");

  const name = text(formData, "name");
  const provider = text(formData, "provider");
  const category = text(formData, "category");
  const accountNumber = text(formData, "account_number") || null;
  const timezone = text(formData, "timezone") || "Asia/Kolkata";
  const notes = text(formData, "notes") || null;

  const arrivalStart = day(formData, "arrival_start_day");
  const arrivalEnd = day(formData, "arrival_end_day");
  const target = day(formData, "payment_target_day");
  const deadline = day(formData, "payment_deadline_day");

  if (!name || !provider || !category) {
    failure(`/bills/${id}`, "Bill name, provider and category are required.");
  }
  if (!validDay(arrivalStart) || !validDay(arrivalEnd) || !validDay(target) || !validDay(deadline)) {
    failure(`/bills/${id}`, "All schedule days must be between 1 and 31.");
  }
  if (arrivalStart > arrivalEnd) {
    failure(`/bills/${id}`, "The arrival window start must be before the end.");
  }
  if (target > deadline) {
    failure(`/bills/${id}`, "The internal payment target must not be after the final deadline.");
  }

  transaction(() => {
    exec(
      `UPDATE bills
          SET name = ?, provider = ?, category = ?, account_number = ?, arrival_start_day = ?,
              arrival_end_day = ?, payment_target_day = ?, payment_deadline_day = ?,
              timezone = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ?`,
      name,
      provider,
      category,
      accountNumber,
      arrivalStart,
      arrivalEnd,
      target,
      deadline,
      timezone,
      notes,
      id,
    );

    exec(
      `UPDATE reminder_rules SET day_of_month = ?
        WHERE bill_id = ? AND rule_type = 'invoice_arrival' AND day_of_month = ?`,
      arrivalEnd,
      id,
      existing.arrival_end_day,
    );
    exec(
      `UPDATE reminder_rules SET day_of_month = ?
        WHERE bill_id = ? AND rule_type = 'payment_pending' AND day_of_month = ?`,
      target,
      id,
      existing.payment_target_day,
    );
    exec(
      `UPDATE reminder_rules SET day_of_month = ?
        WHERE bill_id = ? AND rule_type = 'overdue' AND day_of_month = ?`,
      deadline,
      id,
      existing.payment_deadline_day,
    );
  });

  revalidateAll();
  redirect(`/bills/${id}?notice=${encodeURIComponent("Bill configuration saved.")}`);
}

export async function setBillStatusAction(formData: FormData): Promise<void> {
  await requireUser();

  const id = Math.trunc(Number(text(formData, "id")));
  const status = text(formData, "status");
  if (!["active", "paused", "inactive"].includes(status)) {
    failure(`/bills/${id}`, "Unknown bill status.");
  }

  exec(
    "UPDATE bills SET status = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?",
    status,
    status === "active" ? 1 : 0,
    id,
  );

  if (status === "active") ensureCycles(currentMonthKey());
  revalidateAll();
  redirect(
    `/bills/${id}?notice=${encodeURIComponent(
      status === "active"
        ? "Bill is active. The reminder engine will pick it up automatically."
        : status === "paused"
          ? "Bill paused. No new cycles or reminders will be generated."
          : "Bill deactivated.",
    )}`,
  );
}

export async function addRecipientAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const email = text(formData, "email").toLowerCase();
  const type = text(formData, "recipient_type") || "to";
  const invoice = formData.get("receive_invoice") ? 1 : 0;
  const approval = formData.get("receive_approval") ? 1 : 0;
  const payment = formData.get("receive_payment") ? 1 : 0;
  const overdue = formData.get("receive_overdue") ? 1 : 0;
  const paid = formData.get("receive_paid") ? 1 : 0;
  const reminders = invoice || payment || overdue || paid ? 1 : 0;
  const statusUpdates = formData.get("receive_status_updates") ? 1 : 0;

  if (!EMAIL_RE.test(email)) failure(`/bills/${billId}`, "Enter a valid email address.");
  if (!["to", "cc", "bcc"].includes(type)) failure(`/bills/${billId}`, "Invalid recipient type.");

  exec(
    `INSERT OR IGNORE INTO bill_recipients (
      bill_id, email, recipient_type, receive_reminders,
      receive_invoice, receive_approval, receive_payment, receive_overdue, receive_paid,
      receive_status_updates, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    billId,
    email,
    type,
    reminders,
    invoice,
    approval,
    payment,
    overdue,
    paid,
    statusUpdates,
  );

  revalidateAll();
  redirect(`/bills/${billId}?notice=${encodeURIComponent("Recipient saved.")}`);
}

export async function removeRecipientAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const id = Math.trunc(Number(text(formData, "id")));
  exec("DELETE FROM bill_recipients WHERE id = ? AND bill_id = ?", id, billId);

  revalidateAll();
  redirect(`/bills/${billId}?notice=${encodeURIComponent("Recipient removed.")}`);
}

export async function toggleRecipientFlagAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const id = Math.trunc(Number(text(formData, "id")));
  const field = text(formData, "field");
  const value = text(formData, "value") === "1" ? 1 : 0;

  if (field === "reminders") {
    exec(
      `UPDATE bill_recipients
          SET receive_reminders = ?, receive_invoice = ?, receive_payment = ?,
              receive_overdue = ?, receive_paid = ?
        WHERE id = ? AND bill_id = ?`,
      value,
      value,
      value,
      value,
      value,
      id,
      billId,
    );
  } else {
    const columns: Record<string, string> = {
      invoice: "receive_invoice",
      approval: "receive_approval",
      payment: "receive_payment",
      overdue: "receive_overdue",
      paid: "receive_paid",
      status: "receive_status_updates",
    };
    const column = columns[field];
    if (!column) failure(`/bills/${billId}`, "Unknown recipient setting.");
    exec(`UPDATE bill_recipients SET ${column} = ? WHERE id = ? AND bill_id = ?`, value, id, billId);
  }

  revalidateAll();
  redirect(`/bills/${billId}`);
}

export async function addRuleAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const ruleType = text(formData, "rule_type") as ReminderRuleType;
  const label = text(formData, "label") || null;
  const dayOfMonthRaw = text(formData, "day_of_month");
  const offsetRaw = text(formData, "offset_days");
  const anchorRaw = text(formData, "anchor");

  if (!["invoice_arrival", "payment_pending", "overdue", "payment_paid"].includes(ruleType)) {
    failure(`/bills/${billId}`, "Choose a valid reminder type.");
  }

  let dayOfMonth: number | null = null;
  let offsetDays: number | null = null;
  let anchor: ReminderAnchor | null = null;

  if (ruleType === "payment_paid") {
    dayOfMonth = null;
    offsetDays = null;
    anchor = null;
  } else if (dayOfMonthRaw) {
    dayOfMonth = Math.trunc(Number(dayOfMonthRaw));
    if (!validDay(dayOfMonth)) {
      failure(`/bills/${billId}`, "Reminder day must be between 1 and 31.");
    }
  } else if (offsetRaw) {
    offsetDays = Math.trunc(Number(offsetRaw));
    if (!Number.isFinite(offsetDays) || Math.abs(offsetDays) > 60) {
      failure(`/bills/${billId}`, "Offset must be a number between -60 and 60.");
    }
    if (!["arrival_end", "payment_target", "payment_deadline"].includes(anchorRaw)) {
      failure(`/bills/${billId}`, "Choose an anchor for the offset reminder.");
    }
    anchor = anchorRaw as ReminderAnchor;
  } else {
    failure(`/bills/${billId}`, "Set either a day of the month or an offset from a deadline.");
  }

  exec(
    `INSERT INTO reminder_rules (bill_id, rule_type, label, day_of_month, offset_days, anchor, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    billId,
    ruleType,
    label,
    dayOfMonth,
    offsetDays,
    anchor,
  );

  revalidateAll();
  redirect(`/bills/${billId}?notice=${encodeURIComponent("Reminder rule added.")}`);
}

export async function removeRuleAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const id = Math.trunc(Number(text(formData, "id")));
  exec("DELETE FROM reminder_rules WHERE id = ? AND bill_id = ?", id, billId);

  revalidateAll();
  redirect(`/bills/${billId}?notice=${encodeURIComponent("Reminder rule removed.")}`);
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const id = Math.trunc(Number(text(formData, "id")));
  const active = text(formData, "is_active") === "1" ? 1 : 0;
  exec("UPDATE reminder_rules SET is_active = ? WHERE id = ? AND bill_id = ?", active, id, billId);

  revalidateAll();
  redirect(`/bills/${billId}`);
}

export async function generateCyclesAction(formData: FormData): Promise<void> {
  await requireUser();

  const month = text(formData, "month") || currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) failure("/cycles", "Choose a valid month.");

  const created = ensureCycles(month);
  revalidateAll();
  redirect(
    `/cycles?month=${month}&notice=${encodeURIComponent(
      created > 0 ? `${created} monthly cycle(s) generated.` : "All active bills already have a cycle for this month.",
    )}`,
  );
}

export async function runEngineAction(formData: FormData): Promise<void> {
  await requireUser();

  const redirectTo = safeRedirect(text(formData, "redirect_to"), "/");
  const engine = runDailyEngine();
  const outbox = await processOutbox(50);

  revalidateAll();
  const message = `Daily check for ${engine.month}: ${engine.cyclesCreated} cycle(s) created, ${engine.remindersCreated} reminder(s) queued. Email worker sent ${outbox.sent}, failed ${outbox.failed}.`;
  const separator = redirectTo.includes("?") ? "&" : "?";
  redirect(`${redirectTo}${separator}notice=${encodeURIComponent(message)}`);
}

export async function processOutboxAction(formData: FormData): Promise<void> {
  await requireUser();

  const redirectTo = safeRedirect(text(formData, "redirect_to"), "/settings");
  const outbox = await processOutbox(100);

  revalidateAll();
  const message = `Email worker processed ${outbox.processed} notification(s): ${outbox.sent} sent, ${outbox.failed} failed (will retry).`;
  const separator = redirectTo.includes("?") ? "&" : "?";
  redirect(`${redirectTo}${separator}notice=${encodeURIComponent(message)}`);
}

export async function updateRecipientTypeAction(formData: FormData): Promise<void> {
  await requireUser();

  const billId = Math.trunc(Number(text(formData, "bill_id")));
  const id = Math.trunc(Number(text(formData, "id")));
  const type = text(formData, "recipient_type");
  if (!["to", "cc", "bcc"].includes(type)) failure(`/bills/${billId}`, "Invalid recipient type.");

  const recipient = one<BillRecipient>(
    "SELECT * FROM bill_recipients WHERE id = ? AND bill_id = ?",
    id,
    billId,
  );
  if (recipient) {
    exec(
      "UPDATE bill_recipients SET recipient_type = ? WHERE id = ? AND bill_id = ?",
      type,
      id,
      billId,
    );
  }

  revalidateAll();
  redirect(`/bills/${billId}`);
}
