import { Spinner } from "@/components/ui/Spinner";

// Instant placeholder while the page's Supabase queries run — see
// dashboard/loading.tsx for why this matters for nav responsiveness.
// Mirrors LibraryView's two-section split so the page doesn't jump.
export default function LibraryLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <section className="flex min-h-0 flex-[3] flex-col sm:flex-1">
        <h1 className="text-[28px] font-semibold tracking-tight">Media</h1>
        <div className="flex flex-1 items-center justify-center text-muted">
          <Spinner className="h-6 w-6" />
        </div>
      </section>
      <section className="flex min-h-0 flex-[4] flex-col sm:flex-1">
        <h2 className="text-[28px] font-semibold tracking-tight">Playlists</h2>
      </section>
    </div>
  );
}
