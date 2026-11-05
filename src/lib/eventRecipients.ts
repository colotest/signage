import "server-only";
import type { CurrentUser } from "@/lib/auth/session";
import { fetchLeadCandidates } from "@/lib/events";
import { isEmail, parseEmails } from "@/lib/eventEmails";
import type { createAdminClient } from "@/lib/supabase/admin";

// Who an event's emails (its Checkliste, its Übergabeprotokoll) can go to,
// of those picked on the sender's page: people in Events Management, by
// id — their addresses looked up here — and the event's contact or an
// address kept for it (0044), checked against the event's own, so nothing
// can be sent anyone else. team: the Events Management addresses; others:
// everyone else (anyone on the team as well is left with the team).
export async function eventRecipients(
  admin: ReturnType<typeof createAdminClient>,
  user: CurrentUser,
  event: { contact_email: string | null; checklist_emails: unknown },
  recipientIds: string[],
  emails: string[],
): Promise<{ team: string[]; others: string[] }> {
  const wanted = new Set(recipientIds);
  const unique = (list: string[]) => [...new Map(list.map((e) => [e.toLowerCase(), e])).values()];
  const team = unique(
    (await fetchLeadCandidates(admin, user)).filter((p) => p.management && wanted.has(p.id)).map((p) => p.email),
  );
  const known = new Map(
    [event.contact_email?.trim() ?? "", ...parseEmails(event.checklist_emails)]
      .filter(isEmail)
      .map((e) => [e.toLowerCase(), e]),
  );
  const teamAddresses = new Set(team.map((e) => e.toLowerCase()));
  const others = unique(
    emails.flatMap((e) => {
      const found = known.get(e.trim().toLowerCase());
      return found ? [found] : [];
    }),
  ).filter((e) => !teamAddresses.has(e.toLowerCase()));
  return { team, others };
}
