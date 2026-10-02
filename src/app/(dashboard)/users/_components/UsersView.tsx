"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { createSignupLink, deleteUser, getUserActivity, makeAdmin } from "@/lib/actions/users";
import { removeWithAnimation } from "@/lib/animation/listMotion";
import { ROLE_LABELS, ROLE_RANK } from "@/lib/auth/roles";
import { useViewer } from "@/lib/auth/ViewerContext";
import { cn } from "@/lib/utils/cn";
import type { ActivityEntry, User } from "@/types/domain";
import { ThreeDotIcon, type SortDir } from "../../library/_components/FileTree";

// recent: the latest few changes (the page fetches 5 — fewer means that's
// all of them). latestChangeTimes: when each of the last day and a half's
// changes happened, for counting today's.
export type UserWithActivity = User & { recent: ActivityEntry[]; latestChangeTimes: string[] };

const RECENT_COUNT = 5;

type UserSortKey = "activity" | "name" | "role" | "date";

function userSortValue(user: UserWithActivity, key: UserSortKey): string | number {
  switch (key) {
    case "activity":
      // Never-active users sort as the oldest.
      return user.recent[0] ? new Date(user.recent[0].created_at).getTime() : 0;
    case "name":
      return user.email.toLowerCase();
    case "role":
      return ROLE_RANK[user.role];
    case "date":
      return new Date(user.created_at).getTime();
  }
}

// Midnight, in the viewer's own timezone — which the server doesn't know,
// so it's null there and during hydration, and the counters fill in right
// after. Recomputed per read; it only changes when the day does.
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}
const noSubscription = () => () => {};

function useStartOfToday(): number | null {
  return useSyncExternalStore(noSubscription, startOfToday, () => null);
}

function countSince(times: string[], since: number) {
  return times.filter((iso) => new Date(iso).getTime() >= since).length;
}

