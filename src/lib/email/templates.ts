import "server-only";
import { EMPTY_CHECKLIST, checklistText, filledChecklist } from "@/lib/checkliste";
import { siteOrigin } from "@/lib/origin";
import type { Email } from "./send";

type Message = Pick<Email, "subject" | "html" | "text">;

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The app's own colours (globals.css), light and dark.
const LIGHT = { page: "#f2f2f7", card: "#ffffff", well: "#f2f2f7", text: "#1c1c1e", muted: "#8e8e93", rule: "#e5e5ea" };
const DARK = { page: "#000000", card: "#1c1c1e", well: "#2c2c2e", text: "#ffffff", muted: "#8e8e93", rule: "#38383a" };
const ACCENT = "#007aff";
const SYSTEM_FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif";
// The brand's Compacta, as served for emails (public/email); where a mail
// app won't load web fonts, the nearest condensed heavies it might have.
const BRAND_FONT = "'Colo',Compacta,'Compacta BT',Impact,'Haettenschweiler','Arial Narrow',sans-serif";

// Every email is the login page's card: the wordmark, then the body, on
// the app's grey, with a line underneath saying why it came. Mail apps
// ignore most of CSS, so it's tables with the light colours inline; the
// <style> adds the brand font and, where a mail app reads it (Apple Mail
// does), dark mode. No images at all: nothing to block or to weigh
// against the text in a spam filter's eyes.
//
// `preview` is the line mail apps show after the subject in the inbox.
function layout({ preview, body, footer }: { preview: string; body: string; footer: string }) {
  const site = siteOrigin();
  const fontFace = site
    ? `@font-face{font-family:'Colo';src:url('${site}/email/colo.ttf') format('truetype');font-weight:400;font-style:normal;}`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Colo Cloud</title>
<style>
${fontFace}
@media (prefers-color-scheme: dark) {
  .page{background:${DARK.page}!important;}
  .card{background:${DARK.card}!important;}
  .well{background:${DARK.well}!important;}
  .fg{color:${DARK.text}!important;}
  .muted{color:${DARK.muted}!important;}
  .rule{border-color:${DARK.rule}!important;}
}
@media (max-width:520px) { .card-pad{padding:28px 22px!important;} }
</style>
</head>
<body class="page" style="margin:0;padding:0;background:${LIGHT.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preview)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${LIGHT.page};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td class="card card-pad" style="background:${LIGHT.card};border-radius:22px;padding:36px 32px;font-family:${SYSTEM_FONT};color:${LIGHT.text};">
<div class="fg" style="font-family:${BRAND_FONT};font-size:44px;line-height:1;letter-spacing:-0.5px;text-transform:uppercase;color:${LIGHT.text};">Colo Cloud</div>
${body}
</td></tr>
<tr><td class="muted" style="padding:20px 24px 0;font-family:${SYSTEM_FONT};font-size:12px;line-height:1.5;color:${LIGHT.muted};text-align:center;">${footer}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function heading(text: string) {
  return `<h1 class="fg" style="margin:22px 0 8px;font-size:20px;line-height:1.3;font-weight:700;color:${LIGHT.text};">${escape(text)}</h1>`;
}

const paragraph = (html: string) =>
  `<p class="fg" style="margin:0 0 14px;font-size:15px;line-height:1.5;color:${LIGHT.text};">${html}</p>`;

const note = (html: string) =>
  `<p class="muted" style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${LIGHT.muted};">${html}</p>`;

// The app's primary button: a full-width blue pill, as on the login page.
// A table cell carries the colour, so it shows even where padding on a
// link doesn't (Outlook). The address is written out under it, for
// whoever can't press it.
function button(url: string, label: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 18px;">
<tr><td align="center" bgcolor="${ACCENT}" style="border-radius:999px;background:${ACCENT};">
<a href="${escape(url)}" style="display:block;padding:13px 24px;font-family:${SYSTEM_FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px;">${escape(label)}</a>
</td></tr>
</table>
${note(`Or open this link: <a href="${escape(url)}" style="color:${ACCENT};word-break:break-all;">${escape(url)}</a>`)}`;
}

const strong = (text: string) => `<strong style="font-weight:600;">${escape(text)}</strong>`;

const NOT_YOU = "If you didn't ask for this, you can ignore this email. Nothing changes unless the link is used.";

export function passwordResetEmail(url: string): Message {
  return {
    subject: "Choose a new password",
    text: `Choose a new password\n\nSomeone asked to reset the password of your Colo Cloud account. Choose a new one here:\n${url}\n\nThe link works once, for an hour.\n\n${NOT_YOU}`,
    html: layout({
      preview: "Your link to choose a new password. It works for an hour.",
      body:
        heading("Choose a new password") +
        paragraph("Someone asked to reset the password of your Colo Cloud account.") +
        button(url, "Choose a New Password") +
        note("The link works once, for an hour."),
      footer: NOT_YOU,
    }),
  };
}

export function passwordChangedEmail(forgotUrl: string): Message {
  const notYou = "If this wasn't you, reset your password straight away and tell an admin:";
  return {
    subject: "Your password was changed",
    text: `Your password was changed\n\nThe password of your Colo Cloud account was just changed, and every other device that was signed in has been signed out.\n\n${notYou}\n${forgotUrl}`,
    html: layout({
      preview: "Every other device has been signed out.",
      body:
        heading("Your password was changed") +
        paragraph("The password of your Colo Cloud account was just changed, and every other device that was signed in has been signed out.") +
        note(`${escape(notYou)} <a href="${escape(forgotUrl)}" style="color:${ACCENT};">reset your password</a>.`),
      footer: "You're getting this because the password of your Colo Cloud account changed.",
    }),
  };
}

export function confirmEmailChangeEmail(url: string, newEmail: string): Message {
  return {
    subject: "Confirm your new email",
    text: `Confirm your new email\n\nConfirm ${newEmail} as the email you log in to Colo Cloud with:\n${url}\n\nThe link works for 24 hours.\n\n${NOT_YOU}`,
    html: layout({
      preview: `Confirm ${newEmail} as your Colo Cloud login.`,
      body:
        heading("Confirm your new email") +
        paragraph(`Confirm ${strong(newEmail)} as the email you log in to Colo Cloud with.`) +
        button(url, "Confirm Email") +
        note("The link works for 24 hours."),
      footer: NOT_YOU,
    }),
  };
}

export function emailChangedEmail(newEmail: string): Message {
  return {
    subject: "Your login email was changed",
    text: `Your login email was changed\n\nYour Colo Cloud account now logs in with ${newEmail} instead of this address.\n\nIf this wasn't you, tell an admin straight away.`,
    html: layout({
      preview: `Your account now logs in with ${newEmail}.`,
      body:
        heading("Your login email was changed") +
        paragraph(`Your Colo Cloud account now logs in with ${strong(newEmail)} instead of this address.`) +
        note("If this wasn't you, tell an admin straight away."),
      footer: "You're getting this because it was the login email of a Colo Cloud account.",
    }),
  };
}

