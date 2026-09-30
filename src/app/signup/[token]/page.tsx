import { Card } from "@/components/ui/Card";
import { hasExpired, hashInviteToken } from "@/lib/auth/invites";
import { brandFont } from "@/lib/fonts";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

// Where a single-use link from the Users page lands. Checked up front so a
// spent or expired link says so straight away, rather than only after its
// visitor has filled the form in (signupAction checks again regardless).
export default async function SignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("signup_invites")
    .select("used_at, expires_at")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const valid = !!invite && !invite.used_at && !hasExpired(invite.expires_at);

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm p-8">
        <h1 className={`${brandFont.className} text-[52px] uppercase tracking-tight`}>Colo Cloud</h1>
        {valid ? (
          <>
            <p className="mt-1 text-sm text-muted">Create your account.</p>
            <SignupForm token={token} />
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            This signup link has already been used or has expired. Ask an admin for a new one.
          </p>
        )}
      </Card>
    </div>
  );
}
