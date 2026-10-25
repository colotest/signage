import "server-only";
import { after } from "next/server";
import { appOrigin } from "@/lib/origin";
import { sendEmail } from "./send";
import { emailChangedEmail, passwordChangedEmail } from "./templates";

// Heads-ups to an account's own address about a change to it, sent after
// the response has gone: the change is made either way, and a slow or
// failed email shouldn't hold it up. Not in a "use server" file, where
// every export can be called by anyone.

export async function notifyPasswordChanged(email: string) {
  const origin = await appOrigin();
  after(() =>
    sendEmail({ to: email, ...passwordChangedEmail(`${origin}/forgot`) }).catch((err) =>
      console.error(`Failed to send the password-changed notice to ${email}:`, err),
    ),
  );
}

// To the address it used to log in with.
export function notifyEmailChanged(oldEmail: string, newEmail: string) {
  after(() =>
    sendEmail({ to: oldEmail, ...emailChangedEmail(newEmail) }).catch((err) =>
      console.error(`Failed to send the email-changed notice to ${oldEmail}:`, err),
    ),
  );
}
