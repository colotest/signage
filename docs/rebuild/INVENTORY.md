# Inventory of the current app

A snapshot of what's in this repo, written as input for the rebuild. Every
feature, data table and concept is listed with where it lives now and a
verdict for the new repo.

**Snapshot:** commit `82994f5` (2026-11-15). Tag it `legacy-final` before
work starts, so the paths below keep pointing at this exact code.

**Verdicts**

| Verdict | Meaning |
|---|---|
| **Rebuild** | Re-implement from the behaviour described here, against the new architecture. Read the old code only to understand behaviour. |
| **Port** | Move the logic over largely intact, then fit it to the new structure (names, types, data access) and review it. |
| **Copy** | Take the file or asset as is. |
| **Drop** | Don't carry it over. |
| **Decide** | Depends on an answer in [DECISIONS.md](DECISIONS.md). |

---

## 1. At a glance

- **Size:** about 43k lines of TypeScript/CSS in `src/`, 1.4k lines of Kotlin in `android/`, 48 SQL migrations (1.6k lines), 23 tables.
- **Stack:** Next.js 16 (App Router, Server Actions), React 19, Tailwind 4, Supabase (Postgres, Realtime, Storage, pg_cron), Resend for email, Vercel (`fra1`).
- **Tests:** none. **CI:** none. **Generated DB types:** none. `src/types/database.types.ts` is hand-written and says so.
- **Migrations** are pasted into the SQL Editor by hand. Number 0015 is missing, and the app has code paths that tolerate migrations not having been run (`src/app/(dashboard)/dashboard/page.tsx:95`, `src/lib/venueScreens.ts:54`, `src/lib/realtime/useScreenStatuses.ts:53`, `src/app/screen/[id]/useScheduledSwitch.ts`).
- **Who it's for:** one venue (the Colosseum in Berlin). The venue's floors, areas, rooms, parking zones, checklists and marketing text are written into the source code.

---

## 2. Features

### 2.1 Accounts, roles and access

| Feature | What it does | Where now | Verdict |
|---|---|---|---|
| Login / logout | Email and password, 7-day signed cookie (HS256 JWT via `jose`), signed out everywhere when the password changes | `src/lib/auth/session.ts`, `password.ts` (scrypt), `src/lib/actions/auth.ts`, `src/app/login` | **Decide** (D2): Supabase Auth or a rebuilt custom login |
| Signup links | Single-use, 7 days, can carry nickname, roles and email, can be emailed | `actions/users.ts`, `auth/invites.ts`, `src/app/signup/[token]`, `signup_invites` | **Rebuild** (as invitations) |
| Password reset, email change | Token links by email, notifications when either changes | `actions/account.ts`, `actions/auth.ts`, `password_resets`, `email_changes`, `src/app/reset`, `src/app/confirm-email`, `src/app/forgot` | **Rebuild** (most of it comes free with Supabase Auth) |
| Super admin | Can do everything, holds every role | `users.is_super_admin` | **Rebuild** (as an owner role of the organization) |
| Roles | Named, coloured roles. Each switches pages on (Screens, Media, Events, Users), hides individual screens and groups, and turns on the wrench menus, reordering and six Users-page permissions. Roles add up | `src/lib/auth/access.ts`, `roles.access` (jsonb), `user_roles`, `RoleDialog.tsx` | **Rebuild** (D4) |
| Per-file edit limits | The owner of a file, PDF or folder can limit editing to roles they hold | `edit_role_ids uuid[]` on `folders`, `media_items`, `decks`; `auth/owned.ts`, `actions/restrictions.ts` | **Rebuild** (D4) |
| Event leads | Anyone in the role literally named "Events Management" can lead an event | `EVENTS_MANAGEMENT_ROLE` in `src/lib/events.ts` | **Rebuild** as a permission, not a role name |
| Activity log | Every change recorded against its user, coalesced if repeated within a minute; viewable on the Users page | `src/lib/activity.ts`, `activity_log`, `log_activity()` | **Rebuild** as a structured audit log |
| Users page | List, nicknames, delete, assign roles, signups, view changes | `src/app/(dashboard)/users`, `actions/users.ts`, `actions/roles.ts` | **Rebuild** |

### 2.2 Media library

