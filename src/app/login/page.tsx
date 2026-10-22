import { redirect } from "next/navigation";
import { getCurrentUser, seedCredentials } from "@/lib/auth";
import { loginAction } from "@/actions/auth";
import SubmitButton from "@/components/SubmitButton";
import ThemeToggle from "@/components/ThemeToggle";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const params = await searchParams;
  const credentials = seedCredentials();
  const showDefaults =
    process.env.NODE_ENV !== "production" && !process.env.BILLOPS_ADMIN_PASSWORD;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] lg:grid-cols-[1.05fr_1fr]">
        <div className="login-hero relative hidden flex-col justify-between overflow-hidden border-r border-slate-200 p-10 lg:flex">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-slate-900">BillOps</p>
              <p className="text-xs text-slate-500">Recurring bill & payment management</p>
            </div>
          </div>

          <div className="max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-600">
              Operational clarity
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900">
              Every bill, invoice and reminder in one reliable place.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Configurable bill schedules, separate invoice and payment tracking, a durable
              notification outbox, and a complete audit trail. Add a new bill without writing
              code or deploying a new job.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                "Monthly cycles generated automatically",
                "Daily reminder engine with idempotent dedupe",
                "Email outbox with retries and delivery logs",
                "Overdue, delayed and due-soon detection",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-slate-500">
            Local-first build · SQLite storage · Gmail-ready adapters
          </p>
        </div>

        <div className="p-7 sm:p-10">
          <div className="mb-7 lg:hidden">
            <p className="text-lg font-semibold text-slate-900">BillOps</p>
            <p className="text-xs text-slate-500">Recurring bill & payment management</p>
          </div>

          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use your BillOps account to open the dashboard.
          </p>

          {params.error ? (
            <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {params.error}
            </div>
          ) : null}

          <form action={loginAction} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                className="input"
                defaultValue={params.email ?? ""}
                placeholder="you@company.com"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
            <SubmitButton
              label="Sign in to BillOps"
              pendingLabel="Signing in…"
              className="btn btn-primary w-full"
            />
          </form>

          {showDefaults ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Default local account
              </p>
              <p className="mt-2 font-mono text-xs text-slate-700">
                {credentials.email}
              </p>
              <p className="font-mono text-xs text-slate-700">{credentials.password}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Set BILLOPS_ADMIN_EMAIL and BILLOPS_ADMIN_PASSWORD in .env.local before first
                run to use your own credentials.
              </p>
            </div>
          ) : null}

          <p className="mt-6 text-[11px] leading-relaxed text-slate-500">
            Authentication is required for the dashboard and every server action. Sessions are
            stored server-side with HTTP-only cookies.
          </p>
        </div>
      </div>
    </main>
  );
}
