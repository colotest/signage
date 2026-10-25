"use client";

import { useRef, useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { emailChecklist } from "@/lib/actions/events";
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

// The Checkliste's share button: pick people from Events Management, and
// Send emails them the Checkliste as filled in so far (as it shows here,
// unsaved changes and all), from the app itself, with replies going to
// whoever sent it.
export function ShareChecklist({ event, people }: { event: EventSummary; people: EventPerson[] }) {
  const { answer } = useChecklist();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const team = people.filter((p) => p.management && p.email);
  const allPicked = team.length > 0 && team.every((p) => picked.has(p.id));

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    const answers: Record<string, true | string> = {};
    for (const key of FIELD_KEYS) {
      const value = answer(key);
      if (value !== null && value !== "") answers[key] = value;
    }
    setSending("sending");
    setError(null);
    const problem = await emailChecklist(event.id, [...picked], answers, formatEventRange(event)).catch((err: unknown) =>
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
          <span className="text-[12px] text-muted">Send to Events Management</span>
          {team.length > 1 && (
            <button
              type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(team.map((p) => p.id)))}
              className="press-ghost text-[12px] font-medium text-accent"
            >
              {allPicked ? "None" : "All"}
            </button>
          )}
        </div>
        {team.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-muted">No one is in the Events Management role yet.</p>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto">
            {team.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={picked.has(person.id)}
                  onClick={() => toggle(person.id)}
                  className="press-ghost-fit flex w-full items-center gap-2.5 rounded-[calc(var(--radius-md)-4px)] px-2 py-1.5 text-left hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors",
                      picked.has(person.id) ? "border-accent bg-accent text-accent-contrast" : "border-muted/50",
                    )}
                  >
                    {picked.has(person.id) && <CheckIcon className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{person.name}</span>
                    <span className="block truncate text-[12px] text-muted">{person.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
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
