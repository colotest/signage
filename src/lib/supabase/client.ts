import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// Anon-key client: safe to use in Client Components. RLS restricts it to
// read-only access (see supabase/migrations/0001_init.sql) — writes always
// go through Server Actions using the admin client instead.
export function createBrowserClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
