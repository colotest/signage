"use client";

import { useActionState } from "react";
import { signupAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { AuthField } from "../../_components/AuthField";

export function SignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(signupAction, undefined);

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <AuthField
        key={state?.email}
        type="email"
        name="email"
        autoFocus
        autoComplete="username"
        autoCapitalize="none"
        placeholder="Email"
        defaultValue={state?.email}
        required
      />
      <AuthField type="password" name="password" autoComplete="new-password" placeholder="Password" minLength={8} required />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Creating…" : "Create Account"}
      </Button>
    </form>
  );
}
