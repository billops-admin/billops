import { exec, one, transaction } from "./db";
import { zonedToday } from "./dates";
import {
  cancelPendingPaymentReminders,
  queueApprovalApprovedNotifications,
  queueApprovalRequestNotifications,
  queuePaidConfirmationNotifications,
  queueStatusNotifications,
  restoreCancelledPaymentReminders,
} from "./notify";
import type {
  ApprovalStatus,
  Bill,
  BillCycle,
  InvoiceStatus,
  PaymentStatus,
} from "./types";

export type CyclePatch = {
  invoice_status?: InvoiceStatus;
  approval_status?: ApprovalStatus;
  approval_note?: string | null;
  payment_status?: PaymentStatus;
  payment_reference?: string | null;
  note?: string | null;
};

export type CycleUpdateResult = {
  changed: boolean;
  cycleId: number;
  billName: string;
  notifications: number;
  approvalRequests: number;
  approvalNotifications: number;
  paidNotifications: number;
  cancelledReminders: number;
};

export function applyCyclePatch(
  cycleId: number,
  patch: CyclePatch,
  actor: string,
): CycleUpdateResult {
  const cycle = one<BillCycle>("SELECT * FROM bill_cycles WHERE id = ?", cycleId);
  if (!cycle) {
    return {
      changed: false,
      cycleId,
      billName: "Unknown bill",
      notifications: 0,
      approvalRequests: 0,
      approvalNotifications: 0,
      paidNotifications: 0,
      cancelledReminders: 0,
    };
  }

  const bill = one<Bill>("SELECT * FROM bills WHERE id = ?", cycle.bill_id);
  if (!bill) {
    return {
      changed: false,
      cycleId,
      billName: "Unknown bill",
      notifications: 0,
      approvalRequests: 0,
      approvalNotifications: 0,
      paidNotifications: 0,
      cancelledReminders: 0,
    };
  }

  const previousInvoice = cycle.invoice_status;
  const previousApproval = cycle.approval_status;
  const previousPayment = cycle.payment_status;
  const nextInvoice = patch.invoice_status ?? previousInvoice;
  let nextApproval = patch.approval_status ?? previousApproval;
  const nextPayment = patch.payment_status ?? previousPayment;

  if (nextPayment === "paid" && nextApproval !== "approved") {
    nextApproval = "approved";
  }

  const invoiceChanged = nextInvoice !== previousInvoice;
  const approvalChanged = nextApproval !== previousApproval;
  const paymentChanged = nextPayment !== previousPayment;
  const referenceProvided = patch.payment_reference !== undefined;
  const approvalNoteProvided = patch.approval_note !== undefined;

  if (
    !invoiceChanged &&
    !approvalChanged &&
    !paymentChanged &&
    !referenceProvided &&
    !approvalNoteProvided
  ) {
    return {
      changed: false,
      cycleId,
      billName: bill.name,
      notifications: 0,
      approvalRequests: 0,
      approvalNotifications: 0,
      paidNotifications: 0,
      cancelledReminders: 0,
    };
  }

  const today = zonedToday(bill.timezone).iso;

  let invoiceReceivedAt = cycle.invoice_received_at;
  if (invoiceChanged) {
    if (nextInvoice === "received") invoiceReceivedAt = today;
    else if (nextInvoice === "awaiting") invoiceReceivedAt = null;
  }

  let approvedBy = cycle.approved_by;
  let approvedAt = cycle.approved_at;
  let approvalNote = cycle.approval_note;
  if (approvalChanged) {
    if (nextApproval === "approved" || nextApproval === "rejected") {
      approvedBy = actor;
      approvedAt = today;
    } else {
      approvedBy = null;
      approvedAt = null;
    }
  }
  if (approvalNoteProvided) {
    approvalNote = patch.approval_note?.trim() || null;
  }

  let paymentDate = cycle.payment_date;
  let paymentReference = cycle.payment_reference;
  if (referenceProvided) {
    paymentReference = patch.payment_reference?.trim() || null;
  }
  if (paymentChanged) {
    if (nextPayment === "paid") {
      paymentDate = today;
    } else if (previousPayment === "paid") {
      paymentDate = null;
      if (!referenceProvided) paymentReference = null;
    }
  }

  const updatedCycle: BillCycle = {
    ...cycle,
    invoice_status: nextInvoice,
    approval_status: nextApproval,
    approved_by: approvedBy,
    approved_at: approvedAt,
    approval_note: approvalNote,
    payment_status: nextPayment,
    invoice_received_at: invoiceReceivedAt,
    payment_date: paymentDate,
    payment_reference: paymentReference,
    updated_at: new Date().toISOString(),
  };

  const result = transaction(() => {
    exec(
      `UPDATE bill_cycles
          SET invoice_status = ?, approval_status = ?, payment_status = ?,
              invoice_received_at = ?, approved_by = ?, approved_at = ?, approval_note = ?,
              payment_date = ?, payment_reference = ?, updated_at = datetime('now')
        WHERE id = ?`,
      nextInvoice,
      nextApproval,
      nextPayment,
      invoiceReceivedAt,
      approvedBy,
      approvedAt,
      approvalNote,
      paymentDate,
      paymentReference,
      cycleId,
    );

    const history = exec(
      `INSERT INTO status_history (
        bill_cycle_id, previous_invoice_status, new_invoice_status,
        previous_approval_status, new_approval_status,
        previous_payment_status, new_payment_status, changed_by, change_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cycleId,
      previousInvoice,
      nextInvoice,
      previousApproval,
      nextApproval,
      previousPayment,
      nextPayment,
      actor,
      patch.note?.trim() || null,
    );

    const notifications = queueStatusNotifications({
      historyId: history.lastInsertRowid,
      cycle: updatedCycle,
      bill,
      previousInvoice,
      previousApproval,
      previousPayment,
      actor,
      note: patch.note,
    });

    let approvalRequests = 0;
    if (
      invoiceChanged &&
      (nextInvoice === "received" || nextInvoice === "not_applicable") &&
      nextApproval === "pending"
    ) {
      approvalRequests = queueApprovalRequestNotifications({
        historyId: history.lastInsertRowid,
        cycle: updatedCycle,
        bill,
        actor,
      });
    }

    let approvalNotifications = 0;
    let cancelledReminders = 0;
    if (approvalChanged && nextApproval === "approved") {
      approvalNotifications = queueApprovalApprovedNotifications({
        historyId: history.lastInsertRowid,
        cycle: updatedCycle,
        bill,
        actor,
      });
      if (previousApproval === "rejected") restoreCancelledPaymentReminders(cycleId);
    } else if (approvalChanged && nextApproval === "rejected") {
      cancelledReminders += cancelPendingPaymentReminders(cycleId);
    } else if (approvalChanged && previousApproval === "rejected") {
      restoreCancelledPaymentReminders(cycleId);
    }

    let paidNotifications = 0;
    if (paymentChanged && nextPayment === "paid") {
      cancelledReminders += cancelPendingPaymentReminders(cycleId);
      paidNotifications = queuePaidConfirmationNotifications({
        cycle: updatedCycle,
        bill,
        actor,
      });
    } else if (paymentChanged && previousPayment === "paid" && nextPayment !== "paid") {
      restoreCancelledPaymentReminders(cycleId);
    }

    return {
      notifications,
      approvalRequests,
      approvalNotifications,
      paidNotifications,
      cancelledReminders,
    };
  });

  return {
    changed: true,
    cycleId,
    billName: bill.name,
    notifications: result.notifications,
    approvalRequests: result.approvalRequests,
    approvalNotifications: result.approvalNotifications,
    paidNotifications: result.paidNotifications,
    cancelledReminders: result.cancelledReminders,
  };
}
