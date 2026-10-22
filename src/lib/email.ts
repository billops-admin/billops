import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type SendResult = {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
};

export type OutgoingEmail = {
  to: string;
  subject: string;
  body: string;
};

export function senderAddress(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.GMAIL_SENDER?.trim() ||
    process.env.BILLOPS_ADMIN_EMAIL?.trim() ||
    "billops@example.com"
  );
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildRawMessage(email: OutgoingEmail, from: string): string {
  const body = Buffer.from(email.body, "utf8").toString("base64");
  const lines = [
    `From: BillOps <${from}>`,
    `To: ${email.to}`,
    `Subject: ${encodeSubject(email.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ];
  return lines.join("\r\n");
}

async function gmailAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail OAuth credentials are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Gmail token request failed (${response.status}).`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail token response did not include an access token.");
  return data.access_token;
}

async function sendViaGmail(email: OutgoingEmail): Promise<SendResult> {
  const token = await gmailAccessToken();
  const from = senderAddress();
  const raw = Buffer.from(buildRawMessage(email, from), "utf8").toString("base64url");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return {
      ok: false,
      provider: "gmail",
      error: `Gmail send failed (${response.status}): ${detail.slice(0, 300)}`,
    };
  }

  const data = (await response.json()) as { id?: string };
  return { ok: true, provider: "gmail", messageId: data.id ?? randomUUID() };
}

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): Transporter {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT?.trim() || "465");
  const secure = (process.env.SMTP_SECURE?.trim() || "true").toLowerCase() !== "false";
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!user || !pass) {
    throw new Error("SMTP credentials are not configured.");
  }

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return smtpTransporter;
}

async function sendViaSmtp(email: OutgoingEmail): Promise<SendResult> {
  const transporter = getSmtpTransporter();
  const info = await transporter.sendMail({
    from: senderAddress(),
    to: email.to,
    subject: email.subject,
    text: email.body,
  });

  return {
    ok: true,
    provider: "smtp",
    messageId: info.messageId ?? randomUUID(),
  };
}

function localOutboxDir(): string {
  const configured = process.env.BILLOPS_OUTBOX_DIR?.trim();
  if (configured) return path.resolve(configured);

  const database = process.env.BILLOPS_DB_PATH?.trim();
  if (database) return path.join(path.dirname(path.resolve(database)), "outbox");

  return path.join(process.cwd(), "data", "outbox");
}

function sendToLocalMailbox(email: OutgoingEmail): SendResult {
  const dir = localOutboxDir();
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = randomUUID();
  const file = path.join(dir, `${stamp}-${id.slice(0, 8)}.eml`);
  const content = [
    `X-BillOps-Provider: console`,
    `X-BillOps-To: ${email.to}`,
    buildRawMessage(email, senderAddress()),
    "",
  ].join("\r\n");

  fs.writeFileSync(file, content, "utf8");
  return { ok: true, provider: "console", messageId: `local-${id}` };
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const provider = (process.env.EMAIL_PROVIDER || "console").toLowerCase();

  if (provider === "smtp" || provider === "gmail-smtp") {
    try {
      return await sendViaSmtp(email);
    } catch (error) {
      return {
        ok: false,
        provider: "smtp",
        error: error instanceof Error ? error.message : "Unknown SMTP error",
      };
    }
  }

  if (provider === "gmail") {
    try {
      return await sendViaGmail(email);
    } catch (error) {
      return {
        ok: false,
        provider: "gmail",
        error: error instanceof Error ? error.message : "Unknown Gmail error",
      };
    }
  }

  try {
    return sendToLocalMailbox(email);
  } catch (error) {
    return {
      ok: false,
      provider: "console",
      error: error instanceof Error ? error.message : "Could not write local email file",
    };
  }
}
