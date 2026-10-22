import Link from "next/link";
import { processOutboxAction, runEngineAction } from "@/actions/bills";
import { OutboxStatusBadge } from "@/components/badges";
import SubmitButton from "@/components/SubmitButton";
import { Flash, PageHeader, StatCard } from "@/components/ui";
import { formatDateTime, formatMonthShort } from "@/lib/dates";
import { getReportsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "emails", label: "Email delivery log" },
  { key: "outbox", label: "Notification outbox" },
  { key: "history", label: "Status audit trail" },
];

function changeText(row: {
  previous_invoice_status: string | null;
  new_invoice_status: string | null;
  previous_approval_status: string | null;
  new_approval_status: string | null;
  previous_payment_status: string | null;
  new_payment_status: string | null;
}): string {
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const tab =
    params.tab && TABS.some((item) => item.key === params.tab) ? params.tab : "emails";
  const data = getReportsData();

  const outboxCounts = Object.fromEntries(
    data.outboxStats.map((row) => [row.status, Number(row.count)]),
  );
  const emailCounts = Object.fromEntries(
    data.emailStats.map((row) => [row.status, Number(row.count)]),
  );
  const queued = (outboxCounts.pending ?? 0) + (outboxCounts.processing ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports & logs"
        title="Delivery, outbox and audit trail"
        description="A reliable notification pipeline keeps status changes and email delivery independent."
        actions={
          <>
            <form action={runEngineAction}>
              <input type="hidden" name="redirect_to" value={`/reports?tab=${tab}`} />
              <SubmitButton
                label="Run daily check"
                pendingLabel="Running…"
                className="btn btn-secondary"
              />
            </form>
            <form action={processOutboxAction}>
              <input type="hidden" name="redirect_to" value="/reports?tab=outbox" />
              <SubmitButton
                label="Process email queue"
                pendingLabel="Processing…"
                className="btn btn-primary"
              />
            </form>
          </>
        }
      />

      <Flash notice={params.notice} error={params.error} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Emails sent"
          value={emailCounts.sent ?? 0}
          hint="Accepted by the provider"
          tone="emerald"
        />
        <StatCard
          label="Failed emails"
          value={emailCounts.failed ?? 0}
          hint="Logged with error detail"
          tone="rose"
        />
        <StatCard
          label="Queued notifications"
          value={queued}
          hint="Pending or processing"
          tone="amber"
        />
        <StatCard
          label="Audit entries"
          value={data.history.length}
          hint="Most recent 60 shown"
          tone="indigo"
        />
      </section>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={`/reports?tab=${item.key}`}
            className={`badge transition ${
              tab === item.key
                ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <section className="card overflow-hidden">
        {tab === "emails" ? (
          data.emails.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-800">No email attempts yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Run the daily check, then process the email queue to create delivery logs.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-200/70 bg-slate-50">
                  <tr>
                    <th className="th">Time</th>
                    <th className="th">To</th>
                    <th className="th">Subject</th>
                    <th className="th">Status</th>
                    <th className="th">Provider</th>
                    <th className="th">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {data.emails.map((email) => (
                    <tr key={email.id} className="border-b border-slate-200/70 last:border-b-0">
                      <td className="td whitespace-nowrap text-xs text-slate-500">
                        {formatDateTime(email.created_at)}
                      </td>
                      <td className="td whitespace-nowrap">{email.to_email}</td>
                      <td className="td max-w-md">
                        <span className="line-clamp-1">{email.subject}</span>
                      </td>
                      <td className="td">
                        <span
                          className={`badge ${
                            email.status === "sent"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-rose-200 bg-rose-50 text-rose-700"
                          }`}
                        >
                          {email.status}
                        </span>
                      </td>
                      <td className="td text-xs uppercase tracking-wider text-slate-500">
                        {email.provider}
                      </td>
                      <td className="td max-w-xs text-xs text-slate-500">
                        {email.error ? (
                          <span className="text-rose-700/80">{email.error}</span>
                        ) : (
                          <span className="font-mono text-[11px]">
                            {email.provider_message_id ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "outbox" ? (
          data.outbox.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-800">Outbox is empty</p>
              <p className="mt-1 text-sm text-slate-500">
                Reminder and status-change notifications will appear here before delivery.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="border-b border-slate-200/70 bg-slate-50">
                  <tr>
                    <th className="th">ID</th>
                    <th className="th">Created</th>
                    <th className="th">Event</th>
                    <th className="th">Recipient</th>
                    <th className="th">Subject</th>
                    <th className="th">Status</th>
                    <th className="th">Attempts</th>
                    <th className="th">Last error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outbox.map((row) => (
                    <tr key={row.id} className="border-b border-slate-200/70 last:border-b-0">
                      <td className="td font-mono text-xs text-slate-500">#{row.id}</td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="td text-xs text-slate-700">
                        {row.event_type.replace(/_/g, " ")}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        {row.recipient_email}
                        <span className="ml-1 text-[10px] uppercase text-slate-500">
                          {row.recipient_type}
                        </span>
                      </td>
                      <td className="td max-w-sm">
                        <span className="line-clamp-1">{row.subject}</span>
                      </td>
                      <td className="td">
                        <OutboxStatusBadge status={row.status} />
                      </td>
                      <td className="td text-center text-xs text-slate-500">
                        {row.attempt_count}
                      </td>
                      <td className="td max-w-xs text-xs text-rose-700/80">
                        {row.last_error ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === "history" ? (
          data.history.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-semibold text-slate-800">No audit entries yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Status changes from the cycles page will be recorded here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="border-b border-slate-200/70 bg-slate-50">
                  <tr>
                    <th className="th">Time</th>
                    <th className="th">Bill</th>
                    <th className="th">Month</th>
                    <th className="th">Change</th>
                    <th className="th">Changed by</th>
                    <th className="th">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.id} className="border-b border-slate-200/70 last:border-b-0">
                      <td className="td whitespace-nowrap text-xs text-slate-500">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="td">
                        <Link
                          href={`/bills/${row.bill_id}`}
                          className="text-slate-800 hover:text-indigo-700"
                        >
                          {row.bill_name}
                        </Link>
                        <p className="text-[11px] text-slate-500">{row.category}</p>
                      </td>
                      <td className="td whitespace-nowrap text-xs text-slate-500">
                        {formatMonthShort(row.billing_month)}
                      </td>
                      <td className="td text-xs text-slate-700">{changeText(row)}</td>
                      <td className="td text-xs text-slate-500">{row.changed_by}</td>
                      <td className="td max-w-xs text-xs text-slate-500">
                        {row.change_note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      <p className="text-xs text-slate-500">
        Accepted sends are logged separately from confirmed delivery. The local console provider
        writes .eml files to <span className="font-mono text-slate-500">data/outbox</span> instead
        of contacting Gmail.
      </p>
    </div>
  );
}