| Feature | What it does | Where now | Verdict |
|---|---|---|---|
| Folders | Nested, with creator, renamable, movable | `folders`, `actions/folders.ts`, `FileTree.tsx` (1.7k lines) | **Rebuild** |
| Upload | Browser uploads straight to Storage through signed upload URLs; images resized/inspected in the browser first | `useMediaUpload.ts`, `src/lib/media/*`, `actions/media.ts` | **Port** `src/lib/media/prepareImage.ts`, `inspectFile.ts`; **Rebuild** the rest |
| Replace file | Swap a newer file in under the same library item; playlists keep working | `lib/media/replaceFile.ts`, `lib/uploads/replace.ts` | **Port** the logic |
| PDF decks | A PDF becomes a deck: the uploader's browser renders a JPEG per page, each page a normal media item, so players never run pdf.js. Replacing a deck keeps page *n* as the same item | `decks`, `lib/media/renderPdfPages.ts`, `lib/uploads/insertDeck.ts`, `actions/decks.ts` | **Port** the rendering; **Rebuild** the data model (D5) |
| Upload links | A folder can have a public `/upload/<token>` link that lets anyone add files to that folder only | `folder_upload_links`, `actions/uploadLinks.ts` (283 lines), `src/app/upload/[token]` | **Rebuild**. Today it duplicates the entire upload pipeline (8 parallel actions) and stores its token in plain text where every other token is hashed |
| Library playlists | Named, reusable, ordered lists with per-item duration | `playlists`, `playlist_entries`, `PlaylistSection.tsx` | **Rebuild** (D5) |
| Search | Filter in the file tree | `SearchField.tsx` | **Rebuild** |
| Thumbnails | Resized through `next/image` from the public bucket, cached 31 days | `MediaThumb.tsx`, `next.config.ts` | **Port** |

### 2.3 Screens, groups and playback

| Feature | What it does | Where now | Verdict |
|---|---|---|---|
| Screens | Numbered (lowest free number is reused, because a TV is set up by number), named, rotation, fit mode, position on the dashboard | `screens`, `next_free_screen_id()`, `actions/screens.ts`, `ScreenTile.tsx` | **Rebuild** (D13 on numbering) |
| Playback Menu and setups | Each screen has a draft *setup* (items, background, transition, speed, slide direction); the blue checkmark commits it to the TV | `setups`, `setup_items`, `commit_setup()`, `PlaybackMenu.tsx` (1.4k lines), `actions/setups.ts` | **Rebuild** (D5) |
| Groups | A set of screens with its own setup and a grid of live member previews; whichever was committed last wins on each screen | `screen_groups`, `screen_group_members`, `GroupTile.tsx`, `actions/groups.ts` | **Rebuild** (D5) |
| Timed playback | A library playlist replaces a screen's content at a given time and reserves a window during which nothing else can be timed onto that screen | `scheduled_playbacks`, `run_due_scheduled_playbacks()`, `actions/schedules.ts`, `ScheduleDialog.tsx`, `CalendarSection.tsx` | **Rebuild** (D5). See problem P3 |
| Live preview and online status | Each player reports what it shows every 20 s; a tile shows that live, Offline after 75 s silence | `screen_status`, `screen_status_live`, `report_screen_*()` RPCs, `useStatusReport.ts`, `useScreenStatuses.ts` | **Rebuild**; the protocol is sound, so keep its shape |
| Remote controls and page tuning | Pause/skip and live dials for a page, sent to a TV over a Realtime broadcast channel | `useScreenControl.ts`, `realtime/channels.ts`, `PageTuningMenu.tsx`, `screenPages/dials.ts` | **Rebuild** the channel; **Port** the dial definitions. Tuning isn't saved anywhere today |
| Pages (built-in slides) | Clock, Lava Lamp, Lava Lamp 3D, Glitter: code-rendered slides that sit in playlists like files | `src/components/screenPages/*` (3.6k lines); rows inserted into `media_items` by migrations with `storage_path = 'page:<key>'` | **Port** the components (copy almost verbatim); **Rebuild** how they're registered (D6) |
| Page workbenches | `/screen/lava-tuner`, `/screen/glitter-tuner`: dev-only pages with every dial live | `src/app/screen/*-tuner` | **Port** into a dev-only playground route |

### 2.4 Player and Fire TV app