function todayLabel(count: number) {
  return `${count} change${count === 1 ? "" : "s"} today`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  const sameYear = date.getFullYear() === today.getFullYear();
  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day}, ${time}`;
}

// Laid out like the Library's Playlists list (see PlaylistSection): the
// same heading row with its "⋯" menu, and one card per user that opens to
// show their latest changes, the way a playlist opens to show its files.
export function UsersView({ users }: { users: UserWithActivity[] }) {
  const viewer = useViewer();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Whoever's been at it most recently first.
  const [sortKey, setSortKey] = useState<UserSortKey>("activity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showingAllFor, setShowingAllFor] = useState<UserWithActivity | null>(null);

  function toggleSort(key: UserSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Highest role first, and most recent activity first, are the useful
      // way round for those two.
      setSortDir(key === "role" || key === "activity" ? "desc" : "asc");
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = [...users].sort((a, b) => {
    const av = userSortValue(a, sortKey);
    const bv = userSortValue(b, sortKey);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Same overlap-and-fade arrangement as PlaylistSection — see there
          for what each of these offsets is paying for. */}
      <div className="relative z-10 flex items-center justify-between">
        <h1 className="text-[28px] font-semibold tracking-tight">Users</h1>
        <UsersMenuButton sortKey={sortKey} sortDir={sortDir} onToggleSort={toggleSort} />
      </div>

      <div className="relative -mt-10 -mb-5 mx-[-10px] min-h-0 flex-1">
        <div className="scroll-fade-y [--fade-top:24px] no-scrollbar safari-toolbar-inset absolute inset-0 overflow-y-auto overscroll-contain pt-[47px]">
          <ul className="flex flex-col gap-3">
            {sorted.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === viewer.id}
                canDelete={user.id !== viewer.id && ROLE_RANK[user.role] < ROLE_RANK[viewer.role]}
                canMakeAdmin={user.role === "default"}
                isExpanded={expanded.has(user.id)}
                onToggleExpanded={() => toggleExpanded(user.id)}
                onShowAll={() => setShowingAllFor(user)}
              />
            ))}
          </ul>
        </div>
        <ProgressiveBlurEdge side="top" extent={48} />
        <ProgressiveBlurEdge side="bottom" />
      </div>

      <UserActivityOverlay user={showingAllFor} onClose={() => setShowingAllFor(null)} />
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  canDelete,
  canMakeAdmin,
  isExpanded,
  onToggleExpanded,
  onShowAll,
}: {
  user: UserWithActivity;
  isSelf: boolean;
  canDelete: boolean;
  canMakeAdmin: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onShowAll: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const rowRef = useRef<HTMLLIElement | null>(null);
  const today = useStartOfToday();

  // Mounted while open (and while sliding shut), same as a playlist card.
  const [contentMounted, setContentMounted] = useState(isExpanded);
  if (isExpanded && !contentMounted) setContentMounted(true);

  function handleCardClick(e: React.MouseEvent) {
    if ((e.target as Element).closest("button, input, a, [data-no-toggle]")) return;
    onToggleExpanded();
  }

  function handleDelete() {
    startTransition(async () => {
      await removeWithAnimation(rowRef.current, () => deleteUser(user.id));
      router.refresh();
    });
  }

  function handleMakeAdmin() {
    startTransition(async () => {
      await makeAdmin(user.id);
      router.refresh();
    });
  }

  return (
    <li
      ref={rowRef}
      onClick={handleCardClick}
      className="cursor-pointer rounded-[var(--radius-md)] border border-border bg-surface p-3"
    >
      <div className="flex items-center gap-3">
        <button type="button" onClick={onToggleExpanded} className="no-press text-muted" aria-label={isExpanded ? "Collapse" : "Expand"}>
          <Chevron open={isExpanded} />
        </button>

        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-[15px] font-semibold">{user.email}</span>
          <span className="shrink-0 text-[12px] text-muted">
            {ROLE_LABELS[user.role]}
            {isSelf && " · You"}
          </span>
        </div>

        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDate(user.created_at)}</span>
        {/* Fixed-width slot reserved even before it fills in after
            hydration (see useStartOfToday), so the row doesn't shift. */}
        <span className="min-w-[96px] shrink-0 text-right text-[12px] text-muted">
          {today !== null && todayLabel(countSince(user.latestChangeTimes, today))}
        </span>

        {canMakeAdmin || canDelete ? (
          <UserRowMenu
            canMakeAdmin={canMakeAdmin}
            canDelete={canDelete}
            onMakeAdmin={handleMakeAdmin}
            onDelete={handleDelete}
          />
        ) : (
          // Holds the menu button's place, keeping the counters lined up.
          <span className="w-8 shrink-0" />
        )}
      </div>

      <div
        data-no-toggle
        inert={!isExpanded}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !isExpanded) setContentMounted(false);
        }}
        className={cn(
          "grid cursor-auto transition-[grid-template-rows] duration-[400ms] ease-[var(--ease-spring)]",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {contentMounted && (
            <div className="mt-3 border-t border-border pt-3">
              {user.recent.length === 0 ? (
                <p className="text-[13px] text-muted">No changes yet.</p>
              ) : (
                <>
                  <ActivityList entries={user.recent} />
                  <button
                    type="button"
                    onClick={onShowAll}
                    className="press-ghost mt-3 text-[13px] font-medium text-accent hover:opacity-70"
                  >
                    Show all
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-baseline gap-3 py-1.5 text-[13px]">
          <span className="min-w-0 flex-1">{entry.summary}</span>
          <span className="shrink-0 text-[12px] text-muted">{formatWhen(entry.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

// "Show all": the user's card, opened out across the whole screen, with
// their entire history in one continuous scroll — more pages load as the
// bottom comes into view, and once there's nothing left, Close sits there.
function UserActivityOverlay({ user, onClose }: { user: UserWithActivity | null; onClose: () => void }) {
  // Kept after closing so the content doesn't blank out mid-animation.
  const [shown, setShown] = useState(user);
  if (user && user !== shown) setShown(user);

  return (
    <Dialog.Root open={!!user} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="menu-pop fixed inset-0 z-50 flex flex-col bg-background p-3 outline-none sm:p-5"
        >
          {shown && <UserActivityCard key={shown.id} user={shown} onClose={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function UserActivityCard({ user, onClose }: { user: UserWithActivity; onClose: () => void }) {
  const [entries, setEntries] = useState<ActivityEntry[]>(user.recent);
  const [done, setDone] = useState(user.recent.length < RECENT_COUNT);
  const today = useStartOfToday();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const loadingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const last = entries.at(-1);
      const page = await getUserActivity(user.id, last ? { createdAt: last.created_at, id: last.id } : null);
      setEntries((current) => {
        const seen = new Set(current.map((e) => e.id));
        return [...current, ...page.entries.filter((e) => !seen.has(e.id))];
      });
      setDone(page.done);
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [done, entries, user.id]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || done || error) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { root: scrollRef.current, rootMargin: "400px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [done, error, loadMore]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-baseline gap-2 border-b border-border px-5 pb-3 pt-4">
        <Dialog.Title className="truncate text-[22px] font-semibold tracking-tight">{user.email}</Dialog.Title>
        <span className="shrink-0 text-[13px] text-muted">
          {ROLE_LABELS[user.role]}
          {today !== null && ` · ${todayLabel(countSince(user.latestChangeTimes, today))}`}
        </span>
      </div>

      <div ref={scrollRef} className="safari-toolbar-inset min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
        <ActivityList entries={entries} />

        {!done && (
          <div ref={sentinelRef} className="flex justify-center py-4">
            {error ? (
              <button type="button" onClick={loadMore} className="press-ghost text-[13px] font-medium text-accent hover:opacity-70">
                Couldn&apos;t load more — try again
              </button>
            ) : (
              loading && <Spinner />
            )}
          </div>
        )}

        {done && (
          <div className="flex justify-center pb-2 pt-5">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// The page's "⋯": makes signup links as well as sorting, since both are
// about the list as a whole rather than any one user in it.
function UsersMenuButton({
  sortKey,
  sortDir,
  onToggleSort,
}: {
  sortKey: UserSortKey;
  sortDir: SortDir;
  onToggleSort: (key: UserSortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="User options"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="menu-pop absolute right-0 top-full z-20 mt-1 w-56 origin-top-right rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
          <CopySignupLinkItem />
          <div className="mt-1 border-t border-border px-2.5 pb-1 pt-2 text-[12px] text-muted">Sort by</div>
          <SortMenuItem label="Last Change" sortKey="activity" active={sortKey} dir={sortDir} onClick={onToggleSort} />
          <SortMenuItem label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={onToggleSort} />
          <SortMenuItem label="Role" sortKey="role" active={sortKey} dir={sortDir} onClick={onToggleSort} />
          <SortMenuItem label="Date Created" sortKey="date" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        </div>
      )}
    </div>
  );
}

// A user's own "⋯": what can be done to that one account. Delete asks
// first, in place, the way the playlists' Delete does.
function UserRowMenu({
  canMakeAdmin,
  canDelete,
  onMakeAdmin,
  onDelete,
}: {
  canMakeAdmin: boolean;
  canDelete: boolean;
  onMakeAdmin: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setConfirmingDelete(false);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const itemClass =
    "press-ghost-fit block w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]";

  return (
    <div ref={containerRef} data-no-toggle className="relative shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Account options"
        aria-expanded={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="menu-pop absolute right-0 top-full z-20 mt-1 w-44 origin-top-right rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
          {confirmingDelete ? (
            <div className="px-2.5 py-1.5">
              <p className="mb-1.5 text-[12px] text-muted">Delete this account?</p>
              <div className="flex items-center gap-3 text-[13px]">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                  className="press-ghost font-medium text-danger hover:opacity-70"
                >
                  Confirm
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="press-ghost text-muted hover:opacity-70">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {canMakeAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onMakeAdmin();
                  }}
                  className={itemClass}
                >
                  Make Admin
                </button>
              )}
              {canDelete && (
                <button type="button" onClick={() => setConfirmingDelete(true)} className={cn(itemClass, "text-danger")}>
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Every press makes a brand-new single-use link and copies it. The
// clipboard write is started right in the press, with the link handed in
// as a promise: Safari refuses clipboard writes that only begin after an
// await, which is where the link would otherwise arrive. If copying fails
// anyway, the link is shown to copy by hand — it exists either way.
function CopySignupLinkItem() {
  const [state, setState] = useState<"idle" | "working" | "copied" | { link: string }>("idle");
  const resetRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetRef.current), []);

  async function handleClick() {
    clearTimeout(resetRef.current);
    setState("working");
    const link = createSignupLink();
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/plain": link.then((url) => new Blob([url], { type: "text/plain" })) }),
        ]);
      } else {
        await navigator.clipboard.writeText(await link);
      }
      setState("copied");
      resetRef.current = setTimeout(() => setState("idle"), 2000);
    } catch {
      try {
        setState({ link: await link });
      } catch {
        setState("idle");
      }
    }
  }

  if (typeof state === "object") {
    return (
      <div className="px-2.5 py-1.5">
        <p className="mb-1 text-[12px] text-muted">Couldn&apos;t copy — here&apos;s the link:</p>
        <input
          readOnly
          value={state.link}
          onFocus={(e) => e.currentTarget.select()}
          autoFocus
          className="w-full rounded-[var(--radius-sm)] bg-black/[.03] px-2 py-1 font-mono text-[11px] outline-none dark:bg-white/[.05]"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "working"}
      className="press-ghost-fit block w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] font-medium text-accent hover:bg-black/[.04] disabled:opacity-60 dark:hover:bg-white/[.06]"
    >
      {state === "copied" ? "Link copied ✓" : state === "working" ? "Creating link…" : "Copy Signup Link"}
    </button>
  );
}

function SortMenuItem({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: UserSortKey;
  active: UserSortKey;
  dir: SortDir;
  onClick: (key: UserSortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "press-ghost-fit flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
        isActive ? "font-medium text-foreground" : "text-muted",
      )}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-4 w-4 transition-transform", open && "rotate-90")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
