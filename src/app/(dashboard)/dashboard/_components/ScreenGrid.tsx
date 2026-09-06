"use client";

import type { PlaylistItemWithMedia, Screen } from "@/types/domain";
import { ScreenTile } from "./ScreenTile";
import { AddScreenButton } from "./AddScreenButton";

type ScreenWithPlaylist = Screen & { playlist: PlaylistItemWithMedia[] };

export function ScreenGrid({ screens }: { screens: ScreenWithPlaylist[] }) {
  return (
    // safari-toolbar-inset: this page scrolls via the shared dashboard
    // <main>, not an internal fixed-height scroll area like Media/
    // Playlists — without this, the bottom row's info card ends up behind
    // iOS Safari's floating toolbar with no way to scroll it clear.
    <div className="safari-toolbar-inset flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">Screens</h1>
        <AddScreenButton />
      </div>

      {screens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-20 text-center">
          <p className="text-[17px] font-medium">No screens yet</p>
          <p className="text-sm text-muted">Add a screen to get a player URL you can open on a TV.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map((screen) => (
            <ScreenTile key={screen.id} screen={screen} playlist={screen.playlist} />
          ))}
        </div>
      )}
    </div>
  );
}
