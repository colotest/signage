"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { usePopupLaunch } from "@/lib/animation/popupLaunch";
import { cn } from "@/lib/utils/cn";

// The little centred popup the dashboard uses for short forms — "+ New
// Group" (GroupDialog) set the look: a round button either side of the
// title, ✕ on the left and the go-ahead on the right, over a scrolling
// body. Grows out of the button that opened it and shrinks back into it
// (see lib/animation/popupLaunch). Radix unmounts the body while closed,
// so each open starts afresh.
export function Popup({
  open,
  onOpenChange,
  title,
  leading,
  trailing,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  // The round buttons beside the title (see POPUP_WHITE_BUTTON and
  // POPUP_BLUE_BUTTON).
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { attach, onAnimationEnd } = usePopupLaunch(open);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/30" />
        <Dialog.Content
          ref={attach}
          onAnimationEnd={onAnimationEnd}
          aria-describedby={undefined}
          className={cn(
            "menu-pop launch-popup fixed left-1/2 top-1/2 z-[70] flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-sheet)] outline-none",
            className,
          )}
        >
          <div className="flex items-center gap-3 p-3">
            {leading ?? <span className="w-10 shrink-0" />}
            <Dialog.Title className="flex min-w-0 flex-1 items-center justify-center gap-2 truncate text-center text-[15px] font-semibold">
              {title}
            </Dialog.Title>
            {trailing ?? <span className="w-10 shrink-0" />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ROUND_BUTTON = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40";
export const POPUP_WHITE_BUTTON = `${ROUND_BUTTON} border border-border bg-white text-[#1d1d1f] shadow-[var(--shadow-control)] hover:bg-neutral-50`;
export const POPUP_BLUE_BUTTON = `${ROUND_BUTTON} bg-accent text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90`;
