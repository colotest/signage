import { GuestsView } from "./_components/GuestsView";

// The venue introduced for guests: open to everyone signed in, whatever
// their roles — it's where someone with none lands (see landingPath). The
// dashboard layout has already checked the session.
export default function GuestsPage() {
  return <GuestsView />;
}
