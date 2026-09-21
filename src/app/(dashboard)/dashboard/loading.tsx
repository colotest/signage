import { Spinner } from "@/components/ui/Spinner";

// Instant placeholder while the page's Supabase queries run. Without a
// loading boundary, a dynamic route can't be prefetched and the router
// stays on the old page until the whole server render finishes — which
// is what made header nav clicks feel unresponsive.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-semibold tracking-tight">Screens</h1>
      <div className="flex justify-center py-20 text-muted">
        <Spinner className="h-6 w-6" />
      </div>
    </div>
  );
}
