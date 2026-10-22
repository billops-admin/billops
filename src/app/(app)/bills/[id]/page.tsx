import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addRecipientAction,
  addRuleAction,
  removeRecipientAction,
  removeRuleAction,
  setBillStatusAction,
  toggleRecipientFlagAction,
  toggleRuleAction,
  updateBillAction,
} from "@/actions/bills";
import { changeCycleStatusAction } from "@/actions/cycles";
import {
  ApprovalBadge,
  BillStatusBadge,
  HealthBadge,
  InvoiceBadge,
  PaymentBadge,
} from "@/components/badges";
import BillForm from "@/components/BillForm";
import SubmitButton from "@/components/SubmitButton";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import {
  currentMonthKey,
  dateForDay,
  formatDate,
  formatDateTime,
  formatMonth,
  formatMonthShort,
  monthLabel,
  zonedToday,
} from "@/lib/dates";
import { ensureCycles } from "@/lib/engine";
import { deriveHealth } from "@/lib/health";
import { currentCycleForBill, getBillDetail, type HistoryWithBill } from "@/lib/queries";

export const dynamic = "force-dynamic";

const ANCHOR_LABELS: Record<string, string> = {
  arrival_end: "arrival window end",
  payment_target: "payment target",
  payment_deadline: "final deadline",
};

function ruleSchedule(rule: {
  rule_type: string;
  day_of_month: number | null;
  offset_days: number | null;
  anchor: string | null;
}): string {
  if (rule.rule_type === "payment_paid") return "When payment is marked paid";
  if (rule.day_of_month != null) return `Day ${rule.day_of_month} of the month`;
  if (rule.offset_days != null && rule.anchor) {
    const offset = rule.offset_days;
    return `${offset >= 0 ? "+" : ""}${offset} day${Math.abs(offset) === 1 ? "" : "s"} from ${
      ANCHOR_LABELS[rule.anchor] ?? rule.anchor
    }`;
  }
  return "Not configured";
}

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

