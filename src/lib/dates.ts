export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export type ZonedDate = {
  year: number;
  month: number;
  day: number;
  monthKey: string;
  iso: string;
};

function partsFor(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return { year: read("year"), month: read("month"), day: read("day") };
}

export function zonedToday(timeZone = DEFAULT_TIMEZONE, now = new Date()): ZonedDate {
  const { year, month, day } = partsFor(now, timeZone);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return {
    year,
    month,
    day,
    monthKey,
    iso: `${monthKey}-${String(day).padStart(2, "0")}`,
  };
}

export function currentMonthKey(timeZone = DEFAULT_TIMEZONE): string {
  return zonedToday(timeZone).monthKey;
}

export function addMonths(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dateForDay(monthKey: string, day: number): string {
  const safeDay = Math.min(Math.max(Math.trunc(day), 1), daysInMonth(monthKey));
  return `${monthKey}-${String(safeDay).padStart(2, "0")}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIMEZONE,
  }).format(date);
}

export const BILLOPS_FIRST_MONTH = "2026-08";

export function monthOptions(forwardMonths = 12, timeZone = DEFAULT_TIMEZONE): string[] {
  const current = currentMonthKey(timeZone);
  const latest = addMonths(current, forwardMonths);
  const earliest =
    compareIso(BILLOPS_FIRST_MONTH, latest) <= 0 ? BILLOPS_FIRST_MONTH : current;
  const months: string[] = [];
  for (let key = earliest; compareIso(key, latest) <= 0; key = addMonths(key, 1)) {
    months.push(key);
  }
  return months.reverse();
}

export function buildMonthList(
  keys: Array<string | null | undefined>,
  extra: Array<string | null | undefined> = [],
): string[] {
  const set = new Set<string>();
  for (const key of [...keys, ...extra]) {
    if (key && /^\d{4}-\d{2}$/.test(key) && compareIso(key, BILLOPS_FIRST_MONTH) >= 0) {
      set.add(key);
    }
  }
  return Array.from(set).sort().reverse();
}

export function monthLabel(day: number): string {
  const suffix = (() => {
    if (day % 100 >= 11 && day % 100 <= 13) return "th";
    switch (day % 10) {
      case 1:
        return "st";
      case 2:
        return "nd";
      case 3:
        return "rd";
      default:
        return "th";
    }
  })();
  return `${day}${suffix}`;
}
