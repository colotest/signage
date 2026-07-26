import Link from "next/link";
import { logoutAction } from "@/lib/actions/auth";

// This is a live control panel, not public content — always render fresh
// rather than relying on revalidatePath to invalidate a static/ISR cache.
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[var(--surface-elevated)] px-5 py-3 backdrop-blur-xl">
        <nav className="flex items-center gap-5">
          <span className="text-[17px] font-semibold tracking-tight">Signage</span>
          <Link href="/dashboard" className="text-[15px] text-foreground/80 hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/library" className="text-[15px] text-foreground/80 hover:text-foreground">
            Library
          </Link>
        </nav>
        <form action={logoutAction}>
          <button type="submit" className="text-[15px] text-accent">
            Log Out
          </button>
        </form>
      </header>
      <main className="flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
