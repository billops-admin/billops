import Link from "next/link";
import { runEngineAction } from "@/actions/bills";
import {
  ApprovalBadge,
  BillStatusBadge,
  HealthBadge,
  InvoiceBadge,
  PaymentBadge,
} from "@/components/badges";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Flash, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import {
  buildMonthList,
  currentMonthKey,
  dateForDay,
  formatDate,
  formatMonth,
  formatMonthShort,
  monthOptions,
} from "@/lib/dates";
import { ensureCycles } from "@/lib/engine";
import {
  getDashboardData,
  listMonthKeysWithCycles,
  type BillWithMeta,
  type HistoryWithBill,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function changeText(row: HistoryWithBill): string {
  const parts: string[] = [];
  const format = (value: string | null) => (value ? value.replace(/_/g, " ") : "—");

  if (row.previous_invoice_status !== row.new_invoice_status) {
    parts.push(`Invoice ${format(row.previous_invoice_status)} → ${format(row.new_invoice_status)}`);
  }
  if (row.previous_approval_status !== row.new_approval_status) {
    parts.push(
      `Approval ${format(row.previous_approval_status)} → ${format(row.new_approval_status)}`,
    );
  }
  if (row.previous_payment_status !== row.new_payment_status) {
    parts.push(`Payment ${format(row.previous_payment_status)} → ${format(row.new_payment_status)}`);
  }
  return parts.join(" · ") || "Status recorded";
}

function BillQuickRow({ bill, month }: { bill: BillWithMeta; month: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200/70 px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/bills/${bill.id}`}
            className="truncate text-sm font-semibold text-slate-900 hover:text-indigo-700"
          >
            {bill.name}
          </Link>
          <span className="text-[11px] text-slate-500">{bill.category}</span>
          {bill.status !== "active" ? <BillStatusBadge status={bill.status} /> : null}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Arrival {bill.arrival_start_day}–{bill.arrival_end_day} · Target{" "}
          {formatDate(dateForDay(month, bill.payment_target_day))} · Deadline{" "}
          {formatDate(dateForDay(month, bill.payment_deadline_day))}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {bill.cycle ? (
          <>
            <InvoiceBadge status={bill.cycle.invoice_status} />
            <ApprovalBadge status={bill.cycle.approval_status} />
            <PaymentBadge status={bill.cycle.payment_status} />
          </>
        ) : (
          <span className="badge border-slate-200 bg-slate-100 text-slate-500">
            No cycle
          </span>
        )}
        <HealthBadge health={bill.health} />
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const currentMonth = currentMonthKey();
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : currentMonth;
  const isCurrentMonth = month === currentMonth;

  if (isCurrentMonth) ensureCycles(month);

  const data = getDashboardData(month);
  const progress = data.totals.activeBills
    ? Math.round((data.totals.paidThisMonth / data.totals.activeBills) * 100)
    : 0;
  const months = buildMonthList(
    [...monthOptions(12), ...listMonthKeysWithCycles(24)],
    [month],
  );

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={isCurrentMonth ? "Dashboard" : "Dashboard · selected month"}
        title="BillOps overview"
        description={`Recurring bill control for ${formatMonth(month)}. Add a bill once and the daily engine discovers it automatically.`}
        actions={
          <>
            <form action={runEngineAction}>
              <input type="hidden" name="redirect_to" value="/" />
              <SubmitButton
                label="Run daily check"
                pendingLabel="Running…"
                className="btn btn-primary"
              />
            </form>
            <Link href="/bills/new" className="btn btn-secondary">
              Add bill
            </Link>
          </>
        }
      />

      <Flash notice={params.notice} error={params.error} />

      <div className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Reporting period
          </span>
          <form method="get" className="flex items-center gap-2">
            <select name="month" defaultValue={month} className="select w-52 py-2 text-sm">
              {months.map((key) => (
                <option key={key} value={key}>
                  {formatMonth(key)}
                  {key === currentMonth ? " (current)" : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary btn-xs">
              View month
            </button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-500">
            {isCurrentMonth
              ? "Showing the current month."
              : `Showing ${formatMonth(month)}. Paid and pending counts follow this month.`}
          </p>
          {!isCurrentMonth ? (
            <Link href="/" className="btn btn-ghost btn-xs">
              Current month
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active bills"
          value={data.totals.activeBills}
          hint="Being tracked monthly"
          tone="indigo"
        />
        <StatCard
          label="Paid bills"
          value={data.totals.paidThisMonth}
          hint={`Paid in ${formatMonth(month)}`}
          tone="emerald"
        />
        <StatCard
          label="Pending payments"
          value={data.totals.pendingPayments}
          hint="Invoice or payment open"
          tone="sky"
        />
        <StatCard
          label="Overdue"
          value={data.totals.overdue}
          hint="Past the final deadline"
          tone="rose"
        />
        <StatCard
          label="Awaiting invoices"
          value={data.totals.awaitingInvoices}
          hint="Not yet marked received"
          tone="amber"
        />
        <StatCard
          label="Delayed invoices"
          value={data.totals.delayedInvoices}
          hint="Arrival window passed"
          tone="amber"
        />
        <StatCard
          label="Collection rate"
          value={`${progress}%`}
          hint="Paid vs active bills"
          tone="slate"
        />
        <StatCard
          label="Emails sent"
          value={data.totals.sentLast30}
          hint="Last 30 days"
          tone="emerald"
        />
      </section>

      {data.totals.pendingApprovals > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-800 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">
              {data.totals.pendingApprovals} bill
              {data.totals.pendingApprovals === 1 ? "" : "s"}
            </span>{" "}
            awaiting approval. Payment reminders are paused until each bill is approved.
          </p>
          <Link
            href="/cycles?status=approval_pending"
            className="btn btn-secondary btn-xs shrink-0"
          >
            Review approvals
          </Link>
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
            <SectionTitle
              title="Needs attention"
              description="Overdue payments, delayed invoices, approvals and payment targets reached."
              action={
                <Link href="/cycles" className="btn btn-ghost btn-xs">
                  View cycles
                </Link>
              }
            />
          </div>

          {data.attention.length === 0 ? (
            <div className="px-5 py-10 sm:px-6">
              <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
                <p className="text-sm font-semibold text-emerald-700">
                  Nothing needs attention right now
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Every active bill is within its expected arrival and payment window.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-slate-200/70">
                  <tr>
                    <th className="th">Bill</th>
                    <th className="th">Invoice</th>
                    <th className="th">Approval</th>
                    <th className="th">Payment</th>
                    <th className="th">Health</th>
                    <th className="th">Deadline</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {data.attention.map((bill) => (
                    <tr key={bill.id} className="border-b border-slate-200/70 last:border-b-0">
                      <td className="td">
                        <Link
                          href={`/bills/${bill.id}`}
                          className="font-medium text-slate-900 hover:text-indigo-700"
                        >
                          {bill.name}
                        </Link>
                        <p className="text-[11px] text-slate-500">{bill.provider}</p>
                      </td>
                      <td className="td">
                        {bill.cycle ? (
                          <InvoiceBadge status={bill.cycle.invoice_status} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        {bill.cycle ? (
                          <ApprovalBadge status={bill.cycle.approval_status} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        {bill.cycle ? (
                          <PaymentBadge status={bill.cycle.payment_status} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="td">
                        <HealthBadge health={bill.health} />
                      </td>
                      <td className="td whitespace-nowrap">
                        {formatDate(dateForDay(month, bill.payment_deadline_day))}
                      </td>
                      <td className="td text-right">
                        <Link href={`/bills/${bill.id}`} className="btn btn-secondary btn-xs">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="card card-pad">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {formatMonth(month)} progress
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {data.totals.paidThisMonth}
              <span className="text-lg text-slate-500"> / {data.totals.activeBills}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">Bills paid this month</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-right text-[11px] text-slate-500">{progress}% complete</p>

            <dl className="mt-5 space-y-2.5 border-t border-slate-200/70 pt-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Queued notifications</dt>
                <dd className="font-medium text-slate-800">{data.totals.pendingOutbox}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Emails sent (30d)</dt>
                <dd className="font-medium text-slate-800">{data.totals.sentLast30}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Next run</dt>
                <dd className="font-medium text-slate-800">Daily cron</dd>
              </div>
            </dl>

            <Link href="/reports" className="btn btn-secondary mt-5 w-full">
              Open reports & logs
            </Link>
          </div>

          <div className="card card-pad">
            <h3 className="text-sm font-semibold text-slate-900">How this stays reliable</h3>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-500">
              <li>Status changes and outbox records are written in one transaction.</li>
              <li>Reminders are deduplicated per cycle, rule, scheduled date and recipient.</li>
              <li>Failed emails retry with backoff without reverting payment status.</li>
              <li>Marking a bill paid cancels its queued payment reminders for that month.</li>
              <li>A paid confirmation is emailed when the bill&apos;s paid rule is enabled.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <SectionTitle
            title="Bill snapshot"
            description="Current monthly cycle for every configured bill."
            action={
              <Link href="/bills" className="btn btn-ghost btn-xs">
                Manage bills
              </Link>
            }
          />
        </div>

        {data.bills.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              title="No bills configured"
              description="Add your first bill and BillOps will start tracking its monthly cycles."
              actionHref="/bills/new"
              actionLabel="Add a bill"
            />
          </div>
        ) : (
          <div>
            {data.bills.map((bill) => (
              <BillQuickRow key={bill.id} bill={bill} month={month} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
          <SectionTitle
            title="Recent activity"
            description="Status changes recorded in the audit trail."
            action={
              <Link href="/reports?tab=history" className="btn btn-ghost btn-xs">
                Full history
              </Link>
            }
          />
        </div>

        {data.recentHistory.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500 sm:px-6">
            No status changes yet. Mark an invoice received or a payment paid to start the audit
            trail.
          </div>
        ) : (
          <ul className="divide-y divide-slate-200/70">
            {data.recentHistory.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 px-5 py-3.5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{row.bill_name}</span>
                  <span className="text-[11px] text-slate-500">
                    {formatMonthShort(row.billing_month)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {changeText(row)}
                  {row.change_note ? ` — ${row.change_note}` : ""}
                </p>
                <p className="text-[11px] text-slate-500">
                  {row.changed_by} · {formatDate(row.created_at.slice(0, 10))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
