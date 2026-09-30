"use client";

import { useMemo, useState } from "react";
import { MonthCalendar, dayKey } from "@/components/MonthCalendar";
import { TITLE_CLEAR_BELOW } from "@/components/SectionTitle";
import type { ScheduledPlayback } from "@/types/domain";
import type { PlaylistWithEntries } from "../../library/_components/PlaylistSection";
import { formatCountdown, useNow } from "./ScheduleDialog";

const DAY_MS = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Every calendar day a window touches — so a late-night slot running past
// midnight marks, and lists under, both days.
function daysSpanned(schedule: ScheduledPlayback): string[] {
  const keys: string[] = [];
  const end = new Date(schedule.ends_at).getTime();
  for (let day = startOfDay(new Date(schedule.run_at)); day.getTime() < end; day = new Date(day.getTime() + DAY_MS)) {
    keys.push(dayKey(day));
  }
  return keys;
}

function timeOfDay(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function shortDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// The Playback Menu's Calendar: this screen's timers on a month grid (days
// with something scheduled get a dot) beside — or on a phone, above — the
// selected day's schedules. Each shows its window and whether it's still
// to come or playing now, and can be edited (the same popup as a
// playlist's alarm clock) or cancelled. Just the body: the menu draws the
// "Calendar" heading itself, docked at its scroll view's edges.
//
// minHeight: tall enough that the menu can always scroll the calendar right
// up under its heading, even when there's little on it.
export function CalendarSection({
  schedules,
  playlists,
  onEdit,
  onCancel,
  minHeight,
}: {
  minHeight?: number;
  schedules: ScheduledPlayback[];
  playlists: PlaylistWithEntries[];
  onEdit: (playlistId: string) => void;
  onCancel: (playlistId: string) => void;
}) {
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const now = useNow();

  const nameById = useMemo(() => new Map(playlists.map((p) => [p.id, p.name])), [playlists]);
  const markedDays = useMemo(() => new Set(schedules.flatMap(daysSpanned)), [schedules]);

  const dayStart = selected.getTime();
  const dayEnd = dayStart + DAY_MS;
  const onSelectedDay = schedules
    .filter((t) => new Date(t.run_at).getTime() < dayEnd && new Date(t.ends_at).getTime() > dayStart)
    .sort((a, b) => a.run_at.localeCompare(b.run_at));

  return (
    // Starts just clear of the "Calendar" heading's band.
    <div className="pb-3" style={{ minHeight, paddingTop: TITLE_CLEAR_BELOW }}>
      <div>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="sm:w-[300px] sm:shrink-0">
            <MonthCalendar value={selected} onSelect={(day) => setSelected(startOfDay(day))} markedDays={markedDays} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="mb-2 px-1 text-[15px] font-semibold">
              {selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </p>

            {onSelectedDay.length === 0 ? (
              <p className="px-1 text-[13px] text-muted">
                Nothing scheduled. A playlist&rsquo;s alarm clock sets a time for it.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {onSelectedDay.map((t) => {
                  const start = new Date(t.run_at);
                  const end = new Date(t.ends_at);
                  const playing = Boolean(t.fired_at) || start.getTime() <= now;
                  // Show the dates only where a window crosses midnight, so
                  // an ordinary same-day slot stays as short as "18:00 – 22:00".
                  const crossesDays = startOfDay(start).getTime() !== startOfDay(end).getTime();
                  const range = crossesDays
                    ? `${shortDay(start)} ${timeOfDay(start)} – ${shortDay(end)} ${timeOfDay(end)}`
                    : `${timeOfDay(start)} – ${timeOfDay(end)}`;
                  const name = nameById.get(t.playlist_id) ?? "Deleted playlist";
                  return (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{name}</p>
                        <p className="truncate text-[12px] text-muted">
                          {range} ·{" "}
                          {playing ? (
                            <span className="text-accent">Playing now</span>
                          ) : (
                            `in ${formatCountdown(start.getTime() - now)}`
                          )}
                        </p>
                      </div>

                      {confirmingCancel === t.id ? (
                        <div className="flex shrink-0 items-center gap-2 text-[13px]">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingCancel(null);
                              onCancel(t.playlist_id);
                            }}
                            className="press-ghost font-medium text-danger hover:opacity-70"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingCancel(null)}
                            className="press-ghost text-muted hover:opacity-70"
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-3 text-[13px]">
                          <button
                            type="button"
                            onClick={() => onEdit(t.playlist_id)}
                            className="press-ghost font-medium text-accent hover:opacity-70"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingCancel(t.id)}
                            className="press-ghost text-muted hover:text-danger"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
