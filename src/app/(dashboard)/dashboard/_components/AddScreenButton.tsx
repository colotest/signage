"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createScreen } from "@/lib/actions/screens";
import { Button } from "@/components/ui/Button";

export function AddScreenButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await createScreen();
          router.refresh();
        })
      }
    >
      + Add Screen
    </Button>
  );
}
