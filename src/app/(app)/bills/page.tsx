import { Fragment } from "react";
import Link from "next/link";
import { BillStatusBadge, HealthBadge, InvoiceBadge, PaymentBadge } from "@/components/badges";
import { EmptyState, Flash, PageHeader } from "@/components/ui";
import { currentMonthKey, dateForDay, formatDate, formatMonth } from "@/lib/dates";
import { ensureCycles } from "@/lib/engine";
import { groupBillsByProvider, listBillsWithMeta } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const month = currentMonthKey();
  ensureCycles(month);
  const query = (params.q ?? "").trim().toLowerCase();
  const allBills = listBillsWithMeta(month);
  const bills = query
    ? allBills.filter(
        (bill) =>
          bill.name.toLowerCase().includes(query) ||
          bill.provider.toLowerCase().includes(query) ||
          bill.category.toLowerCase().includes(query),
      )
    : allBills;
  const groups = groupBillsByProvider(bills);

  const active = allBills.filter((bill) => bill.status === "active").length;
  const paused = allBills.filter((bill) => bill.status === "paused").length;
  const inactive = allBills.filter((bill) => bill.status === "inactive").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bills"
        title="Recurring bill definitions"
        description="Each definition stores the provider schedule, recipients and reminder rules. Monthly instances are tracked separately."
        actions={
          <Link href="/bills/new" className="btn btn-primary">
            Add new bill
          </Link>
        }
      />

      <Flash notice={params.notice} error={params.error} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <span className="badge border-slate-200 bg-slate-100 text-slate-700">
            {allBills.length} total
          </span>
          <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700">
            {active} active
          </span>
          <span className="badge border-amber-200 bg-amber-50 text-amber-700">
            {paused} paused
          </span>
          <span className="badge border-slate-200 bg-slate-100 text-slate-500">
            {inactive} inactive
          </span>
          <span className="badge border-indigo-200 bg-indigo-50 text-indigo-600">
            {formatMonth(month)}
          </span>
        </div>

        <form method="get" className="flex w-full gap-2 sm:w-auto">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            className="input sm:w-64"
            placeholder="Search bill or provider…"
          />
          <button type="submit" className="btn btn-secondary shrink-0">
            Search
          </button>
        </form>
      </div>

      {bills.length === 0 ? (
        <EmptyState
          title={query ? "No bills match your search" : "No bills yet"}
          description={
            query
              ? "Try a different bill name, provider or category."
              : "Create a bill definition and the daily engine will start tracking it automatically."
          }
          actionHref={query ? "/bills" : "/bills/new"}
          actionLabel={query ? "Clear search" : "Add your first bill"}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-slate-200/70 bg-slate-50">
                <tr>
                  <th className="th">Bill</th>
                  <th className="th">Schedule</th>
                  <th className="th">Invoice</th>
                  <th className="th">Payment</th>
                  <th className="th">Health</th>
                  <th className="th">Recipients</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.provider}>
                    <tr className="bg-slate-50">
                      <td
                        colSpan={8}
                        className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500"
                      >
                        {group.provider} · {group.bills.length} bill
                        {group.bills.length === 1 ? "" : "s"}
                      </td>
                    </tr>
                    {group.bills.map((bill) => (
                      <tr
                        key={bill.id}
                        className="border-b border-slate-200/70 transition last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="td">
                          <Link
                            href={`/bills/${bill.id}`}
                            className="font-medium text-slate-900 hover:text-indigo-700"
                          >
                            {bill.name}
                          </Link>
                          <p className="text-[11px] text-slate-500">
                            {bill.provider} · {bill.category}
                            {bill.account_number ? ` · A/C ${bill.account_number}` : ""}
                          </p>
                        </td>
                        <td className="td">
                          <p className="text-xs text-slate-700">
                            Arrival {bill.arrival_start_day}–{bill.arrival_end_day}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Target {formatDate(dateForDay(month, bill.payment_target_day))}
                          </p>
                        </td>
                        <td className="td">
                          {bill.cycle ? <InvoiceBadge status={bill.cycle.invoice_status} /> : "—"}
                        </td>
                        <td className="td">
                          {bill.cycle ? <PaymentBadge status={bill.cycle.payment_status} /> : "—"}
                        </td>
                        <td className="td">
                          <HealthBadge health={bill.health} />
                        </td>
                        <td className="td">
                          <span className="text-slate-700">{bill.recipient_count}</span>
                          <span className="ml-1 text-[11px] text-slate-500">
                            / {bill.rule_count} rules
                          </span>
                        </td>
                        <td className="td">
                          <BillStatusBadge status={bill.status} />
                        </td>
                        <td className="td text-right">
                          <Link href={`/bills/${bill.id}`} className="btn btn-secondary btn-xs">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        The internal payment target is separate from the final deadline. Targets drive early
        reminders; deadlines drive overdue escalation.
      </p>
    </div>
  );
}
