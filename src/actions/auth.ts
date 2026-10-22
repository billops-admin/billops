"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { login, logout, requireUser } from "@/lib/auth";
import { exec, one } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/passwords";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email.trim() || !password) {
    redirect("/login?error=Enter+your+email+and+password.");
  }

  const result = await login(email, password);
  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.error ?? "Login failed.")}`);
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword) {
    redirect("/settings?error=All+password+fields+are+required.");
  }
  if (newPassword.length < 8) {
    redirect("/settings?error=The+new+password+must+be+at+least+8+characters.");
  }
  if (newPassword !== confirmPassword) {
    redirect("/settings?error=The+new+passwords+do+not+match.");
  }

  const record = one<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE id = ?",
    user.id,
  );
  if (!record || !verifyPassword(currentPassword, record.password_hash)) {
    redirect("/settings?error=Your+current+password+is+incorrect.");
  }

  exec(
    "UPDATE users SET password_hash = ? WHERE id = ?",
    hashPassword(newPassword),
    user.id,
  );

  revalidatePath("/settings");
  redirect("/settings?notice=Password+updated.");
}
