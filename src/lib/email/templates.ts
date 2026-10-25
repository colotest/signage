import "server-only";
import { EMPTY_CHECKLIST, checklistText, filledChecklist } from "@/lib/checkliste";
import type { Email } from "./send";

type Message = Pick<Email, "subject" | "html" | "text">;

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Mail apps ignore stylesheets and most of CSS, so every email is a single
// centred table with its styles inline: the brand at the top, then the
// body, then a footer line. Colours are fixed (no dark mode), as most mail
// apps will repaint them anyway.
function layout(body: string, footer: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#1d1d1f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;">
<tr><td style="padding:28px 28px 8px;font-size:26px;font-weight:800;letter-spacing:-0.5px;text-transform:uppercase;">Colo Cloud</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.5;">${body}</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#86868b;text-align:center;">${footer}</p>
</body></html>`;
}

const paragraph = (html: string) => `<p style="margin:0 0 14px;">${html}</p>`;

function button(url: string, label: string) {
  return `<p style="margin:22px 0;"><a href="${escape(url)}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:999px;">${escape(label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#86868b;word-break:break-all;">Or paste this into your browser: ${escape(url)}</p>`;
}

const NOT_YOU = "If this wasn't you, you can ignore this email — nothing changes until the link is used.";

export function passwordResetEmail(url: string): Message {
  return {
    subject: "Choose a new password",
    text: `Someone asked to reset the password of your Colo Cloud account.\n\nChoose a new password here (the link works once, for an hour):\n${url}\n\n${NOT_YOU}`,
    html: layout(
      paragraph("Someone asked to reset the password of your Colo Cloud account.") +
        button(url, "Choose a New Password") +
        paragraph("The link works once, for an hour."),
      NOT_YOU,
    ),
  };
}

const NOT_YOU_CHANGED = "If this wasn't you, reset your password from the login page straight away, and tell an admin.";

export function passwordChangedEmail(loginUrl: string): Message {
  return {
    subject: "Your password was changed",
    text: `The password of your Colo Cloud account was just changed, and every device that was signed in has been signed out.\n\n${NOT_YOU_CHANGED}\n${loginUrl}`,
    html: layout(
      paragraph("The password of your Colo Cloud account was just changed, and every device that was signed in has been signed out."),
      `${NOT_YOU_CHANGED} <a href="${escape(loginUrl)}" style="color:#86868b;">${escape(loginUrl)}</a>`,
    ),
  };
}

export function confirmEmailChangeEmail(url: string, newEmail: string): Message {
  return {
    subject: "Confirm your new email",
    text: `Confirm ${newEmail} as the email you log in to Colo Cloud with:\n${url}\n\nThe link works for 24 hours. ${NOT_YOU}`,
    html: layout(
      paragraph(`Confirm <strong>${escape(newEmail)}</strong> as the email you log in to Colo Cloud with.`) +
        button(url, "Confirm Email") +
        paragraph("The link works for 24 hours."),
      NOT_YOU,
    ),
  };
}

export function emailChangedEmail(newEmail: string): Message {
  return {
    subject: "Your login email was changed",
    text: `Your Colo Cloud account now logs in with ${newEmail} instead of this address.\n\nIf this wasn't you, tell an admin straight away.`,
    html: layout(
      paragraph(`Your Colo Cloud account now logs in with <strong>${escape(newEmail)}</strong> instead of this address.`),
      "If this wasn't you, tell an admin straight away.",
    ),
  };
}

export function signupInviteEmail(url: string, inviter: string, nickname: string | null): Message {
  const greeting = nickname ? `Hi ${nickname},` : "Hi,";
  return {
    subject: `${inviter} invited you to Colo Cloud`,
    text: `${greeting}\n\n${inviter} invited you to Colo Cloud. Create your account here (the link works once, for 7 days):\n${url}`,
    html: layout(
      paragraph(escape(greeting)) +
        paragraph(`<strong>${escape(inviter)}</strong> invited you to Colo Cloud.`) +
        button(url, "Create Your Account") +
        paragraph("The link works once, for 7 days."),
      "If you weren't expecting this, you can ignore it.",
    ),
  };
}

// The Checkliste as filled in, from whoever sent it (who replies go to).
export function checklistEmail({
  title,
  when,
  sender,
  answer,
}: {
  title: string;
  when: string | null;
  sender: string;
  answer: (key: string) => true | string | null;
}): Message {
  const subject = `Checkliste – ${title}`;
  const categories = filledChecklist(answer);
  const body = categories.length
    ? categories
        .map(
          (category) =>
            `<h2 style="margin:26px 0 4px;font-size:13px;letter-spacing:0.6px;text-transform:uppercase;color:#86868b;">${escape(category.title)}</h2>` +
            category.sections
              .map(
                (section) =>
                  `<p style="margin:12px 0 4px;font-weight:600;">${escape(section.title)}</p>` +
                  section.lines
                    .map((line) =>
                      line.kind === "check"
                        ? `<p style="margin:0 0 2px;">✓&nbsp; ${escape(line.text)}</p>`
                        : `<p style="margin:0 0 2px;white-space:pre-wrap;">${escape(line.text)}</p>`,
                    )
                    .join(""),
              )
              .join(""),
        )
        .join("")
    : paragraph(EMPTY_CHECKLIST);

  return {
    subject,
    text: [subject, when, `Von ${sender}`, "", checklistText(answer)].filter((l) => l !== null).join("\n"),
    html: layout(
      `<p style="margin:0;font-size:20px;font-weight:700;">${escape(subject)}</p>` +
        (when ? `<p style="margin:2px 0 0;color:#86868b;">${escape(when)}</p>` : "") +
        body,
      `Gesendet von ${escape(sender)} über Colo Cloud. Antworten gehen an ${escape(sender)}.`,
    ),
  };
}
