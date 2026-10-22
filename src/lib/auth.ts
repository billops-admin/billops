import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { exec, one } from "./db";
import { verifyPassword } from "./passwords";
import type { User } from "./types";

const SESSION_COOKIE = "billops_session";
const SESSION_DAYS = 30;

type SessionUser = User & { expires_at: string };

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = one<SessionUser>(
    `SELECT u.*, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.is_active = 1`,
    token,
  );

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    exec("DELETE FROM sessions WHERE token = ?", token);
    return null;
  }

  const { expires_at: _expires, ...user } = row;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  const user = one<User & { password_hash: string }>(
    "SELECT * FROM users WHERE lower(email) = ? AND is_active = 1",
    normalized,
  );

  if (!user || !verifyPassword(password, user.password_hash)) {
    return { ok: false, error: "Invalid email or password." };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  exec("DELETE FROM sessions WHERE expires_at <= ?", new Date().toISOString());
  exec(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    token,
    user.id,
    expiresAt,
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return { ok: true };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) exec("DELETE FROM sessions WHERE token = ?", token);
  store.delete(SESSION_COOKIE);
}

export function seedCredentials(): { email: string; password: string } {
  return {
    email: process.env.BILLOPS_ADMIN_EMAIL?.trim() || "admin@billops.local",
    password:
      process.env.BILLOPS_ADMIN_PASSWORD?.trim() ||
      (process.env.NODE_ENV === "production" ? "" : "admin123"),
  };
}