| Feature | What it does | Where now | Verdict |
|---|---|---|---|
| Player | `/screen/{n}`, no login. Realtime updates, transitions, caching of last-known content, server clock sync, preloading ahead of a timed switch | `src/app/screen/[id]/Player.tsx` (1.2k lines), `useScheduledSwitch.ts`, `lib/cache/playerCache.ts` | **Rebuild** the data side; **Port** the transition/render code |
| Offline cache | Service worker for `/screen/*` only, with a Range-request fix for video | `public/sw.js` | **Port** |
| Native bridge | The page hands images and videos to the Android app, which draws them natively under a transparent WebView. Versioned (`?app=2`) | `src/app/screen/[id]/nativeMedia.ts`, `android/.../Stage.kt` | **Port**, keeping the bridge contract identical (D13) |
| Fire TV app | WebView shell, native media stage, on-device file cache, boot receiver, screen-number picker | `android/` | **Copy** into `apps/tv`; change only the base URL handling |
| APK distribution | Built by `scripts/build-tv-apk.sh`, committed as `public/tv.apk` | `public/tv.apk`, `scripts/` | **Rebuild**: build in CI, publish as a release asset, keep the download URL |

### 2.5 Events

| Feature | What it does | Where now | Verdict |
|---|---|---|---|
| Events list and calendar | Create, archive, delete; title, customer, contact, type, pax, dates with or without a time | `events`, `EventsView.tsx`, `EventsList.tsx`, `EventCalendar.tsx`, `actions/events.ts` | **Rebuild** |
| Leads | One or more people in charge | `events.lead_id` *and* `events.lead_ids` (both still there) | **Rebuild** as a join table |
| Event types and presets | Six fixed types; a preset ticks Checkliste options by type | `lib/eventTypes.ts`, `lib/checklistPresets.ts`, check constraint in 0037 | **Rebuild** as data (D8) |
| Venue map | Per-floor map, pins with notes, highlighted areas (polygons), the venue's own standing areas, the screens with what they'll show at a time scrubbed to | `VenueMap.tsx` (1.5k lines), `PinMenus.tsx`, `events.map_pins`, `events.map_areas` (jsonb), `lib/venueAreas.ts` (polygons in code), `lib/venueFloors.ts`, `public/venues/*` | **Rebuild** the UI and data (D7); **Copy** the plan images; **Port** `areaContains` and the coordinate data as seed data |
| Checkliste | One long questionnaire per event (rooms, tech, catering, parking, …), written in a small text format inside a TS file; answers stored by label text; emailed to recipients | `lib/checkliste.ts` (570 lines), `Checklist.tsx`, `ChecklistReview.tsx`, `ShareChecklist.tsx`, `events.checklist`, `events.checklist_emails` | **Rebuild** as form templates + responses (D8); **Port** the text format's parser as a seed importer |
| Parking closures | Per-side towing-zone dates stored inside the Checkliste answers | `ParkingDates.tsx`, `PARKING_SIDES` in `checkliste.ts` | **Rebuild** as part of the form model |
| Übergabeprotokoll (handover) | Venue walk-through at handover and return: pass/fail per item, notes, photos, two signatures; PDF generated and emailed | `lib/uebergabeprotokoll.ts`, `HandoverProtocol.tsx`, `actions/handover.ts`, `lib/handoverPdf.ts`, `events.handover` | **Rebuild** on the form model (D8); **Port** `handoverPdf.ts` and the signature pad |
| Screens schedule on events | The events calendar shows screen timers | `ScheduleCalendar.tsx`, `lib/venueScreens.ts` | **Rebuild** once D5 is settled |

### 2.6 Datenraum (public venue page)

| Feature | What it does | Where now | Verdict |
|---|---|---|---|
| Venue presentation | Public, German/English, dark/light; text sections, each bringing up pictures, floor plans or a 360° tour (nexpics embed); a corner map lights up the space being read about | `src/app/datenraum`, `DatenraumView.tsx` (1.3k lines), `lib/datenraumContent.ts` (700 lines of bilingual text in code) | **Rebuild** the page; **Port** the content as seed data (D7) |
| Pictures | Found by file name in the library folder `Dokumentation/Aufnahmen/Location` | `lib/datenraumMedia.ts` | **Rebuild** (explicit links instead of magic paths) |
| Picture collection | Library images tagged (Catering, Bar, …) with event and date, editable in place | `datenraum_gallery`, `DatenraumGallery.tsx`, `actions/datenraum.ts` | **Rebuild** |
| Power and accessibility pins | Read from the map notes of two *events* titled "Stromanschlüsse" and "Barrierefreie Zugänge" | `POWER_EVENT_TITLE`, `ACCESS_EVENT_TITLE` in `lib/datenraumGallery.ts` | **Rebuild** as venue features (D7) |
| Language and theme memory | Cookies read before render | `lib/datenraumPrefs.ts`, `DatenraumPrefs.tsx` | **Port** the idea; fold into app-wide i18n (D9) |

