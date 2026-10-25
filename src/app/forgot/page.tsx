"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { brandFont } from "@/lib/fonts";
import { AuthField } from "../_components/AuthField";

// "Forgot password?" on the login page. The answer is the same whether or
// not there's an account for that email (see forgotPasswordAction).
export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className={`${brandFont.className} text-[52px] uppercase tracking-tight`}>Colo Cloud</h1>
        {state?.sent ? (
          <p className="mt-3 text-sm text-muted">
            If there&rsquo;s an account for <span className="font-medium text-foreground">{state.sent}</span>, we&rsquo;ve
            emailed it a link to choose a new password. It works for an hour.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">We&rsquo;ll email you a link to choose a new password.</p>
            <form action={action} className="mt-6 flex flex-col gap-3">
              <AuthField
                type="email"
                name="email"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                placeholder="Email"
                required
              />
              {state?.error && <p className="text-sm text-danger">{state.error}</p>}
              <Button type="submit" disabled={pending} className="mt-1 w-full">
                {pending ? "Sending…" : "Send Link"}
              </Button>
            </form>
          </>
        )}
        <Link href="/login" className="mt-4 block text-center text-[13px] text-accent hover:underline">
          Back to Log In
        </Link>
      </Card>
    </div>
  );
}
