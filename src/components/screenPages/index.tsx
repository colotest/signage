"use client";

import type { ComponentType } from "react";
import type { MediaItem } from "@/types/domain";
import { ClockFace } from "./ClockFace";
import { Glitter } from "./Glitter";
import { LavaLamp } from "./LavaLamp";
import { LavaLamp3D } from "./LavaLamp3D";
import { Website } from "./Website";

// Pages are built-in, code-rendered slides (see 0013/0014 migrations). Each
// one is still a media_items row, so it goes through the library, playlists
// and screens exactly like an uploaded file — its storage_path just names
// one of the components below ("page:<key>") instead of a storage object.
// `tuning` is a page's dials, turned live from a screen's dashboard tile
// (see dials.ts); pages without any ignore it. `item` is the page's own
// row, for a page set from the library (the Website's address); and
// `preview` says it's a thumbnail rather than the screen — "live" on a
// dashboard tile, "still" in a list — for a page that would rather not
// run in full there.
type PageProps = {
  now?: () => number;
  tuning?: Record<string, number>;
  item?: MediaItem;
  preview?: "live" | "still";
};

const PAGES: Record<string, ComponentType<PageProps>> = {
  clock: ClockFace,
  lavalamp: LavaLamp,
  glitter: Glitter,
  lavalamp3d: LavaLamp3D,
  website: Website,
};

const PREFIX = "page:";

export function ScreenPage({
  item,
  now,
  tuning,
  preview,
}: {
  item: MediaItem;
  now?: () => number;
  preview?: "live" | "still";
  // Every page's tuning, by page key; each page gets its own.
  tuning?: Record<string, Record<string, number>>;
}) {
  const key = item.storage_path.startsWith(PREFIX) ? item.storage_path.slice(PREFIX.length) : "";
  const Page = PAGES[key];
  // An unknown key (a page added in the database ahead of the deploy that
  // brings its component) shows black, like any slide still loading.
  if (!Page) return <div className="h-full w-full bg-[var(--screen-bg,#000)]" />;
  return <Page now={now} tuning={tuning?.[key]} item={item} preview={preview} />;
}
