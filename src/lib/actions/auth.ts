"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, setSessionCookie } from "@/lib/auth/session";
import { hashInviteToken } from "@/lib/auth/invites";
import { recordActivity } from "@/lib/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = { error?: string; email?: string } | undefined;

const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  const admin = createAdminClient();
  const { data: user, error } = await admin
    .from("users")
    .select("id, password_hash")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);

  // Checked even when there's no such user (against a dummy hash), so a
  // wrong email and a wrong password take equally long and read the same.
  if (!(await verifyPassword(password, user?.password_hash ?? null)) || !user) {
    return { error: "Incorrect email or password", email };
  }

  await setSessionCookie(user.id);
  redirect("/dashboard");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export type SignupState = { error?: string; email?: string } | undefined;

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const token = String(formData.get("token") ?? "");
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", email };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`, email };
  }

  const admin = createAdminClient();
  const { data: userId, error } = await admin.rpc("redeem_signup_invite", {
    p_token_hash: hashInviteToken(token),
    p_email: email,
    p_password_hash: await hashPassword(password),
  });
  if (error) {
    if (error.code === "23505") return { error: "There's already an account with that email.", email };
    throw new Error(error.message);
  }
  if (!userId) return { error: "This signup link has already been used or has expired.", email };

  await setSessionCookie(userId);
  recordActivity({ id: userId, email }, { action: "user.signup", summary: "Created their account" });
  redirect("/dashboard");
}
