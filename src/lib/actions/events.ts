"use server";

import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { EVENT_TYPES } from "@/lib/eventTypes";
import { fetchLeadCandidates } from "@/lib/events";
import { parsePins, type MapPin } from "@/lib/eventPins";
import { cleanAnswer, parseChecklist } from "@/lib/checkliste";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

// What the Events list's "+ Create" starts an event with: the fields' own
// names, for overwriting on its page, and the person who made it as lead.
const PRESET = {
  title: "Title",
  customer: "Customer",
  contact_name: "Contact Name",
  contact_phone: "Phone",
  contact_email: "Email",
};

// The fields an event's page can change, any number at a time.
export type EventPatch = Partial<{
  title: string;
  description: string;
  eventType: string | null;
  pax: number | null;
  customer: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  leadId: string | null;
  // ISO timestamps. Without a time of day, the start is the beginning of
  // its day and the end the very end of its (see 0035).
  startsAt: string | null;
  endsAt: string | null;
  startsTimeSet: boolean;
  endsTimeSet: boolean;
}>;

const MAX_TEXT = 200;
const MAX_DESCRIPTION = 4000;

// Blank fields are stored as null: every one of them is optional.
function text(value: string, max = MAX_TEXT) {
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function timestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("That isn't a valid date.");
  return date.toISOString();
}

export async function createPresetEvent() {
  const user = await requirePage("forms");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("events")
    .insert({ ...PRESET, lead_id: user.id, created_by: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "event.create", summary: "Added a new event" });
  revalidatePath("/forms");
  return data.id;
}

// Resolves to an error message to show (null once saved) rather than
// throwing: a thrown error reaches a production page only as Next's
// generic "Server Components render" message, which says nothing of what
// went wrong.
export async function updateEvent(id: string, patch: EventPatch): Promise<string | null> {
  try {
    await applyUpdate(id, patch);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't save the event";
  }
}

async function applyUpdate(id: string, patch: EventPatch) {
  const user = await requirePage("forms");
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("events")
    .select("title, starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) throw new Error("That event no longer exists.");

  const row: Database["public"]["Tables"]["events"]["Update"] = {};
  if (patch.title !== undefined) row.title = text(patch.title);
  if (patch.description !== undefined) row.description = text(patch.description, MAX_DESCRIPTION);
  if (patch.eventType !== undefined) {
    if (patch.eventType !== null && !EVENT_TYPES.some((t) => t.key === patch.eventType)) {
      throw new Error("That isn't one of the event types.");
    }
    row.event_type = patch.eventType;
  }
  if (patch.pax !== undefined) {
    if (patch.pax !== null && (!Number.isInteger(patch.pax) || patch.pax < 0 || patch.pax > 9999)) {
      throw new Error("PAX is a whole number up to 9999.");
    }
    row.pax = patch.pax;
  }
  if (patch.customer !== undefined) row.customer = text(patch.customer);
  if (patch.contactName !== undefined) row.contact_name = text(patch.contactName);
  if (patch.contactPhone !== undefined) row.contact_phone = text(patch.contactPhone);
  if (patch.contactEmail !== undefined) row.contact_email = text(patch.contactEmail);
  if (patch.leadId !== undefined) {
    // Only someone who could be picked as lead (or nobody).
    const candidates = patch.leadId ? await fetchLeadCandidates(admin, user) : [];
    row.lead_id = patch.leadId && candidates.some((c) => c.id === patch.leadId) ? patch.leadId : null;
  }
  if (patch.startsAt !== undefined) row.starts_at = timestamp(patch.startsAt);
  if (patch.endsAt !== undefined) row.ends_at = timestamp(patch.endsAt);
  if (patch.startsTimeSet !== undefined) row.starts_time_set = patch.startsTimeSet;
  if (patch.endsTimeSet !== undefined) row.ends_time_set = patch.endsTimeSet;

  const startsAt = "starts_at" in row ? row.starts_at : current.starts_at;
  const endsAt = "ends_at" in row ? row.ends_at : current.ends_at;
  // Compared as moments: what's stored comes back as "…+00:00", what's
  // just been written as "…Z", so comparing the strings could misjudge.
  if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("The event can't end before it starts.");
  }

  const { error } = await admin.from("events").update(row).eq("id", id);
  if (error) throw new Error(error.message);
  const title = row.title !== undefined ? row.title : current.title;
  recordActivity(user, {
    action: "event.edit",
    // Repeated edits to one event within a minute fold into one entry.
    target: `event:${id}`,
    summary: title ? `Edited the event ${quote(title)}` : "Edited an untitled event",
  });
  revalidatePath("/forms");
}

