import { Header } from "./_components/Header";

// This is a live control panel, not public content — always render fresh
// rather than relying on revalidatePath to invalidate a static/ISR cache.
export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // app-shell-height, not plain lvh/svh/dvh — see the root layout for why.
    <div className="app-shell-height flex flex-col bg-background">
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">{children}</main>
    </div>
  );
}
