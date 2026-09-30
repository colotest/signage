// Shared by the player (which reports) and the dashboard (which reads) —
// see 0025_screen_status.sql.

// How often a running player reports in, even with nothing changing.
export const HEARTBEAT_MS = 20_000;

// How long without a report before a screen counts as offline. Several
// heartbeats' worth, so one or two lost requests don't flip it — and
// enough to ride out a browser throttling a hidden tab's timers to about
// once a minute. This is also how long a power cut takes to show up.
export const OFFLINE_AFTER_MS = 75_000;
