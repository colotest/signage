import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

let client: SupabaseClient<Database> | undefined;

// Browser client: safe to use in Client Components. Reads only — writes
// always go through Server Actions using the admin client instead.
//
// It asks the app for a short-lived token saying who's asking — someone
// signed in, or a paired TV (see src/lib/supabase/token.ts and
// /api/supabase-token) — and sends that instead of the bare anon key, so
// the database's rules can tell them apart. With no token to be had (none
// configured, not signed in, a TV not paired yet), it falls back to the
// anon key.
//
// One shared instance per page, not one per caller: every client opens its
// own realtime WebSocket (the dashboard used to open one per screen tile)
// and its own auth instance, which is what the "Multiple GoTrueClient
// instances" console warning was about. Nothing here signs in to Supabase
// auth — the dashboard has its own session cookie — so with the token
// handed in through accessToken, Supabase's own auth isn't used at all.
export function createBrowserClient() {
  client ??= createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    accessToken,
  });
  return client;
}

// Asked again two minutes before it runs out; a miss (no token, or the
// request failed) is remembered for a while rather than asked about on
// every query.
const RENEW_EARLY_MS = 2 * 60 * 1000;
const NO_TOKEN_RETRY_MS = 5 * 60 * 1000;
const FAILED_RETRY_MS = 30 * 1000;

let cached: { token: string | null; until: number } | null = null;
let inflight: Promise<string | null> | null = null;

async function accessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (cached && Date.now() < cached.until) return cached.token;
  inflight ??= fetchToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchToken(): Promise<string | null> {
  // The player asks for its TV's token; every other page, the user's.
  const asScreen = window.location.pathname.startsWith("/screen/");
  try {
    const response = await fetch(`/api/supabase-token${asScreen ? "?as=screen" : ""}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status !== 200) {
      cached = { token: null, until: Date.now() + NO_TOKEN_RETRY_MS };
      return null;
    }
    const { token, expiresAt } = (await response.json()) as { token: string; expiresAt: number };
    cached = { token, until: expiresAt * 1000 - RENEW_EARLY_MS };
    return token;
  } catch {
    // Offline, most likely: keep a token that's still good rather than
    // dropping back to the anon key.
    const stillGood = cached?.token && Date.now() < (cached.until ?? 0) + RENEW_EARLY_MS ? cached.token : null;
    cached = { token: stillGood, until: Date.now() + FAILED_RETRY_MS };
    return stillGood;
  }
}

// The token as it stands, without asking for a new one — for a request
// that has to go out right now (a page closing), and the bearer it should
// carry.
export function currentBearer(): string {
  return cached?.token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
}
