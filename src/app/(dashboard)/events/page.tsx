import { pageViewer } from "@/lib/auth/session";
import { fetchEvents, fetchLeadCandidates } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVenueScreens } from "@/lib/venueScreens";
import { EventsView } from "./_components/EventsView";

export default async function EventsPage() {
  const viewer = await pageViewer("forms");
  const admin = createAdminClient();
  const [events, people, screens] = await Promise.all([
    fetchEvents(admin),
    fetchLeadCandidates(admin, viewer),
    fetchVenueScreens(admin, viewer.access),
  ]);
  return <EventsView events={events} people={people} screens={screens} />;
}
