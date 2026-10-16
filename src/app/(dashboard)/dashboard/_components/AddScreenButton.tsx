"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createScreen } from "@/lib/actions/screens";
import { createGroup } from "@/lib/actions/groups";
import { Button } from "@/components/ui/Button";
import { GroupDialog } from "./GroupDialog";

// "+ Screen" on a phone, "+ New Screen" from sm up.
export function AddScreenButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="grey"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await createScreen();
          router.refresh();
        })
      }
    >
      + <span className="hidden sm:inline">New </span>Screen
    </Button>
  );
}

// "+ Group" on a phone, "+ New Group" from sm up — opens the screen picker.
export function AddGroupButton({ screens }: { screens: { id: number; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Grey, like "+ New Screen" beside it: the group picker launches out
          of this and, closing, fades back into its colour — a quiet grey is
          far less of a flash than the accent blue was. */}
      <Button variant="grey" onClick={() => setOpen(true)}>
        + <span className="hidden sm:inline">New </span>Group
      </Button>
      <GroupDialog
        open={open}
        onOpenChange={setOpen}
        screens={screens}
        onSubmit={async (name, screenIds) => {
          await createGroup(name, screenIds);
          router.refresh();
        }}
      />
    </>
  );
}
