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
    <div className="flex h-dvh flex-col bg-background">
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">{children}</main>
    </div>
  );
}
