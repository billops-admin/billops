import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import SubmitButton from "@/components/SubmitButton";
import ThemeToggle from "@/components/ThemeToggle";
import { logoutAction } from "@/actions/auth";
import { requireUser } from "@/lib/auth";
import { formatDate, zonedToday } from "@/lib/dates";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const today = zonedToday();
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-[var(--header-bg)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Automation live
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Workspace
                </p>
                <p className="truncate text-sm font-medium text-slate-800">
                  {formatDate(today.iso)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <div className="hidden h-6 w-px bg-slate-200 sm:block" />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-slate-800">{user.name}</p>
                <p className="text-[11px] text-slate-500">{user.email}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-800">
                {initials || "BO"}
              </div>
              <form action={logoutAction}>
                <SubmitButton
                  label="Sign out"
                  pendingLabel="Signing out…"
                  className="btn btn-ghost btn-xs"
                />
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
