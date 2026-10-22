"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavIconName = "grid" | "document" | "calendar" | "chart" | "cog";

const NAV_GROUPS = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: "grid" },
      { href: "/bills", label: "Bills", icon: "document" },
      { href: "/cycles", label: "Monthly cycles", icon: "calendar" },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/reports", label: "Reports & logs", icon: "chart" }],
  },
  {
    label: "Administration",
    items: [{ href: "/settings", label: "Settings", icon: "cog" }],
  },
] as const;

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    className: "h-[18px] w-[18px]",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
          <path d="M8 13h2M14 13h2M8 17h2M14 17h2" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 20V4M4 20h16" />
          <path d="M8 16v-4M12 16V8M16 16v-6M20 16v-9" />
        </svg>
      );
    case "cog":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.37.7.67 1 .3.28.68.44 1.08.44H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5.56Z" />
        </svg>
      );
  }
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-slate-200 bg-[var(--sidebar-bg)] backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 px-4 py-4 lg:px-5 lg:py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/30">
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
          <p className="text-base font-semibold tracking-tight text-slate-900">BillOps</p>
          <p className="text-[11px] text-slate-500">Bill operations</p>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-0 lg:px-3 lg:pb-0">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="contents lg:block">
            <p className="hidden px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 lg:block">
              {group.label}
            </p>
            <div className="flex gap-1 lg:flex-col lg:gap-1">
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`nav-link shrink-0 ${active ? "nav-link-active" : ""}`}
                  >
                    <NavIcon name={item.icon} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="hidden px-5 pt-6 lg:block">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-xs font-semibold text-slate-800">Automation ready</p>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Daily engine, reminder rules and the notification outbox are active.
          </p>
        </div>
      </div>

      <p className="hidden px-5 py-5 text-[11px] text-slate-500 lg:block">
        BillOps · Operations workspace
      </p>
    </aside>
  );
}
