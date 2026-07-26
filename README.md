# Signage

A free (at base scale) web-based digital signage system for a single event venue. TVs load a unique `/screen/{id}` URL in kiosk mode; a password-gated dashboard manages screens, a media library, and per-screen playlists, with changes pushed to screens in near-real-time.

**Stack:** Next.js (App Router, TypeScript) on Vercel · Supabase (Postgres, Realtime, Storage) · a single shared-password session cookie for the dashboard.

## How it fits together

- **Dashboard** (`/dashboard`, `/library`) — password-gated. Register screens, manage the media library, assign content to screens.
- **Player** (`/screen/{id}`) — no login, meant to be opened fullscreen on a TV/Fire Stick/kiosk browser. Subscribes to Supabase Realtime so playlist changes appear within about a second, and caches its last-known content so it keeps showing something if the network drops.
- **Supabase** holds all persistent data (`screens`, `folders`, `media_items`, `playlist_items`) and the `media` storage bucket. Row-Level Security allows public reads (needed by the unauthenticated player) but denies all writes — every mutation goes through a Server Action using the `service_role` key, which checks the dashboard's session cookie itself first.

## One-time Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → Run. This creates the tables, RLS policies, and the two RPCs used for reordering/assigning playlist items.
3. **Storage** → New bucket → name it exactly `media` → toggle **Public bucket** on.
4. **Project Settings → API** → copy the Project URL, the `anon`/publishable key, and the `service_role`/secret key.

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
ADMIN_PASSWORD=                 # whatever password gates the dashboard
SESSION_SECRET=                 # random string, e.g. `openssl rand -base64 32`
```

```bash
npm run dev
```

Open `http://localhost:3000` — it redirects to `/login`. After logging in you land on `/dashboard`.

## Deploying (free)

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new) (free tier).
3. In the Vercel project's **Settings → Environment Variables**, add the same five variables as above (for Production and Preview).
4. Deploy. Every push to `main` redeploys automatically.

## Setting up a TV / kiosk device

1. On the dashboard, click **+ Add Screen** — this creates a screen and its player URL, shown on the tile as `/screen/{id}`.
2. Open `https://your-app.vercel.app/screen/{id}` in the TV's browser (or a kiosk-mode browser app on a Fire Stick / Raspberry Pi) and make it fullscreen. No login is needed for this URL.
3. Back on the dashboard, tap the screen tile to open its **Media Menu**, then **+ Add Content** to assign files from the library. The player updates automatically.

## Project structure

- `src/app/(dashboard)/` — password-gated dashboard pages (screens grid, library).
- `src/app/screen/[id]/` — the unauthenticated player.
- `src/app/login/` — the password gate itself.
- `src/lib/actions/` — all Server Actions (the only place writes happen).
- `src/lib/supabase/` — `client.ts` (anon key, safe in the browser) and `admin.ts` (service_role key, server-only).
- `src/lib/auth/` — session cookie signing/verification and password check.
- `src/lib/realtime/` — Realtime channel-name helpers and the dashboard's live-preview presence hook.
- `supabase/migrations/` — the SQL schema.

## Not in v1

Scheduling, screen groups, multi-zone/video-wall layouts, proof-of-play analytics, and multi-page PDF flipping are intentionally out of scope for this MVP but don't require restructuring the schema to add later.
