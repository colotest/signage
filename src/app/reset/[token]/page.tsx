import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { hasExpired, hashInviteToken } from "@/lib/auth/invites";
import { brandFont } from "@/lib/fonts";
import { createAdminClient } from "@/lib/supabase/admin";
import { ResetForm } from "./ResetForm";

export const dynamic = "force-dynamic";

// Where a password reset email's link lands. Checked up front, like a
// signup link, so a spent or expired one says so before anything's typed
// (resetPasswordAction checks again regardless).
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: reset, error } = await admin
    .from("password_resets")
    .select("used_at, expires_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const valid = !!reset && !reset.used_at && !hasExpired(reset.expires_at);

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className={`${brandFont.className} text-[52px] uppercase tracking-tight`}>Colo Cloud</h1>
        {valid ? (
          <>
            <p className="mt-1 text-sm text-muted">Choose a new password.</p>
            <ResetForm token={token} />
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">This link has already been used or has expired.</p>
            <Link href="/forgot" className="mt-4 block text-center text-[13px] text-accent hover:underline">
              Send a New Link
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
