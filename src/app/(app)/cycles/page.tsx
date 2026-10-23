import Link from "next/link";
import { changeCycleStatusAction } from "@/actions/cycles";
import { generateCyclesAction } from "@/actions/bills";
import { ApprovalBadge, HealthBadge, InvoiceBadge, PaymentBadge } from "@/components/badges";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Flash, PageHeader, StatCard } from "@/components/ui";
import {
  buildMonthList,
  currentMonthKey,
  dateForDay,
  formatDate,
  formatMonth,
  formatMonthShort,
  monthOptions,
  zonedToday,
} from "@/lib/dates";
import { ensureCycles } from "@/lib/engine";
import { deriveHealth } from "@/lib/health";
import { listCycles, listMonthKeysWithCycles } from "@/lib/queries";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Invoice awaiting" },
  { key: "received", label: "Invoice received" },
  { key: "approval_pending", label: "Approval pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "pending", label: "Payment pending" },
  { key: "paid", label: "Paid" },
  { key: "on_hold", label: "On hold" },
  { key: "delayed", label: "Delayed invoice" },
  { key: "overdue", label: "Overdue" },
];

export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    status?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : currentMonthKey();

  if (month === currentMonthKey()) ensureCycles(month);

  const today = zonedToday().iso;
  const allCycles = listCycles(month).map((cycle) => ({
    ...cycle,
    health: deriveHealth(cycle, cycle, today),
  }));

  const statusFilter = params.status ?? "all";
  const counts = {
    all: allCycles.length,
    awaiting: allCycles.filter((cycle) => cycle.invoice_status === "awaiting").length,
    received: allCycles.filter((cycle) => cycle.invoice_status === "received").length,
    approval_pending: allCycles.filter((cycle) => cycle.approval_status === "pending").length,
    approved: allCycles.filter((cycle) => cycle.approval_status === "approved").length,
    rejected: allCycles.filter((cycle) => cycle.approval_status === "rejected").length,
    pending: allCycles.filter((cycle) => cycle.payment_status === "pending").length,
    paid: allCycles.filter((cycle) => cycle.payment_status === "paid").length,
    on_hold: allCycles.filter((cycle) => cycle.payment_status === "on_hold").length,
    delayed: allCycles.filter((cycle) => cycle.health.invoiceDelayed).length,
    overdue: allCycles.filter((cycle) => cycle.health.overdue).length,
  } as Record<string, number>;

  const rows = allCycles.filter((cycle) => {
    switch (statusFilter) {
      case "awaiting":
        return cycle.invoice_status === "awaiting";
      case "received":
        return cycle.invoice_status === "received";
      case "approval_pending":
        return cycle.approval_status === "pending";
      case "approved":
        return cycle.approval_status === "approved";
      case "rejected":
        return cycle.approval_status === "rejected";
      case "pending":
        return cycle.payment_status === "pending";
      case "paid":
        return cycle.payment_status === "paid";
      case "on_hold":
        return cycle.payment_status === "on_hold";
      case "delayed":
        return cycle.health.invoiceDelayed;
      case "overdue":
        return cycle.health.overdue;
      default:
        return true;
    }
  });

  const months = buildMonthList(
    [...monthOptions(12), ...listMonthKeysWithCycles(18)],
    [month],
  );

  const redirectTo = `/cycles?month=${month}${
    statusFilter !== "all" ? `&status=${statusFilter}` : ""
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monthly cycles"
        title="Invoice & payment tracking"
        description={`${formatMonth(month)} — receiving an invoice does not automatically mark it paid. Status changes are audited and queued for notification.`}
        actions={
          <form action={generateCyclesAction}>
            <input type="hidden" name="month" value={month} />
            <SubmitButton
              label="Generate missing cycles"
              pendingLabel="Generating…"
              className="btn btn-secondary"
            />
          </form>
        }
      />

      <Flash notice={params.notice} error={params.error} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cycles this month" value={counts.all} tone="indigo" />
        <StatCard label="Invoices awaiting" value={counts.awaiting} tone="amber" />
        <StatCard label="Payments pending" value={counts.pending} tone="sky" />
        <StatCard label="Overdue" value={counts.overdue} tone="rose" />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <select name="month" defaultValue={month} className="select w-48">
            {months.map((key) => (
              <option key={key} value={key}>
                {formatMonth(key)}
                {key === currentMonthKey() ? " (current)" : ""}
              </option>
            ))}
          </select>
          {statusFilter !== "all" ? (
            <input type="hidden" name="status" value={statusFilter} />
          ) : null}
          <button type="submit" className="btn btn-secondary btn-xs">
            View month
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => {
            const active = statusFilter === filter.key;
            const href = `/cycles?month=${month}${
              filter.key === "all" ? "" : `&status=${filter.key}`
            }`;
            return (
              <Link
                key={filter.key}
                href={href}
                className={`badge transition ${
                  active
                    ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                    : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                {filter.label}
                <span className="text-[10px] opacity-70">{counts[filter.key] ?? 0}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={`No ${statusFilter === "all" ? "" : `${statusFilter.replace(/_/g, " ")} `}cycles for ${formatMonthShort(month)}`}
          description={
            allCycles.length === 0
              ? "Generate monthly cycles for active bills, or add a new bill to start tracking."
              : "No cycles match the selected filter. Choose another status or month."
          }
          actionHref={`/cycles?month=${month}`}
          actionLabel={statusFilter === "all" ? "View current month" : "Clear filter"}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="border-b border-slate-200/70 bg-slate-50">
                <tr>
                  <th className="th">Bill</th>
                  <th className="th">Invoice</th>
                  <th className="th">Approval</th>
                  <th className="th">Payment</th>
                  <th className="th">Recorded dates</th>
                  <th className="th">Health</th>
                  <th className="th">Deadline</th>
                  <th className="th">Update status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cycle) => (
                  <tr key={cycle.id} className="border-b border-slate-200/70 last:border-b-0">
                    <td className="td">
                      <Link
                        href={`/bills/${cycle.bill_id}`}
                        className="font-medium text-slate-900 hover:text-indigo-700"
                      >
                        {cycle.bill_name}
                      </Link>
                      <p className="text-[11px] text-slate-500">
                        {cycle.provider} · {cycle.category}
                      </p>
                    </td>
                    <td className="td">
                      <InvoiceBadge status={cycle.invoice_status} />
                    </td>
                    <td className="td">
                      <ApprovalBadge status={cycle.approval_status} />
                    </td>
                    <td className="td">
                      <PaymentBadge status={cycle.payment_status} />
                    </td>
                    <td className="td">
                      <p className="text-xs text-slate-500">
                        Received {formatDate(cycle.invoice_received_at)}
                      </p>
                      {cycle.approved_at ? (
                        <p className="text-xs text-slate-500">
                          Approved {formatDate(cycle.approved_at)}
                        </p>
                      ) : null}
                      <p className="text-xs text-slate-500">
                        Paid {formatDate(cycle.payment_date)}
                      </p>
                      {cycle.payment_reference ? (
                        <p className="text-[11px] text-slate-500">
                          Ref {cycle.payment_reference}
                        </p>
                      ) : null}
                    </td>
                    <td className="td">
                      <HealthBadge health={cycle.health} />
                    </td>
                    <td className="td whitespace-nowrap">
                      {formatDate(dateForDay(month, cycle.payment_deadline_day))}
                    </td>
                    <td className="td">
                      <details>
                        <summary className="btn btn-secondary btn-xs cursor-pointer list-none">
                          Change
                        </summary>
                        <form
                          action={changeCycleStatusAction}
                          className="mt-2 w-60 space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                        >
                          <input type="hidden" name="cycle_id" value={cycle.id} />
                          <input type="hidden" name="redirect_to" value={redirectTo} />
                          <select
                            name="action"
                            className="select text-xs"
                            defaultValue="invoice_received"
                          >
                            <option value="invoice_received">Mark invoice received</option>
                            <option value="invoice_awaiting">Invoice awaiting</option>
                            <option value="invoice_na">Invoice not applicable</option>
                            <option value="approve">Approve for payment</option>
                            <option value="reject">Reject approval</option>
                            <option value="approval_pending">Reset approval to pending</option>
                            <option value="paid">Mark payment paid</option>
                            <option value="pending">Payment pending</option>
                            <option value="on_hold">Payment on hold</option>
                          </select>
                          <input
                            name="payment_reference"
                            className="input text-xs"
                            placeholder="Payment reference (optional)"
                          />
                          <input
                            name="note"
                            className="input text-xs"
                            placeholder="Note (optional)"
                          />
                          <SubmitButton
                            label="Apply update"
                            className="btn btn-primary btn-xs w-full"
                          />
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Changing a status queues notifications in the same transaction. The email worker sends
        them separately, so a temporary mail failure never reverts a payment record. Marking a
        payment paid cancels that month&apos;s queued payment reminders and sends the paid
        confirmation when the bill&apos;s paid rule is enabled.
      </p>
    </div>
  );
}