### 2.7 Email

| Feature | Where now | Verdict |
|---|---|---|
| Sending via Resend, dev fallback that prints to the terminal | `lib/email/send.ts` | **Port** |
| Branded templates (reset, confirm, notices, signup, Checkliste, handover) | `lib/email/templates.ts`, `public/email/*` | **Port**; consider React Email |
| Recipient picking | `lib/eventRecipients.ts` | **Rebuild** |

### 2.8 Platform and UI

| Item | Where now | Verdict |
|---|---|---|
| Design tokens (147 CSS variables, light/dark) | `src/app/globals.css` (1.6k lines) | **Port** the tokens; **Rebuild** the rest of the CSS around components |
| UI primitives (Sheet, Menu, Popup, Switch, Button) | `src/components/ui/*` | **Rebuild** on Radix primitives (D12); **Port** the motion |
| Animation helpers (FLIP lists, popup launch, liquid, motion freeze) | `src/lib/animation/*` | **Port** |
| Shared widgets (DateTimePicker, MonthCalendar, InlineRename, QrCode, ScrollWindow, EdgeBand/EdgeTuner) | `src/components/*` | **Port** selectively; merge the three calendar/date pickers into one (P10) |
| Fonts, logos, icons, favicon, manifest | `src/fonts`, `src/components/icons`, `src/app/*.png`, `public/icon-*` | **Copy** |
| Venue plan images | `public/venues/*` | **Copy** (to Storage, D7) |
| Live refresh | Any change to any of 12 tables re-renders every open dashboard (`router.refresh()`) | `src/lib/realtime/useLiveRefresh.ts` | **Rebuild** (D11) |
| Power saving | `lib/powerSaving.ts`, `hooks/usePowerSaving.ts` | **Port** |
| Redirects `/forms` → `/events`, `/guest` and `/Datenraum` → `/datenraum` | `next.config.ts` | **Drop** unless old links are printed somewhere |

---

## 3. Problems the rebuild should fix

Each of these is a place where two or more ideas overlap, or a shortcut
that won't survive growth. The fix column is my proposal; the decisions it
depends on are in [DECISIONS.md](DECISIONS.md).

### P1. "What a screen shows" exists four times
- `playlist_items`: the screen's live list, which the player reads.
- `setups` + `setup_items`: drafts per screen and per group. Committing *copies* into `playlist_items` and copies the settings onto `screens`.
- `playlists` + `playlist_entries`: reusable library lists.
- `scheduled_playbacks`: at a time, copies a playlist into `playlist_items` *and* overwrites the screen's own setup.

Settings are duplicated too: `background`, `transition`, `transition_speed` and `slide_direction` live on both `screens` and `setups`; `fit_mode` lives on `screens`, `screen_groups`, and an unused column on `playlist_items`.
Because everything is copied, the rules are "whichever was committed last wins", and nothing knows *why* a screen shows what it shows.
**Fix (D5):** one playlist concept, one set of presentation settings, and *assignments* (screen or group, optional time window, priority) resolved when the player asks what to play. Draft and published become two versions of an assignment, not two copies of the data.

### P2. A timed playlist destroys the screen's saved setup
`run_due_scheduled_playbacks()` (0030) deletes the screen's own `setup_items` and replaces them with the playlist. When the window ends nothing reverts: the window only blocks other timers (`actions/schedules.ts:27`).
**Fix (D5):** a time window is an assignment that ends; when it ends, the screen falls back to what it showed before.

### P3. Timed switches fire from three places
pg_cron every 5 seconds, the dashboard when a countdown reaches zero (`ScreenGrid.tsx:237`), and the player itself, which preloads and switches on its own clock (`useScheduledSwitch.ts`).
**Fix (D5):** the player resolves "what's on now" from its assignments and the server clock. No cron job needed for switching.

### P4. Pages are fake media files
Clock, Lava Lamp and the rest are `media_items` rows with `storage_path = 'page:clock'`, inserted by migrations into a "Pages" folder. Their dials are never saved.
**Fix (D6):** a content item has a kind (file, deck page, page). Pages come from a code registry and their settings are saved where they're placed.