export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const billId = Math.trunc(Number(id));
  if (!Number.isFinite(billId) || billId <= 0) notFound();

  const month = currentMonthKey();
  ensureCycles(month);

  const data = getBillDetail(billId);
  if (!data) notFound();

  const { bill, recipients, rules, cycles, history } = data;
  const today = zonedToday(bill.timezone);
  const currentCycle =
    cycles.find((cycle) => cycle.billing_month === month) ??
    currentCycleForBill(bill.id, month) ??
    null;
  const health = deriveHealth(bill, currentCycle, today.iso);
  const redirectTo = `/bills/${bill.id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Bills / ${bill.category}`}
        title={bill.name}
        description={`${bill.provider} · ${formatMonth(month)} cycle · ${bill.timezone}`}
        actions={
          <>
            <BillStatusBadge status={bill.status} />
            {bill.status !== "active" ? (
              <form action={setBillStatusAction}>
                <input type="hidden" name="id" value={bill.id} />
                <input type="hidden" name="status" value="active" />
                <SubmitButton label="Activate" className="btn btn-secondary btn-xs" />
              </form>
            ) : (
              <form action={setBillStatusAction}>
                <input type="hidden" name="id" value={bill.id} />
                <input type="hidden" name="status" value="paused" />
                <SubmitButton label="Pause" className="btn btn-secondary btn-xs" />
              </form>
            )}
            {bill.status !== "inactive" ? (
              <form action={setBillStatusAction}>
                <input type="hidden" name="id" value={bill.id} />
                <input type="hidden" name="status" value="inactive" />
                <SubmitButton label="Deactivate" className="btn btn-danger btn-xs" />
              </form>
            ) : null}
            <Link href="/bills" className="btn btn-ghost btn-xs">
              All bills
            </Link>
          </>
        }
      />

      <Flash notice={query.notice} error={query.error} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Expected arrival
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-900">
            {bill.arrival_start_day}–{bill.arrival_end_day}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(dateForDay(month, bill.arrival_start_day))} –{" "}
            {formatDate(dateForDay(month, bill.arrival_end_day))}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Internal target
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-900">
            {monthLabel(bill.payment_target_day)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(dateForDay(month, bill.payment_target_day))}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Final deadline
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-900">
            {monthLabel(bill.payment_deadline_day)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(dateForDay(month, bill.payment_deadline_day))}
          </p>
        </div>
        <div className="card card-pad">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            This cycle
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {currentCycle ? (
              <>
                <InvoiceBadge status={currentCycle.invoice_status} />
                <ApprovalBadge status={currentCycle.approval_status} />
                <PaymentBadge status={currentCycle.payment_status} />
              </>
            ) : (
              <span className="text-xs text-slate-500">No cycle generated</span>
            )}
          </div>
          <div className="mt-2">
            <HealthBadge health={health} />
          </div>
        </div>
      </section>

      {bill.notes ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <span className="font-semibold text-indigo-700">Note: </span>
          {bill.notes}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card">
            <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
              <SectionTitle
                title="Monthly cycles"
                description="Invoice and payment status are tracked independently for each month."
                action={
                  <Link href={`/cycles?month=${month}`} className="btn btn-ghost btn-xs">
                    Open cycles
                  </Link>
                }
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-slate-200/70 bg-slate-50">
                  <tr>
                    <th className="th">Month</th>
                    <th className="th">Invoice</th>
                    <th className="th">Approval</th>
                    <th className="th">Payment</th>
                    <th className="th">Dates</th>
                    <th className="th">Health</th>
                    <th className="th">Update</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((cycle) => {
                    const cycleHealth = deriveHealth(bill, cycle, today.iso);
                    return (
                      <tr key={cycle.id} className="border-b border-slate-200/70 last:border-b-0">
                        <td className="td whitespace-nowrap">
                          {formatMonthShort(cycle.billing_month)}
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
                          <HealthBadge health={cycleHealth} />
                        </td>
                        <td className="td">
                          <details>
                            <summary className="btn btn-secondary btn-xs cursor-pointer list-none">
                              Change
                            </summary>
                            <form
                              action={changeCycleStatusAction}
                              className="mt-2 w-56 space-y-2 rounded-xl border border-slate-200 bg-white p-3"
                            >
                              <input type="hidden" name="cycle_id" value={cycle.id} />
                              <input type="hidden" name="redirect_to" value={redirectTo} />
                              <select name="action" className="select text-xs" defaultValue="invoice_received">
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
                                label="Apply"
                                className="btn btn-primary btn-xs w-full"
                              />
                            </form>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle
              title="Bill configuration"
              description="Changing the schedule updates matching auto-created reminder rules."
            />
            <BillForm
              action={updateBillAction}
              mode="edit"
              bill={bill}
              cancelHref={`/bills/${bill.id}`}
            />
          </section>

          <section className="card">
            <div className="border-b border-slate-200/70 px-5 py-4 sm:px-6">
              <SectionTitle
                title="Status history"
                description="Who changed what, when, and the previous state."
              />
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500 sm:px-6">
                No status changes recorded for this bill yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-200/70">
                {history.map((row) => (
                  <li key={row.id} className="px-5 py-3.5 sm:px-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">
                        {formatMonthShort(row.billing_month)}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {formatDateTime(row.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{changeText(row)}</p>
                    {row.change_note ? (
                      <p className="mt-0.5 text-xs text-slate-500">Note: {row.change_note}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-slate-500">{row.changed_by}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <SectionTitle
                title="Recipients"
                description="Choose exactly which emails each person receives."
              />
            </div>

            <div className="divide-y divide-slate-200/70">
              {recipients.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">
                  No recipients configured.
                </p>
              ) : (
                recipients.map((recipient) => (
                  <div key={recipient.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {recipient.email}
                        </p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">
                          {recipient.recipient_type}
                        </p>
                      </div>
                      <form action={removeRecipientAction}>
                        <input type="hidden" name="bill_id" value={bill.id} />
                        <input type="hidden" name="id" value={recipient.id} />
                        <SubmitButton
                          label="Remove"
                          className="btn btn-ghost btn-xs text-rose-700 hover:text-rose-700"
                        />
                      </form>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[
                        {
                          field: "invoice",
                          label: "Invoice",
                          on: recipient.receive_invoice,
                          activeClass: "border border-indigo-200 bg-indigo-50 text-indigo-700",
                        },
                        {
                          field: "approval",
                          label: "Approval",
                          on: recipient.receive_approval,
                          activeClass: "border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
                        },
                        {
                          field: "payment",
                          label: "Payment",
                          on: recipient.receive_payment,
                          activeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
                        },
                        {
                          field: "overdue",
                          label: "Overdue",
                          on: recipient.receive_overdue,
                          activeClass: "border border-amber-200 bg-amber-50 text-amber-700",
                        },
                        {
                          field: "paid",
                          label: "Paid",
                          on: recipient.receive_paid,
                          activeClass: "border border-violet-200 bg-violet-50 text-violet-700",
                        },
                        {
                          field: "status",
                          label: "Status",
                          on: recipient.receive_status_updates,
                          activeClass: "border border-sky-200 bg-sky-50 text-sky-700",
                        },
                      ].map((flag) => (
                        <form key={flag.field} action={toggleRecipientFlagAction}>
                          <input type="hidden" name="bill_id" value={bill.id} />
                          <input type="hidden" name="id" value={recipient.id} />
                          <input type="hidden" name="field" value={flag.field} />
                          <input type="hidden" name="value" value={flag.on ? "0" : "1"} />
                          <SubmitButton
                            label={`${flag.label} ${flag.on ? "on" : "off"}`}
                            className={`btn btn-xs ${
                              flag.on
                                ? flag.activeClass
                                : "border border-slate-200 bg-slate-100 text-slate-500"
                            }`}
                          />
                        </form>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              action={addRecipientAction}
              className="space-y-2 border-t border-slate-200/70 px-5 py-4"
            >
              <input type="hidden" name="bill_id" value={bill.id} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Add recipient
              </p>
              <input
                name="email"
                type="email"
                className="input text-sm"
                placeholder="name@company.com"
                required
              />
              <select name="recipient_type" className="select text-sm" defaultValue="to">
                <option value="to">To</option>
                <option value="cc">CC</option>
                <option value="bcc">BCC</option>
              </select>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                {[
                  ["receive_invoice", "Invoice"],
                  ["receive_approval", "Approval"],
                  ["receive_payment", "Payment"],
                  ["receive_overdue", "Overdue"],
                  ["receive_paid", "Paid"],
                  ["receive_status_updates", "Status"],
                ].map(([name, label]) => (
                  <label key={name} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name={name}
                      defaultChecked
                      className="h-3.5 w-3.5 accent-indigo-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <SubmitButton
                label="Add recipient"
                className="btn btn-secondary btn-xs w-full"
              />
            </form>
          </section>

          <section className="card">
            <div className="border-b border-slate-200/70 px-5 py-4">
              <SectionTitle
                title="Reminder rules"
                description="A single daily job evaluates every active rule. Payment reminders stop automatically once the month is marked paid."
              />
            </div>

            <div className="divide-y divide-slate-200/70">
              {rules.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">
                  No reminder rules configured.
                </p>
              ) : (
                rules.map((rule) => (
                  <div key={rule.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {rule.label ?? rule.rule_type.replace(/_/g, " ")}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {rule.rule_type.replace(/_/g, " ")} · {ruleSchedule(rule)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <form action={toggleRuleAction}>
                          <input type="hidden" name="bill_id" value={bill.id} />
                          <input type="hidden" name="id" value={rule.id} />
                          <input
                            type="hidden"
                            name="is_active"
                            value={rule.is_active ? "0" : "1"}
                          />
                          <SubmitButton
                            label={rule.is_active ? "Pause" : "Enable"}
                            className="btn btn-ghost btn-xs"
                          />
                        </form>
                        <form action={removeRuleAction}>
                          <input type="hidden" name="bill_id" value={bill.id} />
                          <input type="hidden" name="id" value={rule.id} />
                          <SubmitButton
                            label="Delete"
                            className="btn btn-ghost btn-xs text-rose-700 hover:text-rose-700"
                          />
                        </form>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              action={addRuleAction}
              className="space-y-2 border-t border-slate-200/70 px-5 py-4"
            >
              <input type="hidden" name="bill_id" value={bill.id} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Add reminder rule
              </p>
              <select name="rule_type" className="select text-sm" defaultValue="payment_pending">
                <option value="invoice_arrival">Invoice arrival</option>
                <option value="payment_pending">Payment pending</option>
                <option value="overdue">Overdue</option>
                <option value="payment_paid">Paid confirmation (email when paid)</option>
              </select>
              <input
                name="label"
                className="input text-sm"
                placeholder="Label (optional)"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="day_of_month"
                  type="number"
                  min={1}
                  max={31}
                  className="input text-sm"
                  placeholder="Day of month"
                />
                <input
                  name="offset_days"
                  type="number"
                  min={-60}
                  max={60}
                  className="input text-sm"
                  placeholder="Offset days"
                />
              </div>
              <select name="anchor" className="select text-sm" defaultValue="payment_deadline">
                <option value="arrival_end">From arrival window end</option>
                <option value="payment_target">From payment target</option>
                <option value="payment_deadline">From final deadline</option>
              </select>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Use a day of the month, or an offset from an anchor. The offset is ignored when
                a day is provided. Paid confirmation rules ignore the schedule fields and send
                as soon as the payment is recorded.
              </p>
              <SubmitButton label="Add rule" className="btn btn-secondary btn-xs w-full" />
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
