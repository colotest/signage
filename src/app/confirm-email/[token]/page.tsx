import { Card } from "@/components/ui/Card";
import { hasExpired, hashInviteToken } from "@/lib/auth/invites";
import { brandFont } from "@/lib/fonts";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmEmailForm } from "./ConfirmEmailForm";

export const dynamic = "force-dynamic";

// Where the link sent to a new login email lands. It takes a press to
// confirm, rather than happening on opening the link: mail apps and spam
// filters open links in emails on their own, to check them.
export default async function ConfirmEmailPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: change, error } = await admin
    .from("email_changes")
    .select("new_email, used_at, expires_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const valid = !!change && !change.used_at && !hasExpired(change.expires_at);

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className={`${brandFont.className} text-[52px] uppercase tracking-tight`}>Colo Cloud</h1>
        {valid ? (
          <ConfirmEmailForm token={token} email={change.new_email} />
        ) : (
          <p className="mt-1 text-sm text-muted">
            This link has already been used or has expired. Change your email again from the account menu for a new one.
          </p>
        )}
      </Card>
    </div>
  );
}
