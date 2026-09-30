# Signage

A free (at base scale) web-based digital signage system for a single event venue. TVs load a unique `/screen/{id}` URL in kiosk mode; a login-gated dashboard manages screens, a media library, and per-screen playlists, with changes pushed to screens in near-real-time.

**Stack:** Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Realtime, Storage) · per-user logins (email + password, signed session cookie) for the dashboard.

## How it fits together

- **Dashboard** (`/dashboard`, `/library`, `/users`) — login-gated. Register screens, manage the media library, assign content to screens.
- **Users** — everyone signs in with their own email and password, and every change they make is recorded against them. Three tiers: **super admin** > **admin** > **default**. Admins additionally get each screen's wrench menu (rename, rotation, reload, delete), **+ Add Screen**, and the **Users** page (under the avatar menu): every account, its change history, deleting accounts ranked below theirs, and single-use signup links (7 days) for new default users. The Server Actions enforce all of this themselves; hiding the controls is just the UI side.
- **Player** (`/screen/{id}`) — no login, meant to be opened fullscreen on a TV/Fire Stick/kiosk browser. Subscribes to Supabase Realtime so playlist changes appear within about a second, and caches its last-known content so it keeps showing something if the network drops. It reports what it's showing (on every change, plus a 20-second heartbeat) to `screen_status`, which is where each dashboard tile's live preview and Online/Offline dot come from — a screen that stops reporting for 75 seconds (power cut, network gone) shows as Offline.
- **Supabase** holds all persistent data (`screens`, `folders`, `media_items`, `playlist_items`) and the `media` storage bucket. Row-Level Security allows public reads (needed by the unauthenticated player) but denies all writes — every mutation goes through a Server Action using the `service_role` key, which checks the dashboard's session cookie itself first.

## One-time Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → Run. This creates the tables, RLS policies, and the two RPCs used for reordering/assigning playlist items.
3. **Storage** → New bucket → name it exactly `media` → toggle **Public bucket** on.
4. **Project Settings → API** → copy the Project URL, the `anon`/publishable key, and the `service_role`/secret key.
5. Create the first account (a super admin — everyone after that joins through a signup link from the Users page): run `node scripts/hash-password.mjs`, type the password, then in the **SQL Editor**:
   ```sql
   insert into users (email, password_hash, role)
   values ('you@example.com', '<printed hash>', 'super_admin');
   ```

## Local development

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=       # Project URL from step 4 above
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # anon / publishable key
SUPABASE_SERVICE_ROLE_KEY=      # service_role / secret key — never expose this to the client
SESSION_SECRET=                 # random string, e.g. `openssl rand -base64 32`
```

```bash
npm run dev
```

Open `http://localhost:3000` — it redirects to `/login`. After logging in you land on `/dashboard`.

## Deploying (free)

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new) (free tier).
3. In the Vercel project's **Settings → Environment Variables**, add the same four variables as above (for Production and Preview).
   - Server functions are pinned to Frankfurt (`fra1`) in `vercel.json` so they sit next to the Supabase project. If your Supabase project lives elsewhere, change that region to match — every dashboard page load makes several database round trips, so a cross-region hop adds up fast.
4. Deploy. Every push to `main` redeploys automatically.

## Setting up a TV / kiosk device

1. On the dashboard, click **+ Add Screen** — this creates a screen and its player URL, shown on the tile as `/screen/{id}`.
2. Open `https://your-app.vercel.app/screen/{id}` in the TV's browser (or a kiosk-mode browser app on a Fire Stick / Raspberry Pi) and make it fullscreen. No login is needed for this URL.
3. Back on the dashboard, tap the screen tile to open its **Media Menu**, then **+ Add Content** to assign files from the library. The player updates automatically.

## Project structure

- `src/app/(dashboard)/` — login-gated dashboard pages (screens grid, library, users).
- `src/app/screen/[id]/` — the unauthenticated player.
- `src/app/login/` and `src/app/signup/` — logging in, and creating an account from a signup link.
- `src/lib/actions/` — all Server Actions (the only place writes happen).
- `src/lib/supabase/` — `client.ts` (anon key, safe in the browser) and `admin.ts` (service_role key, server-only).
- `src/lib/auth/` — session cookie signing/verification, the current user and their role, password hashing.
- `src/lib/activity.ts` — records each change against the user who made it (shown on the Users page).
- `src/lib/realtime/` — Realtime channel-name helpers, live refresh, and the dashboard's live screen status (`useScreenStatuses`).
- `supabase/migrations/` — the SQL schema.

## PDFs

A PDF uploaded to the library becomes a **deck**: the original file is kept
(the row's Download gives it back), and the uploader's browser renders one
JPEG per page, which are added as ordinary media items belonging to that
deck. So a page carries its own duration, order and deletion inside a
playlist exactly like any other file, and a player only ever shows images —
no pdf.js on a set-top box. In the file browser a deck is a row that opens
like a folder: tick the deck to take the whole thing, or tick single pages.

**Replace** on a deck swaps a newer PDF in under it. Page 1 stays page 1 —
the same library item, repointed — so playlists keep working in place; a
shorter PDF drops the pages past its end, and a longer one leaves the extra
pages in the deck to place yourself.

## Not in v1

Screen groups, multi-zone/video-wall layouts and proof-of-play analytics are intentionally out of scope for this MVP but don't require restructuring the schema to add later.
