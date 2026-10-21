"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { fetchLeadCandidates } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewEventInput = {
  title: string;
  customer: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  leadId: string | null;
  // ISO timestamps.
  startsAt: string | null;
  endsAt: string | null;
};

const MAX_TEXT = 200;

// Blank fields are stored as null: every one of them is optional.
function text(value: string) {
  const trimmed = value.trim().slice(0, MAX_TEXT);
  return trimmed || null;
}

function timestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("That isn't a valid date.");
  return date.toISOString();
}

export async function createEvent(input: NewEventInput) {
  const user = await requirePage("forms");
  const admin = createAdminClient();

  let leadId = input.leadId;
  if (leadId) {
    const candidates = await fetchLeadCandidates(admin, user);
    if (!candidates.some((c) => c.id === leadId)) leadId = null;
  }

  const startsAt = timestamp(input.startsAt);
  const endsAt = timestamp(input.endsAt);
  if (startsAt && endsAt && endsAt < startsAt) throw new Error("The event can't end before it starts.");

  const title = text(input.title);
  const { data, error } = await admin
    .from("events")
    .insert({
      title,
      customer: text(input.customer),
      contact_name: text(input.contactName),
      contact_phone: text(input.contactPhone),
      contact_email: text(input.contactEmail),
      lead_id: leadId,
      starts_at: startsAt,
      ends_at: endsAt,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  recordActivity(user, {
    action: "event.create",
    summary: title ? `Added the event ${quote(title)}` : "Added an untitled event",
  });
  revalidatePath("/forms");
  return data.id;
}