export function signupInviteEmail(url: string, inviter: string, nickname: string | null): Message {
  const greeting = nickname ? `Hi ${nickname},` : "Hi,";
  return {
    subject: `${inviter} invited you to Colo Cloud`,
    text: `${greeting}\n\n${inviter} invited you to Colo Cloud. Create your account here:\n${url}\n\nThe link works once, for 7 days.`,
    html: layout({
      preview: `${inviter} invited you to Colo Cloud.`,
      body:
        heading("You're invited") +
        paragraph(escape(greeting)) +
        paragraph(`${strong(inviter)} invited you to Colo Cloud.`) +
        button(url, "Create Your Account") +
        note("The link works once, for 7 days."),
      footer: `${escape(inviter)} sent you this invitation. If you weren't expecting it, you can ignore it.`,
    }),
  };
}

// The Checkliste as filled in, from whoever sent it (who replies go to):
// each category under a small grey title, as the app's sections are, and
// each of its sections a rounded grey box, like iOS's grouped lists.
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
            `<p class="muted" style="margin:28px 0 8px 4px;font-size:12px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${LIGHT.muted};">${escape(category.title)}</p>` +
            category.sections
              .map(
                (section) =>
                  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
<tr><td class="well" style="background:${LIGHT.well};border-radius:16px;padding:12px 16px;">
<p class="fg" style="margin:0 0 4px;font-size:14px;font-weight:600;line-height:1.4;color:${LIGHT.text};">${escape(section.title)}</p>` +
                  section.lines
                    .map((line) =>
                      line.kind === "check"
                        ? `<p class="fg" style="margin:0;font-size:14px;line-height:1.6;color:${LIGHT.text};"><span style="color:${ACCENT};font-weight:700;">✓</span>&nbsp;&nbsp;${escape(line.text)}</p>`
                        : `<p class="fg" style="margin:0;font-size:14px;line-height:1.6;color:${LIGHT.text};white-space:pre-wrap;">${escape(line.text)}</p>`,
                    )
                    .join("") +
                  `</td></tr></table>`,
              )
              .join(""),
        )
        .join("")
    : paragraph(EMPTY_CHECKLIST);

  return {
    subject,
    text: [subject, when, `Von ${sender}`, "", checklistText(answer)].filter((l) => l !== null).join("\n"),
    html: layout({
      preview: [when, `Von ${sender}`].filter(Boolean).join(" · "),
      body:
        `<p class="muted" style="margin:22px 0 2px;font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${LIGHT.muted};">Checkliste</p>` +
        `<h1 class="fg" style="margin:0;font-size:24px;line-height:1.25;font-weight:700;color:${LIGHT.text};">${escape(title)}</h1>` +
        (when ? `<p class="muted" style="margin:4px 0 0;font-size:15px;color:${LIGHT.muted};">${escape(when)}</p>` : "") +
        body,
      footer: `Gesendet von ${escape(sender)} über Colo Cloud. Eine Antwort geht direkt an ${escape(sender)}.`,
    }),
  };
}
