# Rebuild, Phase 0

The app has grown from screen signage into event management. These documents
prepare a rebuild on a clean foundation in a new repository.

| File | What it is |
|---|---|
| [INVENTORY.md](INVENTORY.md) | Every feature, table and concept in this repo, where it lives, and whether it is rebuilt, ported, copied or dropped. Section 3 lists the overlaps and shortcuts the rebuild should fix. |
| [DECISIONS.md](DECISIONS.md) | The choices that shape the new foundation, each with my recommendation and a blank for your answer. |

## How to use these

1. Read the problems in INVENTORY §3 so the decisions make sense.
2. Answer D1–D16 in DECISIONS.md, either in the file or in chat.
3. From the answers I write `ARCHITECTURE.md` and `CLAUDE.md`. Together with these two files they become the first commit of the new repo.
4. Phase 1 (the foundation) starts there, following the order in D16.

## Before Phase 1

- Tag this repo's current state: `git tag legacy-final 82994f5 && git push origin legacy-final`.
- Create the new GitHub repository and give Claude access to it.
- Create the Vercel and Supabase projects (Supabase in Frankfurt, to match Vercel's `fra1`).