### P5. Three authorization mechanisms, and roles found by name
Page toggles and hide-lists in `roles.access` jsonb; `edit_role_ids` arrays on three tables (cleaned up by hand in `delete_role()`); ownership via `uploaded_by` / `created_by`; a super-admin flag; a leftover `users.role` column (0023, still constrained, no longer read); and leads found through a role *named* "Events Management".
**Fix (D3, D4):** one catalogue of permissions, granted to roles, optionally scoped to resources, all in join tables; checked in one place.

### P6. Events are one wide row with six JSON blobs
`map_pins`, `map_areas`, `checklist`, `checklist_emails`, `handover` (with signature PNGs inline as data URLs), plus `lead_id` and `lead_ids` side by side. None of it can be queried, constrained or permission-checked separately.
**Fix (D7, D8):** leads, map annotations, form responses, photos and signatures each get their own table or storage object.

### P7. Form answers are keyed by label text
Checkliste and Übergabeprotokoll keys are built from section title + label, so renaming a label silently orphans the answers (`lib/checkliste.ts` header, `lib/uebergabeprotokoll.ts` header). Presets find fields by label and throw if one was renamed.
**Fix (D8):** stable field IDs, versioned templates.

### P8. The venue is code
Floors, area polygons (227 lines of coordinates), room names ("Saal 1"–"Saal 10"), parking sides, handover sections and Datenraum text all live in `src/lib`. Venue facts are stored as *events* ("Stromanschlüsse", "Barrierefreie Zugänge"). Datenraum pictures are found by file name in a hard-coded folder path.
**Fix (D7):** venues, floors, spaces and features as data. This is the precondition for being event-management software rather than one venue's tool.

### P9. Migrations and types drift
Hand-run migrations, a numbering gap, code that tolerates missing tables, hand-written types, and backfills that parse `activity_log` summary strings (0027, 0028).
**Fix (D10):** Supabase CLI migrations, applied by CI; types generated from the schema; the app assumes the schema is current.

### P10. Duplicated building blocks
- Uploads: the upload-link flow re-implements the media/deck actions (`actions/uploadLinks.ts`).
- Calendars: `MonthCalendar`, `DateTimePicker`, and the date-range picker inside `EventCalendar.tsx`, plus two schedule calendars (`CalendarSection.tsx`, `ScheduleCalendar.tsx`).
- Reordering: one `reorder_*` SQL function per list (screens, dashboard, playlists, entries, setup items, playlist items).

**Fix:** one upload service with an "acting as" context (user or link); one date-picker family; one generic ordering approach (fractional positions or a single reorder helper).

### P11. Everything readable by anyone holding the anon key
RLS gives public read on screens, folders, media, decks, playlists, setups, schedules, groups and the gallery, because the player has no login. The anon key ships in the browser bundle, so all of that metadata (file names, folder names, uploader IDs) is world-readable. Users and events are locked down. Handover photos sit in the same public `media` bucket (`actions/handover.ts:29`): their URLs are random but permanent and need no login.
**Fix (D3, D13):** the player authenticates as a device and reads only its own assignments; private files (handover photos, signatures) go in a private bucket behind signed URLs.

### P12. Live refresh re-renders everything
Any row change in 12 tables triggers `router.refresh()` on every open dashboard (`useLiveRefresh.ts`). Fine for one venue and a few editors; it gets worse with every table and user added.
**Fix (D11):** subscribe to what a view shows and refresh only that.

### P13. Mixed languages
The dashboard UI is English, the events domain German (identifiers like `uebergabeprotokoll`, `veranstalter`, event type keys `messe`, `firmenfeier`), the Datenraum bilingual from a TS file, and server error messages mix both.
**Fix (D9):** English identifiers in code; one i18n system for the UI; translatable content fields.

### P14. Build output in the repo
`public/tv.apk` is committed; the signing key lives only on whoever's machine built it last (`android/release.jks`, git-ignored).
**Fix (D10):** CI builds and signs the APK from a repository secret and publishes it as a release asset.

---

## 4. Current schema, table by table

