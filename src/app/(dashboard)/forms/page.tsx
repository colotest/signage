import { pageViewer } from "@/lib/auth/session";
import { fetchEvents, fetchLeadCandidates } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVenueScreens } from "@/lib/venueScreens";
import { FormsView } from "./_components/FormsView";

export default async function FormsPage() {
  const viewer = await pageViewer("forms");
  const admin = createAdminClient();
  const [events, people, screens] = await Promise.all([
    fetchEvents(admin),
    fetchLeadCandidates(admin, viewer),
    fetchVenueScreens(admin, viewer.access),
  ]);
  return <FormsView events={events} people={people} screens={screens} />;
}
