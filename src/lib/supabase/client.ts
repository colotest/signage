import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

let client: SupabaseClient<Database> | undefined;

// Anon-key client: safe to use in Client Components. RLS restricts it to
// read-only access (see supabase/migrations/0001_init.sql) — writes always
// go through Server Actions using the admin client instead.
//
// One shared instance per page, not one per caller: every client opens its
// own realtime WebSocket (the dashboard used to open one per screen tile)
// and its own auth instance, which is what the "Multiple GoTrueClient
// instances" console warning was about. Nothing here signs in to Supabase
// auth — the dashboard has its own session cookie — so auth persistence is
// switched off entirely.
export function createBrowserClient() {
  client ??= createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  return client;
}
