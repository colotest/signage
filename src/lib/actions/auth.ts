"use server";

import { cookies } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { isEmail, normalizeEmail, passwordProblem } from "@/lib/auth/credentials";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, setSessionCookie } from "@/lib/auth/session";
import { hashInviteToken, newInviteToken } from "@/lib/auth/invites";
import { recordActivity } from "@/lib/activity";
import { notifyPasswordChanged } from "@/lib/email/notices";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { appOrigin } from "@/lib/origin";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = { error?: string; email?: string } | undefined;

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
  redirect("/home");
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

  if (!isEmail(email)) return { error: "Enter a valid email address.", email };
  const problem = passwordProblem(password);
  if (problem) return { error: problem, email };

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
  redirect("/home");
}

export type ForgotPasswordState = { error?: string; sent?: string } | undefined;

// No more reset emails than this to one account in an hour, however often
// "Forgot password?" is pressed for it.
const MAX_RESETS_PER_HOUR = 3;

// Always answers the same, account or not, and the email goes out after
// the answer has — so neither what it says nor how long it takes gives
// away which emails have accounts.
export async function forgotPasswordAction(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = normalizeEmail(formData.get("email"));
  if (!isEmail(email)) return { error: "Enter a valid email address." };
  const origin = await appOrigin();

  after(async () => {
    try {
      const admin = createAdminClient();
      const { data: user, error } = await admin.from("users").select("id").eq("email", email).maybeSingle();
      if (error) throw new Error(error.message);
      if (!user) return;

      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await admin
        .from("password_resets")
        .select("token_hash", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gt("created_at", since);
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) >= MAX_RESETS_PER_HOUR) return;

      const token = newInviteToken();
      const { error: insertError } = await admin
        .from("password_resets")
        .insert({ token_hash: hashInviteToken(token), user_id: user.id });
      if (insertError) throw new Error(insertError.message);
      await sendEmail({ to: email, ...passwordResetEmail(`${origin}/reset/${token}`) });
    } catch (err) {
      console.error(`Failed to send a password reset to ${email}:`, err);
    }
  });

  return { sent: email };
}

export type ResetPasswordState = { error?: string } | undefined;

// The page a reset email's link opens: a new password, and signed in with it.
export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const admin = createAdminClient();
  const { data: userId, error } = await admin.rpc("redeem_password_reset", {
    p_token_hash: hashInviteToken(token),
    p_password_hash: await hashPassword(password),
  });
  if (error) throw new Error(error.message);
  if (!userId) return { error: "This link has already been used or has expired. Ask for a new one." };

  const { data: user, error: userError } = await admin.from("users").select("id, email").eq("id", userId).single();
  if (userError) throw new Error(userError.message);
  await setSessionCookie(user.id);
  await notifyPasswordChanged(user.email);
  recordActivity(user, { action: "user.password_reset", summary: "Reset their password by email" });
  redirect("/home");
}

