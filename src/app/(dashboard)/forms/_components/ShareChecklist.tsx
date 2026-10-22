"use client";

import { useRef, useState } from "react";
import { Menu } from "@/components/ui/Menu";
import { POPUP_WHITE_BUTTON } from "@/components/ui/Popup";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { checklistText } from "@/lib/checkliste";
import type { EventPerson, EventSummary } from "@/lib/events";
import { cn } from "@/lib/utils/cn";
import { useChecklist } from "./checklistState";
import { eventTitle, formatEventRange } from "./eventFormat";

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M8 10H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}

// The Checkliste's share button: pick people from Events Management, and
// Continue opens an email to them in the mail app, with the Checkliste as
// filled in so far (as it shows here, unsaved changes and all) as its body.
export function ShareChecklist({ event, people }: { event: EventSummary; people: EventPerson[] }) {
  const { answer } = useChecklist();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
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

  function send() {
    const to = team.filter((p) => picked.has(p.id)).map((p) => p.email);
    const title = eventTitle(event);
    const when = event.startsAt ? formatEventRange(event) : null;
    const body = [`Checkliste – ${title}`, when, "", checklistText(answer)].filter((l) => l !== null).join("\n");
    const url = `mailto:${to.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(
      `Checkliste – ${title}`,
    )}&body=${encodeURIComponent(body)}`;
    setOpen(false);
    window.location.href = url;
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
        <button
          type="button"
          onClick={send}
          disabled={picked.size === 0}
          className="mt-2 w-full rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast hover:opacity-90 disabled:opacity-40"
        >
          Continue
        </button>
      </Menu>
    </div>
  );
}
