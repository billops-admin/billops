import { compareIso, dateForDay, zonedToday } from "./dates";
import type { Bill, BillCycle } from "./types";

export type CycleHealth = {
  overdue: boolean;
  invoiceDelayed: boolean;
  paymentDueSoon: boolean;
  invoiceDueSoon: boolean;
  overdueDays: number;
  tone: "paid" | "overdue" | "delayed" | "due" | "waiting" | "hold" | "neutral";
  label: string;
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

type BillSchedule = Pick<
  Bill,
  | "arrival_start_day"
  | "arrival_end_day"
  | "payment_target_day"
  | "payment_deadline_day"
  | "timezone"
>;

export function deriveHealth(
  bill: BillSchedule,
  cycle: BillCycle | null,
  todayIso = zonedToday().iso,
): CycleHealth {
  if (!cycle) {
    return {
      overdue: false,
      invoiceDelayed: false,
      paymentDueSoon: false,
      invoiceDueSoon: false,
      overdueDays: 0,
      tone: "neutral",
      label: "No cycle",
    };
  }

  const month = cycle.billing_month;
  const arrivalEnd = dateForDay(month, bill.arrival_end_day);
  const deadline = dateForDay(month, bill.payment_deadline_day);
  const target = dateForDay(month, bill.payment_target_day);

  const overdue =
    cycle.payment_status === "pending" && compareIso(todayIso, deadline) > 0;
  const invoiceDelayed =
    cycle.invoice_status === "awaiting" && compareIso(todayIso, arrivalEnd) > 0;
  const paymentDueSoon =
    cycle.payment_status === "pending" &&
    compareIso(todayIso, deadline) <= 0 &&
    compareIso(todayIso, target) >= 0;
  const invoiceDueSoon =
    cycle.invoice_status === "awaiting" &&
    compareIso(todayIso, arrivalEnd) <= 0 &&
    daysBetween(todayIso, arrivalEnd) <= 3;

  const overdueDays = overdue ? daysBetween(deadline, todayIso) : 0;

  let tone: CycleHealth["tone"] = "waiting";
  let label = "On track";

  if (cycle.payment_status === "paid") {
    tone = "paid";
    label = "Paid";
  } else if (cycle.payment_status === "on_hold") {
    tone = "hold";
    label = "On hold";
  } else if (overdue) {
    tone = "overdue";
    label = `Overdue ${overdueDays}d`;
  } else if (invoiceDelayed) {
    tone = "delayed";
    label = "Invoice delayed";
  } else if (paymentDueSoon) {
    tone = "due";
    label = "Payment due";
  } else if (invoiceDueSoon) {
    tone = "due";
    label = "Invoice expected";
  } else if (cycle.invoice_status === "awaiting") {
    label = "Awaiting invoice";
  } else if (cycle.invoice_status === "not_applicable") {
    label = "No invoice";
  }

  return {
    overdue,
    invoiceDelayed,
    paymentDueSoon,
    invoiceDueSoon,
    overdueDays,
    tone,
    label,
  };
}
