"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmEmailChangeAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/Button";

export function ConfirmEmailForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(confirmEmailChangeAction, undefined);

  if (state?.done) {
    return (
      <>
        <p className="mt-3 text-sm text-muted">
          Done. You log in with <span className="font-medium text-foreground">{state.done}</span> from now on.
        </p>
        <Link
          href="/home"
          className="mt-6 flex w-full items-center justify-center rounded-full bg-accent px-4 py-2 text-[15px] font-medium text-accent-contrast shadow-[var(--shadow-control)] hover:opacity-90"
        >
          Continue
        </Link>
      </>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted">
        Log in with <span className="font-medium text-foreground">{email}</span> from now on?
      </p>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-3 w-full">
        {pending ? "Confirming…" : "Confirm Email"}
      </Button>
    </form>
  );
}
