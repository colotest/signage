"use client";

import type { ComponentType } from "react";
import type { MediaItem } from "@/types/domain";
import { ClockFace } from "./ClockFace";

// Pages are built-in, code-rendered slides (see 0013/0014 migrations). Each
// one is still a media_items row, so it goes through the library, playlists
// and screens exactly like an uploaded file — its storage_path just names
// one of the components below ("page:<key>") instead of a storage object.
type PageProps = { now?: () => number };

const PAGES: Record<string, ComponentType<PageProps>> = {
  clock: ClockFace,
};

const PREFIX = "page:";

export function ScreenPage({ item, now }: { item: MediaItem; now?: () => number }) {
  const key = item.storage_path.startsWith(PREFIX) ? item.storage_path.slice(PREFIX.length) : "";
  const Page = PAGES[key];
  // An unknown key (a page added in the database ahead of the deploy that
  // brings its component) shows black, like any slide still loading.
  if (!Page) return <div className="h-full w-full bg-[var(--screen-bg,#000)]" />;
  return <Page now={now} />;
}
