import { all, one } from "./db";
import { currentMonthKey, zonedToday } from "./dates";
import { deriveHealth, type CycleHealth } from "./health";
import type {
  Bill,
  BillCycle,
  BillRecipient,
  EmailLogRow,
  OutboxRow,
  ReminderRule,
  StatusHistoryRow,
} from "./types";

export type BillWithMeta = Bill & {
  cycle: BillCycle | null;
  recipient_count: number;
  rule_count: number;
  health: CycleHealth;
};

export type BillRow = Bill & {
  recipient_count: number;
  rule_count: number;
  cycle: BillCycle | null;
};

type RawBillRow = Bill & {
  cycle_id: number | null;
  cycle_bill_id: number | null;
  billing_month: string | null;
  invoice_status: string | null;
  approval_status: string | null;
  payment_status: string | null;
  invoice_received_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  cycle_created_at: string | null;
  cycle_updated_at: string | null;
  recipient_count: number;
  rule_count: number;
};

export type CycleWithBill = BillCycle & {
  bill_name: string;
  provider: string;
  category: string;
  arrival_start_day: number;
  arrival_end_day: number;
  payment_target_day: number;
  payment_deadline_day: number;
  timezone: string;
  bill_status: string;
};

export type HistoryWithBill = StatusHistoryRow & {
  bill_id: number;
  bill_name: string;
  billing_month: string;
  category: string;
};

export function listBills(month = currentMonthKey()): BillRow[] {
  const rows = all<RawBillRow>(
    `SELECT b.*,
            c.id AS cycle_id,
            c.bill_id AS cycle_bill_id,
            c.billing_month,
            c.invoice_status,
            c.approval_status,
            c.payment_status,
            c.invoice_received_at,
            c.approved_by,
            c.approved_at,
            c.approval_note,
            c.payment_date,
            c.payment_reference,
            c.created_at AS cycle_created_at,
            c.updated_at AS cycle_updated_at,
            (SELECT COUNT(*) FROM bill_recipients r WHERE r.bill_id = b.id AND r.is_active = 1) AS recipient_count,
            (SELECT COUNT(*) FROM reminder_rules rr WHERE rr.bill_id = b.id AND rr.is_active = 1) AS rule_count
       FROM bills b
       LEFT JOIN bill_cycles c ON c.bill_id = b.id AND c.billing_month = ?
      ORDER BY b.is_active DESC, b.name COLLATE NOCASE`,
    month,
  );

  return rows.map((row) => {
    const cycle: BillCycle | null =
      row.cycle_id != null
        ? {
            id: Number(row.cycle_id),
            bill_id: Number(row.cycle_bill_id),
            billing_month: String(row.billing_month),
            invoice_status: row.invoice_status as BillCycle["invoice_status"],
            approval_status: row.approval_status as BillCycle["approval_status"],
            payment_status: row.payment_status as BillCycle["payment_status"],
            invoice_received_at: (row.invoice_received_at as string | null) ?? null,
            approved_by: (row.approved_by as string | null) ?? null,
            approved_at: (row.approved_at as string | null) ?? null,
            approval_note: (row.approval_note as string | null) ?? null,
            payment_date: (row.payment_date as string | null) ?? null,
            payment_reference: (row.payment_reference as string | null) ?? null,
            created_at: String(row.cycle_created_at),
            updated_at: String(row.cycle_updated_at),
          }
        : null;

    const { cycle_id: _cycleId, cycle_bill_id: _cycleBillId, billing_month: _month, invoice_status: _invoiceStatus, approval_status: _approvalStatus, payment_status: _paymentStatus, invoice_received_at: _invoiceReceivedAt, approved_by: _approvedBy, approved_at: _approvedAt, approval_note: _approvalNote, payment_date: _paymentDate, payment_reference: _paymentReference, cycle_created_at: _cycleCreatedAt, cycle_updated_at: _cycleUpdatedAt, ...bill } = row;

    return { ...bill, cycle };
  });
}

export function listBillsWithMeta(month = currentMonthKey()): BillWithMeta[] {
  const today = zonedToday().iso;
  return listBills(month).map((row) => ({
    ...row,
    health: deriveHealth(row, row.cycle, today),
  }));
}

export function getBill(id: number): Bill | undefined {
  return one<Bill>("SELECT * FROM bills WHERE id = ?", id);
}

export function getBillDetail(id: number) {
  const bill = getBill(id);
  if (!bill) return null;

  const recipients = all<BillRecipient>(
    "SELECT * FROM bill_recipients WHERE bill_id = ? ORDER BY recipient_type, email",
    id,
  );
  const rules = all<ReminderRule>(
    "SELECT * FROM reminder_rules WHERE bill_id = ? ORDER BY rule_type, id",
    id,
  );
  const cycles = all<BillCycle>(
    "SELECT * FROM bill_cycles WHERE bill_id = ? ORDER BY billing_month DESC LIMIT 18",
    id,
  );
  const history = all<HistoryWithBill>(
    `SELECT h.*, b.id AS bill_id, b.name AS bill_name, c.billing_month, b.category
       FROM status_history h
       JOIN bill_cycles c ON c.id = h.bill_cycle_id
       JOIN bills b ON b.id = c.bill_id
      WHERE c.bill_id = ?
      ORDER BY h.id DESC
      LIMIT 25`,
    id,
  );

  return { bill, recipients, rules, cycles, history };
}

