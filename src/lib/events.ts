import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { displayNameOf } from "@/lib/uploads/uploaders";
import type { EventRecord } from "@/types/domain";

type Admin = ReturnType<typeof createAdminClient>;

// The role whose members can lead an event. Matched by name, since roles
// are made and named by hand on the Users page.
export const EVENTS_MANAGEMENT_ROLE = "Events Management";

export type EventPerson = { id: string; name: string };

// An event as the Forms page shows it.
export type EventSummary = {
  id: string;
  title: string | null;
  customer: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  leadId: string | null;
  leadName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  // Whether startsAt / endsAt have a time of day, or are just a day (0035).
  startsTimeSet: boolean;
  endsTimeSet: boolean;
  // When it was archived, or null while it's current.
  archivedAt: string | null;
};

// Who can be made an event's lead: everyone in the Events Management role,
// and the person asking (who's the default, whether or not they're in it).
export async function fetchLeadCandidates(admin: Admin, viewer: { id: string }): Promise<EventPerson[]> {
  const { data: roles, error: roleError } = await admin
    .from("roles")
    .select("id")
    .ilike("name", EVENTS_MANAGEMENT_ROLE);
  if (roleError) throw new Error(roleError.message);

  const roleIds = (roles ?? []).map((r) => r.id);
  const memberIds = new Set<string>([viewer.id]);
  if (roleIds.length > 0) {
    const { data: members, error } = await admin.from("user_roles").select("user_id").in("role_id", roleIds);
    if (error) throw new Error(error.message);
    for (const m of members ?? []) memberIds.add(m.user_id);
  }

  const { data: users, error } = await admin
    .from("users")
    .select("id, email, nickname")
    .in("id", [...memberIds]);
  if (error) throw new Error(error.message);
  return (users ?? [])
    .map((u) => ({ id: u.id, name: displayNameOf(u) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every event, archived ones too (the list sorts them out), soonest first;
// ones without a start date at the end, newest of those first.
export async function fetchEvents(admin: Admin): Promise<EventSummary[]> {
  const { data, error } = await admin
    .from("events")
    .select("*")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const events = (data ?? []) as EventRecord[];

  const leadIds = [...new Set(events.map((e) => e.lead_id).filter((id): id is string => id !== null))];
  const leadNames = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads, error: leadError } = await admin.from("users").select("id, email, nickname").in("id", leadIds);
    if (leadError) throw new Error(leadError.message);
    for (const lead of leads ?? []) leadNames.set(lead.id, displayNameOf(lead));
  }

  return events.map((e) => ({
    id: e.id,
    title: e.title,
    customer: e.customer,
    contactName: e.contact_name,
    contactPhone: e.contact_phone,
    contactEmail: e.contact_email,
    leadId: e.lead_id,
    leadName: e.lead_id ? (leadNames.get(e.lead_id) ?? null) : null,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    // ?? true: every event had a time before 0035.
    startsTimeSet: e.starts_time_set ?? true,
    endsTimeSet: e.ends_time_set ?? true,
    // ?? null: reads as current before 0034 has added the column.
    archivedAt: e.archived_at ?? null,
  }));
}
