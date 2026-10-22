import { changePasswordAction } from "@/actions/auth";
import { processOutboxAction, runEngineAction } from "@/actions/bills";
import SubmitButton from "@/components/SubmitButton";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { databaseFile } from "@/lib/db";
import { senderAddress } from "@/lib/email";

export const dynamic = "force-dynamic";

function ConfigRow({
  label,
  value,
  hint,
  ok,
}: {
  label: string;
  value: string;
  hint?: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 py-3 last:border-b-0">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
      </div>
      <div className="text-right">
        <p className="max-w-[220px] truncate font-mono text-xs text-slate-500" title={value}>
          {value}
        </p>
        {ok != null ? (
          <p
            className={`mt-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              ok ? "text-emerald-400" : "text-amber-400"
            }`}
          >
            {ok ? "ready" : "not configured"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();

  const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase();
  const cronSecret = Boolean(process.env.CRON_SECRET?.trim());
  const sender = senderAddress();
  const dbPath = databaseFile();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Workspace & automation"
        description="Runtime configuration, scheduled endpoints and account security."
        actions={
          <>
            <form action={runEngineAction}>
              <input type="hidden" name="redirect_to" value="/settings" />
              <SubmitButton
                label="Run daily check"
                pendingLabel="Running…"
                className="btn btn-secondary"
              />
            </form>
            <form action={processOutboxAction}>
              <input type="hidden" name="redirect_to" value="/settings" />
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

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card card-pad">
            <SectionTitle
              title="Runtime configuration"
              description="Values come from environment variables and are never exposed to the browser."
            />
            <div className="mt-2">
              <ConfigRow
                label="Email provider"
                value={provider}
                hint={
                  provider === "console"
                    ? "Writes .eml files to data/outbox instead of sending"
                    : "Gmail API with OAuth refresh token"
                }
              />
              <ConfigRow label="Sender address" value={sender} />
              <ConfigRow
                label="Gmail credentials"
                value={
                  provider === "gmail"
                    ? process.env.GMAIL_CLIENT_ID
                      ? "configured"
                      : "missing"
                    : "not required"
                }
                ok={provider === "gmail" ? Boolean(process.env.GMAIL_CLIENT_ID) : undefined}
              />
              <ConfigRow
                label="Cron secret"
                value={cronSecret ? "configured" : "disabled (local only)"}
                ok={cronSecret}
                hint="Protects /api/cron/daily and /api/worker/email"
              />
              <ConfigRow label="Database" value={dbPath} hint="SQLite file with WAL mode" />
              <ConfigRow label="Billing timezone" value="Asia/Kolkata" hint="Default per bill" />
            </div>
          </section>

          <section className="card card-pad">
            <SectionTitle
              title="Scheduled automation"
              description="A single daily job evaluates every active bill and reminder rule."
            />
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Daily reminder engine
                </p>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[11px] leading-relaxed text-slate-500">
{`GET /api/cron/daily
Authorization: Bearer <CRON_SECRET>

# Local equivalent
npm run daily`}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Email worker
                </p>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[11px] leading-relaxed text-slate-500">
{`POST /api/worker/email
Authorization: Bearer <CRON_SECRET>

# Local equivalent
npm run worker`}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  External scheduler (crontab example)
                </p>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[11px] leading-relaxed text-slate-500">
{`15 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily
45 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/worker/email`}
                </pre>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  The endpoints are scheduler-agnostic: cron, Windows Task Scheduler or Vercel
                  Cron all work. Serverless hosting needs a hosted database instead of the local
                  SQLite file.
                </p>
              </div>
            </div>
          </section>

          <section className="card card-pad">
            <SectionTitle
              title="Spec coverage"
              description="The six capabilities from the BillOps architecture document."
            />
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                "Recurring bill management (add, edit, pause, deactivate)",
                "Invoice arrival tracking separate from payment",
                "Payment tracking: pending, paid, on hold, plus paid confirmation emails",
                "Configurable reminder rules and daily automation",
                "Status notifications to To / CC / BCC recipients",
                "Audit trail, outbox and email delivery logs",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card card-pad">
            <SectionTitle title="Account" description="Signed-in dashboard user." />
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-slate-500">Name</dt>
                <dd className="mt-0.5 text-slate-800">{user.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-slate-500">Email</dt>
                <dd className="mt-0.5 text-slate-800">{user.email}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-slate-500">Role</dt>
                <dd className="mt-0.5 capitalize text-slate-800">{user.role}</dd>
              </div>
            </dl>
          </section>

          <section className="card card-pad">
            <SectionTitle title="Change password" description="Minimum 8 characters." />
            <form action={changePasswordAction} className="mt-4 space-y-3">
              <div>
                <label className="label" htmlFor="current_password">
                  Current password
                </label>
                <input
                  id="current_password"
                  name="current_password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="new_password">
                  New password
                </label>
                <input
                  id="new_password"
                  name="new_password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="confirm_password">
                  Confirm new password
                </label>
                <input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <SubmitButton
                label="Update password"
                pendingLabel="Updating…"
                className="btn btn-secondary w-full"
              />
            </form>
          </section>

          <section className="card card-pad">
            <h2 className="text-sm font-semibold text-slate-900">Architecture defaults</h2>
            <ol className="mt-3 space-y-3 text-xs leading-relaxed text-slate-500">
              <li>
                <span className="font-semibold text-slate-800">1. Modular monolith.</span>{" "}
                Next.js route handlers and server actions share one database source of truth.
              </li>
              <li>
                <span className="font-semibold text-slate-800">2. One daily scheduler.</span>{" "}
                No per-bill jobs; config is discovered from the database.
              </li>
              <li>
                <span className="font-semibold text-slate-800">3. Durable outbox.</span>{" "}
                Delivery retries independently from status changes.
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
