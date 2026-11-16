# Decisions before the rebuild

These are the choices that shape the new foundation. Each has the context,
the options, and my recommendation. Answer by filling in **Your answer**
(a letter is enough, or "ok" to take the recommendation), or tell me in chat.

The problems they refer to (P1–P14) are described in [INVENTORY.md](INVENTORY.md#3-problems-the-rebuild-should-fix).

Decisions D1–D5 shape everything else, so they matter most. D6–D16 are
smaller, and the recommendations are safe defaults.

---

## D1. How many venues and organizations?

The current app is for one venue. Venue data is written into the code (P8).

- **A. One venue, one organization.** Simplest. Adding a second venue later means touching most tables.
- **B. Several venues, one organization.** Every venue-specific table carries `venue_id`. A venue switcher in the UI once there's a second one.
- **C. Several organizations (SaaS), each with several venues.** Every table carries `organization_id`; permissions and RLS are scoped per organization; signup creates an organization.

**Recommendation: C in the schema, A in the UI.** Adding `organization_id` and `venue_id` columns and scoping the permission checks costs little now and a lot later. Until there is a second customer, the UI simply never shows an organization or venue switcher.

**Your answer:**

---

## D2. Authentication

Today: a custom login (scrypt hashes, a signed cookie, and hand-built signup, reset and email-change flows with their own token tables).

- **A. Supabase Auth.** Email and password, invitations, password reset, email change, session refresh and sign-out everywhere are built in. Users are identified as `auth.uid()` in the database, which makes RLS straightforward (D3). Emails can still go through Resend with our own templates via Supabase's "send email" hook.
- **B. Rebuild the custom login** more cleanly. Full control, but we keep owning the security-sensitive code.

**Recommendation: A.** The one cost is moving existing passwords (INVENTORY §6). If there are only a handful of accounts, a password reset email at switch-over is the simplest answer.

Also: should we add sign-in by magic link or Google/Microsoft? Supabase Auth makes both cheap.

**Your answer:**

---

## D3. Where permissions are enforced

Today all writes and most reads go through server code using the service-role key, which bypasses the database's row-level security (RLS). The checks live in Server Actions. RLS only exists to allow public reads for the player (P11).

- **A. Server code only** (as today). One place to look, but a missed check exposes data, and the client can never read the database directly.
- **B. RLS is the source of truth.** SQL helper functions (`has_permission(org, 'events.edit')`) back every policy. Server code uses the signed-in user's client, so the database refuses what the user may not do even if server code forgets. The service-role key is used only by system jobs.
- **C. Both:** RLS as the backstop, plus checks in server actions for friendly error messages.

**Recommendation: C.** RLS makes a missed check harmless, lets Realtime respect permissions, and is testable with SQL tests. Server actions still check first, so the user gets a clear message instead of a database error.

**Your answer:**

---

## D4. Permission model

Today: roles toggle pages, hide individual screens and groups, and switch on options; files carry `edit_role_ids` arrays; ownership and a super-admin flag apply on top; leads come from a role *named* "Events Management" (P5).

Proposal:
- A fixed **catalogue of permissions** in code, e.g. `screens.view`, `screens.configure`, `screens.reorder`, `media.upload`, `events.view`, `events.edit`, `events.lead`, `users.invite`, `roles.manage`, `audit.view`.
- **Roles** are named sets of permissions, created in the UI as today.
- **Scopes** optionally narrow a role to certain resources (these screens, this venue, this folder).
- Membership in an organization carries roles. "Owner" replaces the super admin.

The main choice is how scopes work:

- **A. Allow-lists:** a role sees only the screens it lists, or "all screens".
- **B. Hide-lists** (as today): a role sees everything except what it hides.

**Recommendation: the proposal with A.** Allow-lists are safer: a new screen isn't visible to a restricted role until someone grants it. Per-file edit limits become a scope ("this folder editable only by role X") instead of arrays on each row.

**Your answer:**

---

## D5. How screens get their content

This is the largest single cleanup (P1, P2, P3). Today a screen's content
exists as a live list, a draft setup, a group setup and timed playlists, and
everything is copied from one into another.

- **A. Port today's model as is** (copy on commit, last commit wins).
- **B. Assignments.** Content lives only in **playlists** (a screen's own "Now playing" is just a playlist that belongs to it). Presentation settings (background, transition, speed, direction, fit) are one **look**. An **assignment** puts a playlist and a look on a screen or a group, optionally for a time window, with a priority (time window > group > screen). The player asks "what's on now?" and gets the highest-priority active assignment. **Draft and published** are two versions of an assignment: the checkmark publishes.

**Recommendation: B.** It removes four tables and the cron job, makes "why is this screen showing X" answerable, and fixes P2.

Two follow-ups that change what you'll see:
1. When a timed window ends, should the screen **go back** to what it showed before? (Today nothing happens; the timed playlist just keeps playing.) Recommendation: yes.
2. When a screen is in a group *and* has its own content, B needs a rule. Recommendation: the most recently published wins (today's behaviour), shown on the tile.

**Your answer:**

---

## D6. Built-in pages (Clock, Lava Lamp, …)

Today they're fake media rows inserted by migrations, and their dials aren't saved (P4).

- **A. Keep them as library items**, but as a proper kind of item (file, deck page, page) instead of fake files. Pages come from a registry in code; each placement in a playlist can save its settings (dials).
- **B. Separate "widgets"** outside the library, added to playlists from their own menu.

**Recommendation: A.** It keeps today's experience (pages sit in the library and playlists like files) without the fake rows.

Also: are all four pages still in use? Lava Lamp and Lava Lamp 3D overlap.

**Your answer:**

---

## D7. Venues as data

Today floors, area polygons, room names, parking sides, the Datenraum's text, and even power outlets and step-free entrances (stored as *events*) live in code (P8).

Proposal: tables for **venues → floors** (with a plan image) **→ spaces** (named, polygon, bookable or not) and **features** (power outlet, accessible entrance, screen location, parking zone; each a point or area on a floor). Events then refer to spaces, the map draws from the tables, and the Checkliste's rooms come from the venue.

For the Datenraum's text there's a separate choice:

- **A. In the database**, translatable, with an editor in the app (built in the Datenraum phase).
- **B. As content files in the repo** (Markdown/JSON per venue), separate from code. Edited by us, deployed with the app.

**Recommendation: the proposal, and A for the text,** seeded from today's content so nothing has to be retyped. If the text rarely changes and only you edit it, B is cheaper and fine.

**Your answer:**

---

## D8. Forms (Checkliste, Übergabeprotokoll, presets)

Today both forms are written in a small text format inside TS files, answers are keyed by label text (P7), and presets by event type are code.

- **A. Form templates as data.** A template is versioned, made of sections and fields with stable IDs; responses are rows per event and field; presets are data per event type; photos and signatures go to private storage. Today's text format becomes the import format, so the existing forms are seeded from the current files. An editor for templates in the app comes later.
- **B. Forms stay in code**, but with stable IDs added to every field.

**Recommendation: A.** Event-management software will grow more forms (catering orders, tech riders, briefings), and venue staff will want to edit them without a deploy.

**Your answer:**

---

## D9. Languages

Today the dashboard is English, the events area German, the Datenraum bilingual from a TS file (P13).

- UI: both German and English throughout, with `next-intl`?
- Default language for staff: German or English?
- Code: English identifiers everywhere (`handover`, not `uebergabeprotokoll`)?

**Recommendation:** yes to both languages via `next-intl`, German as default, English in code. Content that needs both languages (Datenraum text, form labels, event types) is stored with a value per language.

**Your answer:**

---

## D10. Repo layout and tooling

**Recommendation:**
- **pnpm workspace:** `apps/web` (Next.js), `apps/tv` (Android), `supabase/` (migrations, seed, SQL tests) at the root, `packages/` only once something is shared. No Turborepo until builds are slow.
- **Migrations:** Supabase CLI, applied to preview/production from CI, never by hand. Types generated from the schema on every migration.
- **Tests:** Vitest (logic), Playwright (key flows: login, publish to a screen, create an event), pgTAP (RLS policies).
- **CI (GitHub Actions):** lint, typecheck, tests, migration check against a local Supabase; APK built and signed on a tag and attached to a GitHub Release (P14).
- **Environments:** Supabase branching or a separate staging project for Vercel previews.

Anything to add or remove?

**Your answer:**

---

## D11. Data loading and live updates

Today pages are server-rendered and any change in 12 tables refreshes the whole page everywhere (P12).

- **A. Keep server rendering + refresh**, but subscribe only to what a page shows.
- **B. Server rendering for first load, TanStack Query on the client** for live views (screens dashboard, events, player), with Realtime invalidating only the affected queries.

**Recommendation: B for live views, plain server rendering for the rest** (users, settings).

**Your answer:**

---

## D12. Look and UI components

Today: Tailwind 4, 147 CSS variables, custom Sheet/Menu/Popup with a lot of hand-made motion, one Radix dialog.

- Is the visual design staying as it is? (If yes, the tokens and motion are ported; if no, now is the time to say.)
- **Recommendation:** Tailwind 4 with the ported tokens; Radix primitives underneath our own components (accessibility and focus handling for free); the animation helpers ported. A small component playground (dev-only route) for the components and pages.

**Your answer:**

---

## D13. Screens and players

- **Screen identity.** Today a screen's ID *is* its number, and numbers are reused so TVs can be set up by number. Recommendation: a UUID key plus a per-venue display number, and the `/screen/{n}` address kept working.
- **Player authentication.** Today the player reads public tables with no login (P11). Recommendation: a screen has a device token, issued when the TV is set up (the number entry on the stick, or a pairing code), and the player reads only its own assignments.
- **Fire TV app.** Recommendation: keep the native bridge contract (`?app=2`) identical so existing sticks keep working after switch-over with no reinstall, provided the domain stays the same.

**Your answer:**

---

## D14. Storage

Today one public bucket holds everything, handover photos included (P11).

**Recommendation:** a public bucket for media shown on screens and the Datenraum (they're public anyway), a private bucket for event files (handover photos, signatures, attachments) served through short-lived signed URLs. Paths prefixed by organization and venue.

**Your answer:**

---

## D15. What to drop

Things I'd not carry over unless you say otherwise:
- `/forms`, `/guest`, `/Datenraum` redirects (unless printed links or QR codes point at them)
- The dev tuner routes (become one playground route)
- One of the two Lava Lamps (D6)
- Upload links? (Keep only if people outside the team actually use them.)

Are there features nobody uses that can go? And is there anything missing you already know you want in the first version (for example: customer records separate from events, invoicing, staff scheduling, a public event calendar)?

**Your answer:**

---

## D16. Order of the rebuild

Recommendation (each step one or more sessions and pull requests, reviewed before the next):

1. **Foundation:** repo, tooling, CI, Supabase project, auth, organizations, venues, memberships, roles and permissions, app shell, i18n, design tokens.
2. **Media library:** folders, assets, uploads, decks, upload links.
3. **Screens:** playlists, looks, assignments, groups, timed windows, the dashboard.
4. **Player and Fire TV app:** player, device tokens, status, controls, pages.
5. **Venues:** floors, spaces, features, the map.
6. **Events:** events, leads, calendar, map annotations.
7. **Forms:** templates, Checkliste, Übergabeprotokoll, PDF, email.
8. **Datenraum.**
9. **Switch-over:** data migration script, storage copy, password reset, DNS, archive the old repo.

Steps 2–4 and 5–8 are independent of each other, so the order of those two blocks can be swapped if events matter more right now.

**Your answer:**
