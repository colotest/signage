"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_BLUE_BUTTON } from "@/components/ui/Popup";
import type { EventSummary } from "@/lib/events";
import { EVENT_TYPES } from "@/lib/eventTypes";
import { cn } from "@/lib/utils/cn";
import { Checklist } from "./Checklist";
import { ChecklistReviewContext } from "./checklistState";
import { SubPage } from "./EventOverview";
import { eventTitle } from "./eventFormat";

// How near the end of the page counts as having reached it.
const END_SLACK_PX = 8;

// The Checkliste as a switch to another type would leave it, when that
// unticks something (see EventTypeTile): the new type's picks already in,
// those it ticks green and those it unticks red, each still to be changed
// — here and on the map's pins alike (the page's ChecklistStateContext is
// the review's draft meanwhile; see useChecklistReview). Nothing's saved
// until the blue ✓ at the top — which waits until the whole list has been
// scrolled through, and pressed before then scrolls there — saves the type
// and the list together. Back drops it all.
export function ChecklistReview({
  event,
  onBack,
  onDone,
}: {
  event: EventSummary;
  onBack: () => void;
  onDone: () => void;
}) {
  // Gone as the page slides out after it's saved (or dropped): the list
  // as it is, then.
  const review = useContext(ChecklistReviewContext);
  const label = review ? (EVENT_TYPES.find((t) => t.key === review.type)?.label ?? review.type) : null;
  return (
    <SubPage
      title="Checkliste"
      backLabel={`Back to ${eventTitle(event)}`}
      onBack={onBack}
      trailing={
        review ? (
          <CommitButton
            onCommit={() => {
              review.commit();
              onDone();
            }}
          />
        ) : undefined
      }
    >
      {label && (
        <p className="mb-6 px-1 text-[14px] leading-snug text-muted">
          Wechsel zu <span className="font-semibold text-foreground">{label}</span>:{" "}
          <span className="font-medium text-danger">rot</span> Markiertes wird abgewählt,{" "}
          <span className="font-medium text-success">grün</span> Markiertes neu ausgewählt. Antippen, um es zu ändern —
          hier oder auf der Karte.
        </p>
      )}
      <Checklist />
    </SubPage>
  );
}

// The blue ✓ in the share button's place: greyed out until the page it's on
// has been scrolled to the end, and until then, pressed, scrolls there.
function CommitButton({ onCommit }: { onCommit: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const page = ref.current?.closest<HTMLElement>(".page-stack-page");
    if (!page) return;
    const check = () => {
      if (page.scrollTop + page.clientHeight >= page.scrollHeight - END_SLACK_PX) setAtEnd(true);
    };
    check();
    page.addEventListener("scroll", check, { passive: true });
    const resize = new ResizeObserver(check);
    resize.observe(page);
    return () => {
      page.removeEventListener("scroll", check);
      resize.disconnect();
    };
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (atEnd) return onCommit();
        const page = ref.current?.closest<HTMLElement>(".page-stack-page");
        page?.scrollTo({ top: page.scrollHeight, behavior: "smooth" });
      }}
      aria-disabled={!atEnd}
      title={atEnd ? "Übernehmen" : "Bis zum Ende ansehen"}
      aria-label={atEnd ? "Übernehmen" : "Bis zum Ende ansehen"}
      className={cn(POPUP_BLUE_BUTTON, "transition-[filter,opacity]", !atEnd && "opacity-50 grayscale")}
    >
      <CheckIcon className="h-5 w-5" />
    </button>
  );
}
