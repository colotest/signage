"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { quote, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { parseChecklist } from "@/lib/checkliste";
import { sendEmail } from "@/lib/email/send";
import { handoverEmail } from "@/lib/email/templates";
import { eventRecipients } from "@/lib/eventRecipients";
import { handoverPdf } from "@/lib/handoverPdf";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  applyHandoverPatch,
  emptyHandoverForm,
  formatHandoverDay,
  handoverFileName,
  handoverFormLabel,
  handoverPhotoPath,
  isHandoverForm,
  parseHandover,
  visibleProtocol,
  type HandoverFormKey,
  type HandoverPatch,
} from "@/lib/uebergabeprotokoll";
import { displayNameOf } from "@/lib/uploads/uploaders";

const BUCKET = "media";
// What new events start with in place of their customer and contact (see
// createPresetEvent): not names to put on a protocol.
const PRESETS = new Set(["Title", "Customer", "Contact Name"]);
const named = (value: string | null) => {
  const text = value?.trim() ?? "";
  return text && !PRESETS.has(text) ? text : null;
};

// Fills in some of one of an event's two protocols — just what's in the
// patch, merged into what's stored, so two people working through
// different parts don't overwrite each other. A photo no longer on its
// item is taken out of storage. Resolves to an error message to show, or
// null once saved.
export async function updateHandover(id: string, form: HandoverFormKey, patch: HandoverPatch): Promise<string | null> {
  try {
    const user = await requirePage("forms");
    if (!isHandoverForm(form)) throw new Error("That isn't one of the protocol's forms.");
    const admin = createAdminClient();
    const { data, error: readError } = await admin.from("events").select("title, handover").eq("id", id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!data) throw new Error("That event no longer exists.");
    const handover = parseHandover(data.handover, id);
    const before = handover[form] ?? emptyHandoverForm();
    const after = applyHandoverPatch(before, patch, id);
    handover[form] = after;
    const { error } = await admin.from("events").update({ handover }).eq("id", id);
    if (error) throw new Error(error.message);

    const kept = new Set(Object.values(after.items).flatMap((item) => item.photos ?? []));
    const gone = Object.values(before.items)
      .flatMap((item) => item.photos ?? [])
      .filter((path) => !kept.has(path));
    if (gone.length) await admin.storage.from(BUCKET).remove(gone);

    recordActivity(user, {
      action: "event.edit",
      target: `event:${id}`,
      summary: data.title ? `Edited the event ${quote(data.title)}` : "Edited an untitled event",
    });
    revalidatePath("/events");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Konnte nicht gespeichert werden";
  }
}

// Somewhere to put a photo of a failed item, straight from the browser to
// storage (as the media library's uploads go): its path, to save on the
// item once it's there, and the token to upload it with.
export async function createHandoverPhotoUpload(
  id: string,
): Promise<{ path: string; token: string } | { error: string }> {
  try {
    await requirePage("forms");
    const admin = createAdminClient();
    const { data: event, error: readError } = await admin.from("events").select("id").eq("id", id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!event) throw new Error("That event no longer exists.");
    const path = handoverPhotoPath(id, randomUUID());
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: data.token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Das Foto konnte nicht hochgeladen werden" };
  }
}

// Emails one of the protocols, as stored, as a PDF ("Übergabeprotokoll
// Colosseum Ausgabe <event>.pdf") to people picked as for the Checkliste
// (see eventRecipients) — everyone the same. today: the sender's own date
// (DD/MM/YYYY), for a protocol not signed yet — a server has only UTC.
// Replies go to the sender. Resolves to an error message, or null once sent.
export async function emailHandover(
  id: string,
  form: HandoverFormKey,
  recipientIds: string[],
  emails: string[],
  today: string,
): Promise<string | null> {
  try {
    const user = await requirePage("forms");
    if (!isHandoverForm(form)) throw new Error("That isn't one of the protocol's forms.");
    const admin = createAdminClient();
    const { data: event, error } = await admin.from("events").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) throw new Error("That event no longer exists.");

    const { team, others } = await eventRecipients(admin, user, event, recipientIds, emails);
    const to = [...team, ...others];
    if (to.length === 0) throw new Error("Pick someone to send it to.");

    const data = parseHandover(event.handover, id)[form] ?? emptyHandoverForm();
    const checklist = parseChecklist(event.checklist);
    const sections = visibleProtocol((key) => checklist[key] ?? null);
    const date = data.signedOn
      ? formatHandoverDay(data.signedOn)
      : /^\d{2}\/\d{2}\/\d{4}$/.test(today)
        ? today
        : formatHandoverDay(new Date().toISOString().slice(0, 10));
    const title = named(event.title) ?? "Untitled Event";
    const customer = named(event.customer);

    // The photos of the items that failed, of the parts on the protocol.
    const shown = new Set(sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.key))));
    const paths = Object.entries(data.items)
      .filter(([key, item]) => shown.has(key) && item.state === "issue")
      .flatMap(([, item]) => item.photos ?? []);
    const photos = new Map<string, Uint8Array>();
    await Promise.all(
      paths.map(async (path) => {
        const { data: blob } = await admin.storage.from(BUCKET).download(path);
        if (blob) photos.set(path, new Uint8Array(await blob.arrayBuffer()));
      }),
    );

    const pdf = await handoverPdf({
      form: handoverFormLabel(form),
      title,
      customer,
      date,
      contactName: data.contactName ?? named(event.contact_name),
      sections,
      data,
      photos,
    });
    const name = handoverFileName(form, title);
    await sendEmail({
      to,
      replyTo: user.email,
      ...handoverEmail({ subject: name, form: handoverFormLabel(form), title, customer, date, sender: displayNameOf(user) }),
      attachments: [{ filename: `${name}.pdf`, content: Buffer.from(pdf).toString("base64") }],
    });
    recordActivity(user, {
      action: "event.handover_email",
      summary: `Emailed the Übergabeprotokoll (${handoverFormLabel(form)}) of ${quote(title)} to ${to.length === 1 ? quote(to[0]) : `${to.length} people`}`,
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Das Übergabeprotokoll konnte nicht gesendet werden";
  }
}
