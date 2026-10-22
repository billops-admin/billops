import Link from "next/link";
import SubmitButton from "./SubmitButton";
import type { Bill } from "@/lib/types";

const CATEGORIES = [
  "Telecom",
  "Mobile",
  "Broadband",
  "Software",
  "Infrastructure",
  "Laptop Rental",
  "Recharge",
  "Cloud",
  "Other",
];

export default function BillForm({
  action,
  mode,
  bill,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  mode: "create" | "edit";
  bill?: Bill;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-6">
      {bill ? <input type="hidden" name="id" value={bill.id} /> : null}

      <div className="card card-pad">
        <h2 className="text-base font-semibold text-slate-900">Bill details</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          The same form works for any provider. No code change is needed to add a new bill.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              Bill name
            </label>
            <input
              id="name"
              name="name"
              className="input"
              defaultValue={bill?.name ?? ""}
              placeholder="e.g. Office electricity"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="provider">
              Provider
            </label>
            <input
              id="provider"
              name="provider"
              className="input"
              defaultValue={bill?.provider ?? ""}
              placeholder="e.g. Airtel"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="category">
              Category
            </label>
            <input
              id="category"
              name="category"
              className="input"
              list="bill-categories"
              defaultValue={bill?.category ?? "Telecom"}
              required
            />
            <datalist id="bill-categories">
              {CATEGORIES.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="timezone">
              Timezone
            </label>
            <input
              id="timezone"
              name="timezone"
              className="input"
              defaultValue={bill?.timezone ?? "Asia/Kolkata"}
              placeholder="Asia/Kolkata"
            />
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="text-base font-semibold text-slate-900">Schedule</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Expected arrival and deadline are windows, not guarantees. The internal target is
          used for early reminders; the deadline drives overdue escalation.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label" htmlFor="arrival_start_day">
              Arrival window starts
            </label>
            <input
              id="arrival_start_day"
              name="arrival_start_day"
              type="number"
              min={1}
              max={31}
              className="input"
              defaultValue={bill?.arrival_start_day ?? 2}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="arrival_end_day">
              Arrival window ends
            </label>
            <input
              id="arrival_end_day"
              name="arrival_end_day"
              type="number"
              min={1}
              max={31}
              className="input"
              defaultValue={bill?.arrival_end_day ?? 4}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="payment_target_day">
              Internal payment target
            </label>
            <input
              id="payment_target_day"
              name="payment_target_day"
              type="number"
              min={1}
              max={31}
              className="input"
              defaultValue={bill?.payment_target_day ?? 5}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="payment_deadline_day">
              Final deadline
            </label>
            <input
              id="payment_deadline_day"
              name="payment_deadline_day"
              type="number"
              min={1}
              max={31}
              className="input"
              defaultValue={bill?.payment_deadline_day ?? 8}
              required
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="notes">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            className="input min-h-24"
            defaultValue={bill?.notes ?? ""}
            placeholder="Anything the reminder emails or the team should know."
          />
        </div>
      </div>

      {mode === "create" ? (
        <div className="card card-pad">
          <h2 className="text-base font-semibold text-slate-900">Recipients & notifications</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Separate multiple email addresses with commas. Reminder rules are created
            automatically and can be fine-tuned later on the bill page.
          </p>

          <div className="mt-5">
            <label className="label" htmlFor="recipients">
              Recipient emails
            </label>
            <textarea
              id="recipients"
              name="recipients"
              className="input min-h-24"
              placeholder="Comma-separated email addresses"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <input
                type="checkbox"
                name="receive_reminders"
                defaultChecked
                className="mt-0.5 h-4 w-4 rounded border-slate-300 bg-white accent-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Send scheduled reminders
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Invoice, payment, overdue and paid confirmation emails.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <input
                type="checkbox"
                name="receive_status_updates"
                defaultChecked
                className="mt-0.5 h-4 w-4 rounded border-slate-300 bg-white accent-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Send status-change notifications
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Emails when invoice or payment status changes.
                </span>
              </span>
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        <SubmitButton
          label={mode === "create" ? "Save bill" : "Save changes"}
          pendingLabel={mode === "create" ? "Creating…" : "Saving…"}
        />
      </div>
    </form>
  );
}
