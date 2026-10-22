"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { applyCyclePatch, type CyclePatch } from "@/lib/cycles";
import type { ApprovalStatus, InvoiceStatus, PaymentStatus } from "@/lib/types";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeRedirect(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/bills");
  revalidatePath("/cycles");
  revalidatePath("/reports");
  revalidatePath("/settings");
}

export async function changeCycleStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const cycleId = Math.trunc(Number(text(formData, "cycle_id")));
  const action = text(formData, "action");
  const note = text(formData, "note") || null;
  const reference = text(formData, "payment_reference");
  const redirectTo = safeRedirect(text(formData, "redirect_to"), "/cycles");

  if (!cycleId) {
    const separator = redirectTo.includes("?") ? "&" : "?";
    redirect(`${redirectTo}${separator}error=${encodeURIComponent("Missing bill cycle.")}`);
  }

  let patch: CyclePatch;

  switch (action) {
    case "invoice_received":
      patch = { invoice_status: "received" as InvoiceStatus, note };
      break;
    case "invoice_awaiting":
      patch = { invoice_status: "awaiting" as InvoiceStatus, note };
      break;
    case "invoice_na":
      patch = { invoice_status: "not_applicable" as InvoiceStatus, note };
      break;
    case "approve":
      patch = { approval_status: "approved" as ApprovalStatus, approval_note: note, note };
      break;
    case "reject":
      patch = { approval_status: "rejected" as ApprovalStatus, approval_note: note, note };
      break;
    case "approval_pending":
      patch = { approval_status: "pending" as ApprovalStatus, approval_note: note, note };
      break;
    case "paid":
      patch = {
        payment_status: "paid" as PaymentStatus,
        payment_reference: reference || null,
        note,
      };
      break;
    case "pending":
      patch = { payment_status: "pending" as PaymentStatus, note };
      break;
    case "on_hold":
      patch = { payment_status: "on_hold" as PaymentStatus, note };
      break;
    default: {
      const separator = redirectTo.includes("?") ? "&" : "?";
      redirect(`${redirectTo}${separator}error=${encodeURIComponent("Unknown status action.")}`);
    }
  }

  const result = applyCyclePatch(cycleId, patch, `${user.name} <${user.email}>`);
  revalidateAll();

  const details: string[] = [];
  if (result.notifications > 0) {
    details.push(`${result.notifications} status notification(s) queued`);
  }
  if (result.approvalRequests > 0) {
    details.push(`${result.approvalRequests} approval request(s) queued`);
  }
  if (result.approvalNotifications > 0) {
    details.push(`${result.approvalNotifications} approval notification(s) queued`);
  }
  if (result.paidNotifications > 0) {
    details.push(`${result.paidNotifications} paid confirmation(s) queued`);
  }
  if (result.cancelledReminders > 0) {
    details.push(`${result.cancelledReminders} pending payment reminder(s) cancelled`);
  }

  const message = result.changed
    ? `Updated ${result.billName}.${details.length ? ` ${details.join(", ")}.` : ""}`
    : `No status change was needed for ${result.billName}.`;

  const separator = redirectTo.includes("?") ? "&" : "?";
  redirect(`${redirectTo}${separator}notice=${encodeURIComponent(message)}`);
}
