import type { CycleHealth } from "@/lib/health";
import type { ApprovalStatus, InvoiceStatus, PaymentStatus } from "@/lib/types";

const invoiceStyles: Record<InvoiceStatus, string> = {
  awaiting: "border-amber-200 bg-amber-50 text-amber-700",
  received: "border-emerald-200 bg-emerald-50 text-emerald-700",
  not_applicable: "border-slate-200 bg-slate-100 text-slate-500",
};

const invoiceLabels: Record<InvoiceStatus, string> = {
  awaiting: "Awaiting",
  received: "Received",
  not_applicable: "Not applicable",
};

const approvalStyles: Record<ApprovalStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};

const approvalLabels: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const paymentStyles: Record<PaymentStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  on_hold: "border-sky-200 bg-sky-50 text-sky-700",
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  on_hold: "On hold",
};

const healthStyles: Record<CycleHealth["tone"], string> = {
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
  delayed: "border-orange-200 bg-orange-50 text-orange-700",
  due: "border-amber-200 bg-amber-50 text-amber-700",
  waiting: "border-slate-200 bg-slate-100 text-slate-500",
  hold: "border-sky-200 bg-sky-50 text-sky-700",
  neutral: "border-slate-200 bg-slate-100 text-slate-500",
};

const dotStyles: Record<CycleHealth["tone"], string> = {
  paid: "bg-emerald-400",
  overdue: "bg-rose-400",
  delayed: "bg-orange-400",
  due: "bg-amber-400",
  waiting: "bg-slate-500",
  hold: "bg-sky-400",
  neutral: "bg-slate-500",
};

export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`badge ${invoiceStyles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {invoiceLabels[status]}
    </span>
  );
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  return (
    <span className={`badge ${approvalStyles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {approvalLabels[status]}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={`badge ${paymentStyles[status]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {paymentLabels[status]}
    </span>
  );
}

export function HealthBadge({ health }: { health: CycleHealth }) {
  return (
    <span className={`badge ${healthStyles[health.tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[health.tone]}`} />
      {health.label}
    </span>
  );
}

export function BillStatusBadge({ status }: { status: string }) {
  const styles =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "paused"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-100 text-slate-500";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`badge ${styles}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export function OutboxStatusBadge({ status }: { status: string }) {
  const styles =
    status === "sent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : status === "processing"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : status === "cancelled"
            ? "border-slate-200 bg-slate-100 text-slate-500"
            : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`badge ${styles}`}>{status}</span>;
}