// Replaces an event's pins on the venue map with these. Like updateEvent,
// resolves to an error message to show, or null once saved.
export async function setEventPins(id: string, pins: MapPin[]): Promise<string | null> {
  try {
    const user = await requirePage("forms");
    const admin = createAdminClient();
    const { title } = await eventTitleFor(admin, id);
    const clean = parsePins(pins).map((p) => ({ ...p, title: p.title.trim() }));
    const { error } = await admin.from("events").update({ map_pins: clean }).eq("id", id);
    if (error) throw new Error(error.message);
    recordActivity(user, {
      action: "event.edit",
      target: `event:${id}`,
      summary: title ? `Edited the event ${quote(title)}` : "Edited an untitled event",
    });
    revalidatePath("/forms");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't save the pins";
  }
}

// Fills in (or, with null, clears) some of an event's Checkliste — just
// these fields, merged into what's stored, so two people working through
// different parts of it don't overwrite each other. Like updateEvent,
// resolves to an error message to show, or null once saved.
export async function updateChecklist(id: string, patch: Record<string, true | string | null>): Promise<string | null> {
  try {
    const user = await requirePage("forms");
    const admin = createAdminClient();
    const { data, error: readError } = await admin.from("events").select("title, checklist").eq("id", id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!data) throw new Error("That event no longer exists.");
    const checklist = parseChecklist(data.checklist);
    for (const [key, value] of Object.entries(patch)) {
      const clean = value === null ? null : cleanAnswer(key, value);
      if (clean === null) delete checklist[key];
      else checklist[key] = clean;
    }
    const { error } = await admin.from("events").update({ checklist }).eq("id", id);
    if (error) throw new Error(error.message);
    recordActivity(user, {
      action: "event.edit",
      target: `event:${id}`,
      summary: data.title ? `Edited the event ${quote(data.title)}` : "Edited an untitled event",
    });
    revalidatePath("/forms");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't save the Checkliste";
  }
}

async function eventTitleFor(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("events").select("title, archived_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That event no longer exists.");
  return data;
}

export async function archiveEvent(id: string) {
  const user = await requirePage("forms");
  const admin = createAdminClient();
  const { title } = await eventTitleFor(admin, id);
  const { error } = await admin.from("events").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "event.archive",
    summary: title ? `Archived the event ${quote(title)}` : "Archived an untitled event",
  });
  revalidatePath("/forms");
}

export async function unarchiveEvent(id: string) {
  const user = await requirePage("forms");
  const admin = createAdminClient();
  const { title } = await eventTitleFor(admin, id);
  const { error } = await admin.from("events").update({ archived_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "event.unarchive",
    summary: title ? `Brought back the event ${quote(title)}` : "Brought back an untitled event",
  });
  revalidatePath("/forms");
}

// Only an archived event can be deleted — archiving first is the
// confirmation that it's really done with.
export async function deleteEvent(id: string) {
  const user = await requirePage("forms");
  const admin = createAdminClient();
  const { title, archived_at } = await eventTitleFor(admin, id);
  if (!archived_at) throw new Error("Archive the event before deleting it.");
  const { error } = await admin.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "event.delete",
    summary: title ? `Deleted the event ${quote(title)}` : "Deleted an untitled event",
  });
  revalidatePath("/forms");
}