| Table | Purpose | In the new model |
|---|---|---|
| `users` | Accounts, scrypt hashes, nickname, super-admin flag, legacy `role` | `auth.users` + `profiles` (D2) |
| `signup_invites`, `password_resets`, `email_changes` | Token flows | Supabase Auth (D2) or one `auth_tokens` table |
| `roles`, `user_roles` | Roles with jsonb access | `roles`, `role_permissions`, `role_scopes`, `memberships` (D4) |
| `activity_log` | Text summaries per change | `audit_log` (actor, action, entity, diff) |
| `folders`, `folder_upload_links` | Library tree, public upload links | `folders`, `upload_links` (hashed token) |
| `media_items`, `decks` | Files, deck pages, fake page rows | `assets` (file / deck / page kinds) (D6) |
| `playlists`, `playlist_entries` | Library playlists | `playlists`, `playlist_items` |
| `playlist_items` | A screen's live list | Gone: derived from assignments (D5) |
| `setups`, `setup_items` | Drafts per screen/group | Gone: draft/published assignment versions (D5) |
| `scheduled_playbacks` | Timed one-shot replacement | Assignments with a time window (D5) |
| `screens`, `screen_groups`, `screen_group_members` | Screens and groups | `screens` (UUID key + display number), `screen_groups`, members |
| `screen_status` (+ view, 3 RPCs) | Player heartbeat | Keep shape; authenticate as device |
| `events` | Everything about an event | `events`, `event_leads`, `event_annotations`, `form_responses`, … (D7, D8) |
| `datenraum_gallery` | Tagged public pictures | `venue_gallery` (D7) |

Database functions to drop with the tables they serve: `reorder_*` (6), `assign_media_to_screen`, `add_media_to_playlist`, `commit_setup`, `run_due_scheduled_playbacks` (and its pg_cron job), `create_screen_setup` / `create_group_setup` triggers, `next_free_screen_id`, `delete_role`, `log_activity`, `redeem_*`, `confirm_email_change`.

---

## 5. Port and copy list

Files worth carrying over, with care. Everything not listed here or in
section 2 as Port/Copy is rebuilt.

**Copy as is**
- `src/fonts/*`, `src/components/icons/*`, `src/app/apple-icon.png`, `src/app/favicon.ico`, `public/icon-*.png`, `public/email/*`
- `public/venues/*` (into Storage once venues are data)
- `android/` (into `apps/tv/`)

**Port (logic intact, re-housed and reviewed)**
- `src/components/screenPages/*`: Clock, Lava Lamp, Lava Lamp 3D, Glitter, `dials.ts`, `webgl.ts`, `clockArt.ts`
- `src/lib/animation/*`
- `src/lib/media/prepareImage.ts`, `inspectFile.ts`, `renderPdfPages.ts`, `replaceFile.ts`
- `src/lib/handoverPdf.ts`
- `src/lib/email/send.ts`, `templates.ts`
- `src/app/screen/[id]/nativeMedia.ts` and the render/transition parts of `Player.tsx`
- `public/sw.js`
- `src/lib/eventAreas.ts` (`areaContains`), `src/lib/edgeTuning.ts`, `src/lib/utils/format.ts`
- The text-format parsers in `lib/checkliste.ts` and `lib/uebergabeprotokoll.ts`, as seed importers
- Design tokens from `src/app/globals.css`

**Content to seed as data** (not code)
- `lib/datenraumContent.ts`, `lib/venueAreas.ts`, `lib/venueFloors.ts`, `lib/eventTypes.ts`, `lib/checklistPresets.ts`, the Checkliste and Übergabeprotokoll texts

---

## 6. Moving the data across (Phase 3 notes)

- **Screen numbers must survive.** Every Fire TV stick is set to a number (`/screen/{n}`). Keep the number as a display ID and keep the URL working.
- **Passwords.** Hashes are Node scrypt (`scrypt$salt$key`). If we move to Supabase Auth (D2), the options are a password reset for everyone at switch-over, or checking the old hash once at first login and then setting the password in Supabase Auth. Whether Supabase Auth can import this hash format needs checking in Phase 1.
- **Storage.** Copy the `media` bucket object by object; storage paths change only if we restructure buckets (P11).
- **Event JSON.** `map_pins`, `map_areas`, `checklist`, `handover` need mapping into the new tables; Checkliste answers keyed by label need mapping to the new stable field IDs.
- **Setups and live lists.** Each screen's and group's committed setup becomes its published assignment; pending timers become timed assignments.
- **Activity log.** Copy as legacy rows, or archive as a file. It can't be mapped into structured entries reliably.
