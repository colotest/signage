"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { brandFont } from "@/lib/fonts";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className={`${brandFont.className} text-[52px] uppercase tracking-tight`}>Colo Cloud</h1>
        <p className="mt-1 text-sm text-muted">Enter the dashboard password to continue.</p>

        <form action={action} className="mt-6 flex flex-col gap-3">
          <input
            type="password"
            name="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            className="rounded-[var(--radius-md)] border border-border bg-black/[.03] dark:bg-white/[.06] px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-accent"
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
