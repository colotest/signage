"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createScreen } from "@/lib/actions/screens";
import { createGroup } from "@/lib/actions/groups";
import { Menu } from "@/components/ui/Menu";
import { rememberTrigger } from "@/lib/utils/lastTrigger";
import { MENU_ITEM_CLASS } from "@/app/(dashboard)/library/_components/FileTree";
import { GroupDialog } from "./GroupDialog";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

// The Screens page's one "+": a little menu with New Screen and New Group.
// Blue, like every page's "+" (the Events list's too): the group picker
// launches out of it and, closing, fades back into its colour.
export function AddButton({ screens }: { screens: { id: number; name: string }[] }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        disabled={pending}
        title="Add"
        aria-label="Add a screen or group"
        aria-expanded={menuOpen}
        className="title-action-round shrink-0 bg-accent text-accent-contrast shadow-[var(--shadow-control)] transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <PlusIcon className="title-action-glyph" />
      </button>

      <Menu open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={anchorRef} className="w-44 p-1">
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            startTransition(async () => {
              await createScreen();
              router.refresh();
            });
          }}
          className={MENU_ITEM_CLASS}
        >
          New Screen
        </button>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            // The picker grows out of the "+", not out of this item, which
            // is on its way out with the menu.
            if (anchorRef.current) rememberTrigger(anchorRef.current);
            setGroupOpen(true);
          }}
          className={MENU_ITEM_CLASS}
        >
          New Group
        </button>
      </Menu>

      <GroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        screens={screens}
        onSubmit={async (name, screenIds) => {
          await createGroup(name, screenIds);
          router.refresh();
        }}
      />
    </div>
  );
}
