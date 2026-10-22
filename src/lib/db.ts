import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./passwords";
import { SEED_BILLS, type SeedBill } from "./seed-data";
import { currentMonthKey } from "./dates";

export type SQLValue = string | number | bigint | null | Uint8Array;

const globalForDb = globalThis as unknown as { __billopsDb?: DatabaseSync };

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  arrival_start_day INTEGER NOT NULL,
  arrival_end_day INTEGER NOT NULL,
  payment_target_day INTEGER NOT NULL,
  payment_deadline_day INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  is_active INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  invoice_status TEXT NOT NULL DEFAULT 'awaiting',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  invoice_received_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  approval_note TEXT,
  payment_date TEXT,
  payment_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (bill_id, billing_month)
);

CREATE TABLE IF NOT EXISTS bill_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'to',
  receive_reminders INTEGER NOT NULL DEFAULT 1,
  receive_invoice INTEGER NOT NULL DEFAULT 1,
  receive_approval INTEGER NOT NULL DEFAULT 0,
  receive_payment INTEGER NOT NULL DEFAULT 1,
  receive_overdue INTEGER NOT NULL DEFAULT 1,
  receive_paid INTEGER NOT NULL DEFAULT 1,
  receive_status_updates INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (bill_id, email)
);

CREATE TABLE IF NOT EXISTS reminder_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  label TEXT,
  day_of_month INTEGER,
  offset_days INTEGER,
  anchor TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_cycle_id INTEGER NOT NULL REFERENCES bill_cycles(id) ON DELETE CASCADE,
  previous_invoice_status TEXT,
  new_invoice_status TEXT,
  previous_approval_status TEXT,
  new_approval_status TEXT,
  previous_payment_status TEXT,
  new_payment_status TEXT,
  changed_by TEXT NOT NULL,
  change_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_cycle_id INTEGER REFERENCES bill_cycles(id) ON DELETE CASCADE,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  rule_id INTEGER REFERENCES reminder_rules(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_type TEXT NOT NULL DEFAULT 'to',
  subject TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outbox_id INTEGER REFERENCES notification_outbox(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cycles_month ON bill_cycles (billing_month);
CREATE INDEX IF NOT EXISTS idx_cycles_bill ON bill_cycles (bill_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON notification_outbox (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_history_cycle ON status_history (bill_cycle_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs (created_at);
`;

function resolveDatabaseFile(): string {
  const configured = process.env.BILLOPS_DB_PATH?.trim();
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), "data", "billops.db");
}

function insertSeedBill(db: DatabaseSync, bill: SeedBill, month: string): number {
  const result = db
    .prepare(
      `INSERT INTO bills (
        name, provider, category, arrival_start_day, arrival_end_day,
        payment_target_day, payment_deadline_day, notes, status, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1)`,
    )
    .run(
      bill.name,
      bill.provider,
      bill.category,
      bill.arrivalStartDay,
      bill.arrivalEndDay,
      bill.paymentTargetDay,
      bill.paymentDeadlineDay,
      bill.notes ?? null,
    );
  const billId = Number(result.lastInsertRowid);

  const insertRecipient = db.prepare(`
    INSERT INTO bill_recipients (
      bill_id, email, recipient_type, receive_reminders,
      receive_invoice, receive_approval, receive_payment, receive_overdue, receive_paid,
      receive_status_updates, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  for (const recipient of bill.recipients) {
    const reminders = recipient.reminders ? 1 : 0;
    const flag = (value: boolean | undefined, fallback = Boolean(reminders)) =>
      (value ?? fallback) ? 1 : 0;
    insertRecipient.run(
      billId,
      recipient.email,
      recipient.type,
      reminders,
      flag(recipient.invoice),
      flag(recipient.approval, false),
      flag(recipient.payment),
      flag(recipient.overdue),
      flag(recipient.paid),
      recipient.statusUpdates ? 1 : 0,
    );
  }

  const insertRule = db.prepare(`
    INSERT INTO reminder_rules (bill_id, rule_type, label, day_of_month, offset_days, anchor, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);
  for (const rule of bill.rules) {
    insertRule.run(
      billId,
      rule.ruleType,
      rule.label,
      rule.dayOfMonth,
      rule.offsetDays,
      rule.anchor,
    );
  }

  db.prepare(
    "INSERT OR IGNORE INTO bill_cycles (bill_id, billing_month, approval_status) VALUES (?, ?, 'pending')",
  ).run(billId, month);

  return billId;
}

function seed(db: DatabaseSync) {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get() as {
    count: number;
  };

  if (Number(userCount.count) === 0) {
    const email = process.env.BILLOPS_ADMIN_EMAIL?.trim() || "admin@billops.local";
    const configuredPassword = process.env.BILLOPS_ADMIN_PASSWORD?.trim();
    if (!configuredPassword && process.env.NODE_ENV === "production") {
      throw new Error(
        "BILLOPS_ADMIN_PASSWORD must be set before seeding the admin account.",
      );
    }
    const password = configuredPassword || "admin123";
    const name = process.env.BILLOPS_ADMIN_NAME?.trim() || "BillOps Admin";
    db.prepare(
      "INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')",
    ).run(email, name, hashPassword(password));
  }

  const billCount = db.prepare("SELECT COUNT(*) AS count FROM bills").get() as {
    count: number;
  };
  if (Number(billCount.count) > 0) return;
  if (
    process.env.BILLOPS_SEED_CATALOG !== "true" &&
    process.env.BILLOPS_SEED_DEMO !== "true"
  ) {
    return;
  }

  const month = currentMonthKey();
  for (const bill of SEED_BILLS) {
    insertSeedBill(db, bill, month);
  }
}

function migratePaidConfirmation(db: DatabaseSync) {
  const marker = db
    .prepare("SELECT value FROM app_meta WHERE key = 'paid_confirmation_v1'")
    .get() as { value: string } | undefined;
  if (marker) return;

  const bills = db.prepare("SELECT id FROM bills").all() as { id: number }[];
  const insertRule = db.prepare(`
    INSERT INTO reminder_rules (bill_id, rule_type, label, day_of_month, offset_days, anchor, is_active)
    SELECT ?, 'payment_paid', 'Paid confirmation', NULL, NULL, NULL, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM reminder_rules WHERE bill_id = ? AND rule_type = 'payment_paid'
    )
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const bill of bills) {
      insertRule.run(bill.id, bill.id);
    }
    db.prepare(
      "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('paid_confirmation_v1', 'done', datetime('now'))",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateBillingV2(db: DatabaseSync) {
  const marker = db
    .prepare("SELECT value FROM app_meta WHERE key = 'billing_v2'")
    .get() as { value: string } | undefined;
  if (marker) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const airtel = db
      .prepare(
        "SELECT id FROM bills WHERE provider = 'Airtel' AND (name = 'Airtel BND' OR name = 'Airtel Broadband')",
      )
      .get() as { id: number } | undefined;

    if (airtel) {
      db.prepare(
        `UPDATE bills
            SET category = 'Broadband',
                arrival_start_day = 2,
                arrival_end_day = 20,
                payment_target_day = 15,
                payment_deadline_day = 31,
                notes = ?,
                updated_at = datetime('now')
          WHERE id = ?`,
      ).run(
        "Billing timing varies: the invoice usually arrives 2nd-10th (due 15th-20th) or 15th-20th (due by month-end). Internal target is the 15th; final deadline is month-end.",
        airtel.id,
      );
      db.prepare(
        "UPDATE reminder_rules SET day_of_month = 20 WHERE bill_id = ? AND rule_type = 'invoice_arrival'",
      ).run(airtel.id);
      db.prepare(
        "UPDATE reminder_rules SET day_of_month = 15 WHERE bill_id = ? AND rule_type = 'payment_pending' AND day_of_month IS NOT NULL",
      ).run(airtel.id);
      db.prepare(
        "UPDATE reminder_rules SET day_of_month = 31 WHERE bill_id = ? AND rule_type = 'overdue'",
      ).run(airtel.id);
    }

    const billCount = db.prepare("SELECT COUNT(*) AS count FROM bills").get() as {
      count: number;
    };
    if (Number(billCount.count) > 0) {
      const month = currentMonthKey();
      for (const bill of SEED_BILLS) {
        if (bill.name !== "NetworkTech Lab" && bill.name !== "ABCom") continue;
        const existing = db
          .prepare("SELECT id FROM bills WHERE name = ?")
          .get(bill.name) as { id: number } | undefined;
        if (!existing) insertSeedBill(db, bill, month);
      }
    }

    db.prepare(
      "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('billing_v2', 'done', datetime('now'))",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateRecipientEventsV1(db: DatabaseSync) {
  const marker = db
    .prepare("SELECT value FROM app_meta WHERE key = 'recipient_events_v1'")
    .get() as { value: string } | undefined;
  if (marker) return;

  const columns = db.prepare("PRAGMA table_info(bill_recipients)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));

  db.exec("BEGIN IMMEDIATE");
  try {
    let added = false;
    for (const column of [
      "receive_invoice",
      "receive_payment",
      "receive_overdue",
      "receive_paid",
    ]) {
      if (names.has(column)) continue;
      db.exec(
        `ALTER TABLE bill_recipients ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 1`,
      );
      added = true;
    }

    if (added) {
      db.prepare(
        `UPDATE bill_recipients
            SET receive_invoice = receive_reminders,
                receive_payment = receive_reminders,
                receive_overdue = receive_reminders,
                receive_paid = receive_reminders`,
      ).run();
    }

    db.prepare(
      "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('recipient_events_v1', 'done', datetime('now'))",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrateApprovalWorkflowV1(db: DatabaseSync) {
  const marker = db
    .prepare("SELECT value FROM app_meta WHERE key = 'approval_workflow_v1'")
    .get() as { value: string } | undefined;
  if (marker) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    const addColumn = (table: string, column: string, definition: string) => {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (columns.some((existing) => existing.name === column)) return;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };

    addColumn("bill_cycles", "approval_status", "TEXT NOT NULL DEFAULT 'pending'");
    addColumn("bill_cycles", "approved_by", "TEXT");
    addColumn("bill_cycles", "approved_at", "TEXT");
    addColumn("bill_cycles", "approval_note", "TEXT");
    addColumn("status_history", "previous_approval_status", "TEXT");
    addColumn("status_history", "new_approval_status", "TEXT");
    addColumn("bill_recipients", "receive_approval", "INTEGER NOT NULL DEFAULT 0");

    db.prepare(
      `UPDATE bill_cycles
          SET approval_status = 'approved',
              approved_by = COALESCE(approved_by, 'migration'),
              approved_at = COALESCE(approved_at, datetime('now'))
        WHERE payment_status = 'paid'`,
    ).run();

    db.prepare(
      "INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES ('approval_workflow_v1', 'done', datetime('now'))",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db: DatabaseSync) {
  migratePaidConfirmation(db);
  migrateBillingV2(db);
  migrateRecipientEventsV1(db);
  migrateApprovalWorkflowV1(db);
}

export function getDb(): DatabaseSync {
  if (globalForDb.__billopsDb) return globalForDb.__billopsDb;

  const file = resolveDatabaseFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  seed(db);
  migrate(db);

  globalForDb.__billopsDb = db;
  return db;
}

export function all<T>(sql: string, ...params: SQLValue[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T>(sql: string, ...params: SQLValue[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function exec(
  sql: string,
  ...params: SQLValue[]
): { changes: number; lastInsertRowid: number } {
  const result = getDb().prepare(sql).run(...params);
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

export function transaction<T>(work: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = work();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function databaseFile(): string {
  return resolveDatabaseFile();
}
