import Link from "next/link";
import { createBillAction } from "@/actions/bills";
import BillForm from "@/components/BillForm";
import { Flash, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bills / New"
        title="Add a new bill"
        description="No deployment is required. Saving this form makes the bill immediately visible to the dashboard and the daily reminder engine."
        actions={
          <Link href="/bills" className="btn btn-ghost">
            Back to bills
          </Link>
        }
      />

      <Flash error={params.error} />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          <BillForm action={createBillAction} mode="create" cancelHref="/bills" />
        </div>

        <aside className="space-y-4">
          <div className="card card-pad">
            <h2 className="text-sm font-semibold text-slate-900">What happens on save</h2>
            <ol className="mt-3 space-y-3 text-xs leading-relaxed text-slate-500">
              <li>
                <span className="font-semibold text-slate-800">1. Bill definition stored.</span>{" "}
                The provider schedule is saved as a reusable configuration.
              </li>
              <li>
                <span className="font-semibold text-slate-800">2. Monthly cycle created.</span>{" "}
                A current-month instance is generated and a unique constraint prevents
                duplicates.
              </li>
              <li>
                <span className="font-semibold text-slate-800">3. Reminder rules added.</span>{" "}
                Invoice arrival, payment target, pre-deadline and overdue rules are created
                automatically.
              </li>
              <li>
                <span className="font-semibold text-slate-800">4. Recipients configured.</span>{" "}
                They can receive scheduled reminders, status updates, or both.
              </li>
            </ol>
          </div>

          <div className="card card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Scheduling tip</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              When a provider gives a broad window, keep the internal target earlier and the
              final deadline accurate. The reminder engine uses both independently.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              After saving, you can pause the bill, adjust reminder rules, add CC/BCC
              recipients and review its monthly cycles.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