export function listCycles(month = currentMonthKey()): CycleWithBill[] {
  return all<CycleWithBill>(
    `SELECT c.*, b.name AS bill_name, b.provider, b.category,
            b.arrival_start_day, b.arrival_end_day,
            b.payment_target_day, b.payment_deadline_day,
            b.timezone, b.status AS bill_status
       FROM bill_cycles c
       JOIN bills b ON b.id = c.bill_id
      WHERE c.billing_month = ?
      ORDER BY b.name COLLATE NOCASE`,
    month,
  );
}

export function getCycle(id: number): CycleWithBill | undefined {
  return one<CycleWithBill>(
    `SELECT c.*, b.name AS bill_name, b.provider, b.category,
            b.arrival_start_day, b.arrival_end_day,
            b.payment_target_day, b.payment_deadline_day,
            b.timezone, b.status AS bill_status
       FROM bill_cycles c
       JOIN bills b ON b.id = c.bill_id
      WHERE c.id = ?`,
    id,
  );
}

export function currentCycleForBill(billId: number, month = currentMonthKey()) {
  return one<BillCycle>(
    "SELECT * FROM bill_cycles WHERE bill_id = ? AND billing_month = ?",
    billId,
    month,
  );
}

export type DashboardData = {
  month: string;
  today: string;
  bills: BillWithMeta[];
  totals: {
    activeBills: number;
    awaitingInvoices: number;
    pendingApprovals: number;
    pendingPayments: number;
    overdue: number;
    delayedInvoices: number;
    paidThisMonth: number;
    pendingOutbox: number;
    sentLast30: number;
  };
  attention: BillWithMeta[];
  recentHistory: HistoryWithBill[];
};

export function getDashboardData(month = currentMonthKey()): DashboardData {
  const bills = listBillsWithMeta(month);
  const active = bills.filter((bill) => bill.is_active === 1 && bill.status === "active");

  const overdueBills = active.filter((bill) => bill.health.overdue);
  const delayedInvoices = active.filter((bill) => bill.health.invoiceDelayed);
  const attention = active
    .filter(
      (bill) =>
        bill.health.overdue ||
        bill.health.invoiceDelayed ||
        bill.health.paymentDueSoon ||
        (bill.cycle?.approval_status === "pending" &&
          bill.cycle.invoice_status === "received"),
    )
    .sort((a, b) => {
      const score = (bill: BillWithMeta) =>
        (bill.health.overdue ? 4 : 0) +
        (bill.cycle?.approval_status === "pending" &&
        bill.cycle.invoice_status === "received"
          ? 3
          : 0) +
        (bill.health.invoiceDelayed ? 2 : 0);
      return score(b) - score(a) || a.name.localeCompare(b.name);
    });

  const pendingOutbox = one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM notification_outbox WHERE status IN ('pending', 'processing')",
  );
  const sentLast30 = one<{ count: number }>(
    `SELECT COUNT(*) AS count FROM email_logs
      WHERE status = 'sent' AND created_at >= datetime('now', '-30 days')`,
  );

  const recentHistory = all<HistoryWithBill>(
    `SELECT h.*, b.id AS bill_id, b.name AS bill_name, c.billing_month, b.category
       FROM status_history h
       JOIN bill_cycles c ON c.id = h.bill_cycle_id
       JOIN bills b ON b.id = c.bill_id
      ORDER BY h.id DESC
      LIMIT 8`,
  );

  return {
    month,
    today: zonedToday().iso,
    bills,
    totals: {
      activeBills: active.length,
      awaitingInvoices: active.filter((bill) => bill.cycle?.invoice_status === "awaiting").length,
      pendingApprovals: active.filter(
        (bill) =>
          bill.cycle?.approval_status === "pending" &&
          bill.cycle.invoice_status === "received",
      ).length,
      pendingPayments: active.filter((bill) => bill.cycle?.payment_status === "pending").length,
      overdue: overdueBills.length,
      delayedInvoices: delayedInvoices.length,
      paidThisMonth: active.filter((bill) => bill.cycle?.payment_status === "paid").length,
      pendingOutbox: Number(pendingOutbox?.count ?? 0),
      sentLast30: Number(sentLast30?.count ?? 0),
    },
    attention,
    recentHistory,
  };
}

export function getReportsData() {
  const emails = all<EmailLogRow>(
    "SELECT * FROM email_logs ORDER BY id DESC LIMIT 40",
  );
  const outbox = all<OutboxRow>(
    "SELECT * FROM notification_outbox ORDER BY id DESC LIMIT 40",
  );
  const history = all<HistoryWithBill>(
    `SELECT h.*, b.id AS bill_id, b.name AS bill_name, c.billing_month, b.category
       FROM status_history h
       JOIN bill_cycles c ON c.id = h.bill_cycle_id
       JOIN bills b ON b.id = c.bill_id
      ORDER BY h.id DESC
      LIMIT 60`,
  );
  const outboxStats = all<{ status: string; count: number }>(
    "SELECT status, COUNT(*) AS count FROM notification_outbox GROUP BY status",
  );
  const emailStats = all<{ status: string; count: number }>(
    "SELECT status, COUNT(*) AS count FROM email_logs GROUP BY status",
  );

  return { emails, outbox, history, outboxStats, emailStats };
}

export function listMonthKeysWithCycles(limit = 18): string[] {
  return all<{ billing_month: string }>(
    "SELECT DISTINCT billing_month FROM bill_cycles ORDER BY billing_month DESC LIMIT ?",
    limit,
  ).map((row) => row.billing_month);
}

