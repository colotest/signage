"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { brandFont } from "@/lib/fonts";
import { AuthField } from "../_components/AuthField";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className={`${brandFont.className} text-[52px] uppercase tracking-tight`}>Colo Cloud</h1>
        <p className="mt-1 text-sm text-muted">Log in to continue.</p>

        <form action={action} className="mt-6 flex flex-col gap-3">
          {/* key: a failed attempt re-mounts the email field with what was
              typed, since a form action resets uncontrolled inputs. */}
          <AuthField
            key={state?.email}
            type="email"
            name="email"
            autoFocus={!state?.email}
            autoComplete="username"
            autoCapitalize="none"
            placeholder="Email"
            defaultValue={state?.email}
            required
          />
          <AuthField
            type="password"
            name="password"
            autoFocus={!!state?.email}
            autoComplete="current-password"
            placeholder="Password"
            required
          />
          {state?.error && <p className="text-sm text-danger">{state.error}</p>}
          <Button type="submit" disabled={pending} className="mt-1 w-full">
            {pending ? "Checking…" : "Log In"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
