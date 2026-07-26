import type { PlaylistItemWithMedia, Screen } from "@/types/domain";

type CachedPlayerState = {
  screen: Screen;
  playlist: PlaylistItemWithMedia[];
};

function cacheKey(screenId: number) {
  return `signage:player-cache:${screenId}`;
}

// Mirrors the last-known-good screen + playlist to localStorage so a player
// that reloads while offline still shows its last content instead of a
// blank screen. Guards against SSR (no `window`) and quota/serialization
// failures, both of which should degrade silently rather than crash playback.
export function saveToCache(screenId: number, state: CachedPlayerState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(screenId), JSON.stringify(state));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — playback continues either way.
  }
}

export function loadFromCache(screenId: number): CachedPlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(screenId));
    if (!raw) return null;
    return JSON.parse(raw) as CachedPlayerState;
  } catch {
    return null;
  }
}
