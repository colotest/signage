"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/credentials";
import { AuthField } from "../../_components/AuthField";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <AuthField
        type="password"
        name="password"
        autoFocus
        autoComplete="new-password"
        placeholder="New password"
        minLength={MIN_PASSWORD_LENGTH}
        required
      />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Saving…" : "Save and Log In"}
      </Button>
    </form>
  );
}
