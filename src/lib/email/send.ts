import "server-only";

export type Email = {
  to: string | string[];
  subject: string;
  // Both, always: the HTML for mail apps that show it, the text for those
  // that don't (and for spam filters, which mark down HTML-only mail).
  html: string;
  text: string;
  // Where a reply goes — the person who sent it, for one sent on their behalf.
  replyTo?: string;
};

// Sent through Resend (resend.com), whose API is a single POST — no SDK
// needed. RESEND_API_KEY is its key; EMAIL_FROM the sender, on a domain
// verified there. Until a domain is verified, Resend's own
// onboarding@resend.dev can only send to the address its account was made
// with.
//
// Without a key, in development, the email is printed to the server's log
// instead, so every flow can be tried locally (the links included).
export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("Email isn't set up yet (RESEND_API_KEY is missing).");
    console.info(`\n── Email (not sent: no RESEND_API_KEY) ──\nTo: ${[email.to].flat().join(", ")}\nSubject: ${email.subject}\n\n${email.text}\n──\n`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Colo Cloud <onboarding@resend.dev>",
      to: [email.to].flat(),
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(`Couldn't send the email: ${body?.message ?? response.statusText}`);
  }
}
