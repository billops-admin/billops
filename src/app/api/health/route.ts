import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const bills = one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM bills WHERE is_active = 1",
    );
    const pending = one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM notification_outbox WHERE status = 'pending'",
    );
    return NextResponse.json({
      ok: true,
      activeBills: Number(bills?.count ?? 0),
      pendingNotifications: Number(pending?.count ?? 0),
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unhealthy" },
      { status: 500 },
    );
  }
}
