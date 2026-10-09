import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { ViewerProvider } from "@/lib/auth/ViewerContext";
import { Header } from "./_components/Header";

// This is a live control panel, not public content — always render fresh
// rather than relying on revalidatePath to invalidate a static/ISR cache.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  // A validly signed cookie whose account is gone — /logout clears it (see
  // there for why this can't just go to /login).
  if (!user) redirect("/logout");

  return (
    <ViewerProvider viewer={{ ...user, isAdmin: isAdmin(user) }}>
      {/* app-shell-height, not plain lvh/svh/dvh — see the root layout for why.
          app-shell: its blurs go off under a popup on a phone (see globals.css). */}
      <div className="app-shell app-shell-height flex flex-col bg-background">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">{children}</main>
      </div>
    </ViewerProvider>
  );
}
