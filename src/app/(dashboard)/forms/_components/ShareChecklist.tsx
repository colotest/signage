"use client";

import { useRef, useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { addChecklistEmail, emailChecklist } from "@/lib/actions/events";
import { isEmail, MAX_EMAIL } from "@/lib/eventEmails";
import { CHECKLISTE } from "@/lib/checkliste";
import type { EventPerson, EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { useChecklist } from "./checklistState";
import { formatEventRange } from "./eventFormat";

const FIELD_KEYS = CHECKLISTE.flatMap((c) => c.sections.flatMap((s) => s.fields.map((f) => f.key)));

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

// The Checkliste's share button: pick people from Events Management, the
// event's contact (as on its overview) or addresses kept for this event —
// "+ New" adds one — and Send emails them the Checkliste as filled in so
// far (as it shows here, unsaved changes and all), from the app itself,
// with replies going to whoever sent it.
export function ShareChecklist({ event, people }: { event: EventSummary; people: EventPerson[] }) {
  const { answer } = useChecklist();
  const [open, setOpen] = useState(false);
  // Picked: "user:<id>" for Events Management, "email:<address>" otherwise.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  // Addresses added here, ahead of the server.
  const [added, setAdded] = useState<string[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const team = people.filter((p) => p.management && p.email);
  const contactEmail = event.contactEmail?.trim() ?? "";
  const contact = isEmail(contactEmail) ? { name: event.contactName?.trim() || "Event contact", email: contactEmail } : null;
  const extra = [...new Map([...event.checklistEmails, ...added].map((e) => [e.toLowerCase(), e])).values()].filter(
    (e) => e.toLowerCase() !== contact?.email.toLowerCase(),
  );
  const options = [
    ...team.map((p) => ({ key: `user:${p.id}`, name: p.name, email: p.email! })),
    ...(contact ? [{ key: `email:${contact.email}`, name: contact.name, email: contact.email }] : []),
    ...extra.map((e) => ({ key: `email:${e}`, name: null, email: e })),
  ];
  const allPicked = options.length > 0 && options.every((o) => picked.has(o.key));

  function toggle(key: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addEmail() {
    const address = (draft ?? "").trim();
    if (!isEmail(address)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setAdding(true);
    setError(null);
    const problem = await addChecklistEmail(event.id, address).catch(() => "Couldn't add the address");
    setAdding(false);
    if (problem) {
      setError(problem);
      return;
    }
    setAdded((all) => [...all, address]);
    setPicked((s) => new Set(s).add(`email:${address}`));
    setDraft(null);
  }

  async function send() {
    const answers: Record<string, true | string> = {};
    for (const key of FIELD_KEYS) {
      const value = answer(key);
      if (value !== null && value !== "") answers[key] = value;
    }
    const ids = [...picked].filter((k) => k.startsWith("user:")).map((k) => k.slice(5));
    const emails = [...picked].filter((k) => k.startsWith("email:")).map((k) => k.slice(6));
    setSending("sending");
    setError(null);
    const problem = await emailChecklist(event.id, ids, emails, answers, formatEventRange(event)).catch((err: unknown) =>
      err instanceof Error ? err.message : "Couldn't send the Checkliste",
    );
    if (problem) {
      setSending("idle");
      setError(problem);
      return;
    }
    setSending("sent");
    // A moment to see it went, then out of the way.
    setTimeout(() => {
      setOpen(false);
      setSending("idle");
      setPicked(new Set());
    }, 900);
  }

  return (
    <div className="relative ml-auto shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Share checklist"
        aria-label="Share checklist"
        aria-expanded={open}
        className={POPUP_WHITE_BUTTON}
      >
        <ShareIcon className="h-5 w-5 -translate-y-px" />
      </button>

      <Menu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        dragSelect={false}
        role="dialog"
        aria-label="Share checklist"
        className="w-72 p-2"
      >
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
          <span className="text-[12px] text-muted">Send to</span>
          {options.length > 1 && (
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(options.map((o) => o.key)))}
              className="press-ghost text-[12px] font-medium text-accent"
            >
              {allPicked ? "None" : "All"}
            </button>
          )}
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {team.length === 0 && (
            <li className="px-2 py-2 text-[13px] text-muted">No one is in the Events Management role yet.</li>
          )}
          {options.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={picked.has(option.key)}
                onClick={() => toggle(option.key)}
                className="press-ghost-fit flex w-full items-center gap-2.5 rounded-[calc(var(--radius-md)-4px)] px-2 py-1.5 text-left hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors",
                    picked.has(option.key) ? "border-accent bg-accent text-accent-contrast" : "border-muted/50",
                  )}
                >
                  {picked.has(option.key) && <CheckIcon className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  {option.name && <span className="block truncate text-[14px]">{option.name}</span>}
                  <span className={cn("block truncate", option.name ? "text-[12px] text-muted" : "text-[14px]")}>
                    {option.email}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li>
            {draft === null ? (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setError(null);
                }}
                className="press-ghost-fit flex w-full items-center gap-2.5 rounded-[calc(var(--radius-md)-4px)] px-2 py-1.5 text-left text-[14px] font-medium text-accent hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                + New
              </button>
            ) : (
              // An address for this event only, kept with it once added.
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void addEmail();
                }}
                className="flex items-center gap-1.5 px-1 py-1"
              >
                <input
                  type="email"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setDraft(null);
                    }
                  }}
                  maxLength={MAX_EMAIL}
                  placeholder="name@example.com"
                  aria-label="New email address"
                  autoFocus
                  className="min-w-0 flex-1 select-text rounded-[var(--radius-md)] border border-border bg-surface px-2.5 py-1.5 text-[14px] outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={adding || !draft.trim()}
                  className="shrink-0 rounded-full bg-[var(--control-fill)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--control-fill-hover)] disabled:opacity-40"
                >
                  {adding ? <Spinner className="h-3.5 w-3.5" /> : "Add"}
                </button>
              </form>
            )}
          </li>
        </ul>
        {error && <p className="px-2 pt-2 text-[12px] text-danger">{error}</p>}
        <button
          type="button"
          onClick={send}
          disabled={picked.size === 0 || sending !== "idle"}
          className="mt-2 flex w-full items-center justify-center rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-40"
        >
          {sending === "sending" ? <Spinner className="my-[3px]" /> : sending === "sent" ? "Sent ✓" : "Send"}
        </button>
      </Menu>
    </div>
  );
}
