export type BillStatus = "active" | "paused" | "inactive";
export type InvoiceStatus = "awaiting" | "received" | "not_applicable";
export type PaymentStatus = "pending" | "paid" | "on_hold";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RecipientType = "to" | "cc" | "bcc";
export type ReminderRuleType =
  | "invoice_arrival"
  | "payment_pending"
  | "overdue"
  | "payment_paid";
export type ReminderAnchor = "arrival_end" | "payment_target" | "payment_deadline";
export type OutboxStatus = "pending" | "processing" | "sent" | "failed" | "cancelled";

export type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
};

export type Bill = {
  id: number;
  name: string;
  provider: string;
  category: string;
  arrival_start_day: number;
  arrival_end_day: number;
  payment_target_day: number;
  payment_deadline_day: number;
  timezone: string;
  is_active: number;
  status: BillStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BillCycle = {
  id: number;
  bill_id: number;
  billing_month: string;
  invoice_status: InvoiceStatus;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  invoice_received_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_note: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type BillRecipient = {
  id: number;
  bill_id: number;
  email: string;
  recipient_type: RecipientType;
  receive_reminders: number;
  receive_invoice: number;
  receive_approval: number;
  receive_payment: number;
  receive_overdue: number;
  receive_paid: number;
  receive_status_updates: number;
  is_active: number;
};

export type ReminderRule = {
  id: number;
  bill_id: number;
  rule_type: ReminderRuleType;
  label: string | null;
  day_of_month: number | null;
  offset_days: number | null;
  anchor: ReminderAnchor | null;
  is_active: number;
  created_at: string;
};

export type StatusHistoryRow = {
  id: number;
  bill_cycle_id: number;
  previous_invoice_status: string | null;
  new_invoice_status: string | null;
  previous_approval_status: string | null;
  new_approval_status: string | null;
  previous_payment_status: string | null;
  new_payment_status: string | null;
  changed_by: string;
  change_note: string | null;
  created_at: string;
};

export type OutboxRow = {
  id: number;
  bill_cycle_id: number | null;
  bill_id: number | null;
  rule_id: number | null;
  event_type: string;
  recipient_email: string;
  recipient_type: RecipientType;
  subject: string;
  payload: string;
  idempotency_key: string;
  status: OutboxStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type EmailLogRow = {
  id: number;
  outbox_id: number | null;
  to_email: string;
  subject: string;
  status: string;
  provider: string;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
};
