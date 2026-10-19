"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Menu } from "@/components/ui/Menu";
import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { RoleDot, RoleDots } from "@/components/RoleDot";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { deleteUser, getUserActivity, setNickname, setUserRole } from "@/lib/actions/users";
import { removeWithAnimation } from "@/lib/animation/listMotion";
import { useOwnRoles, useViewer } from "@/lib/auth/ViewerContext";
import { cn } from "@/lib/utils/cn";
import type { ActivityEntry, Role, User } from "@/types/domain";
import { ThreeDotIcon, type SortDir } from "../../library/_components/FileTree";
import { RoleDialog } from "./RoleDialog";
import { SignupDialog, startSignup, type PendingSignup } from "./SignupDialog";

// displayName: their nickname, or the name made from their email.
// roleIds: which of the viewer's own roles they hold (never anyone else's).
// recent: the latest few changes (the page fetches 5 — fewer means that's
// all of them). latestChangeTimes: when each of the last day and a half's
// changes happened, for counting today's. Both empty for a viewer whose
// roles don't let them see changes.
export type UserWithActivity = User & {
  displayName: string;
  roleIds: string[];
  recent: ActivityEntry[];
  latestChangeTimes: string[];
};

const RECENT_COUNT = 5;

type UserSortKey = "activity" | "name" | "date";

function userSortValue(user: UserWithActivity, key: UserSortKey): string | number {
  switch (key) {
    case "activity":
      // Never-active users sort as the oldest.
      return user.recent[0] ? new Date(user.recent[0].created_at).getTime() : 0;
    case "name":
      return user.displayName.toLowerCase();
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

// "joline@… · You" — skipping any part that's blank, so no stray separator
// is left behind.
function joinDescriptors(...parts: (string | false | null)[]) {
  return parts.filter(Boolean).join(" · ");
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
// What's on offer — the changes, each card's menu, the "⋯" menu's lines —
// depends on what the viewer's roles allow on this page.
export function UsersView({
  users,
  roles,
  screens,
  groups,
}: {
  users: UserWithActivity[];
  // The viewer's own roles in full, for editing — empty unless their roles
  // let them manage roles.
  roles: Role[];
  // What the role editor offers to show or hide on the Screens grid.
  screens: { id: number; name: string }[];
  groups: { id: string; name: string }[];
}) {
  const viewer = useViewer();
  const can = viewer.access.users;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Whoever's been at it most recently first — when changes can be seen.
  const [sortKey, setSortKey] = useState<UserSortKey>(can.viewChanges ? "activity" : "name");
  const [sortDir, setSortDir] = useState<SortDir>(can.viewChanges ? "desc" : "asc");
  const [showingAllFor, setShowingAllFor] = useState<UserWithActivity | null>(null);
  const [pendingSignup, setPendingSignup] = useState<PendingSignup | null>(null);
  // undefined: closed. null: a new role. A role: that one, being edited.
  const [editingRole, setEditingRole] = useState<Role | null | undefined>(undefined);

  function toggleSort(key: UserSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Most recent activity first is the useful way round for that one.
      setSortDir(key === "activity" ? "desc" : "asc");
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
        <UsersMenuButton
          roles={roles}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          onNewSignup={() => setPendingSignup(startSignup())}
          onNewRole={() => setEditingRole(null)}
          onEditRole={setEditingRole}
        />
      </div>

      <div className="relative -mt-10 -mb-5 mx-[-10px] min-h-0 flex-1">
        <div className="scroll-fade-y [--fade-top:24px] no-scrollbar safari-toolbar-inset absolute inset-0 overflow-y-auto overscroll-contain pt-[47px]">
          <ul className="flex flex-col gap-3">
            {sorted.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === viewer.id}
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
      <SignupDialog pending={pendingSignup} onClose={() => setPendingSignup(null)} />
      <RoleDialog
        // A fresh form for each role (and each new one).
        key={editingRole === undefined ? "closed" : (editingRole?.id ?? "new")}
        open={editingRole !== undefined}
        onOpenChange={(open) => !open && setEditingRole(undefined)}
        role={editingRole ?? null}
        existingColors={roles.filter((r) => r.id !== editingRole?.id).map((r) => r.color)}
        screens={screens}
        groups={groups}
      />
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  isExpanded,
  onToggleExpanded,
  onShowAll,
}: {
  user: UserWithActivity;
  isSelf: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onShowAll: () => void;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const can = viewer.access.users;
  const [, startTransition] = useTransition();
  const rowRef = useRef<HTMLLIElement | null>(null);
  const today = useStartOfToday();
  const flags = useOwnRoles(user.roleIds);
  const [editingNickname, setEditingNickname] = useState(false);

  // Mounted while open (and while sliding shut), same as a playlist card.
  const [contentMounted, setContentMounted] = useState(isExpanded);
  if (isExpanded && !contentMounted) setContentMounted(true);

  // Without the changes to show, a card has nothing to open into.
  const expandable = can.viewChanges;
  // The super admin's account and roles aren't anyone else's to change,
  // and nobody deletes their own from here (the actions refuse it too).
  const canDelete = can.delete && !isSelf && !user.is_super_admin;
  const canAssign = can.assignRoles && !user.is_super_admin && viewer.roles.length > 0;
  const hasMenu = can.nicknames || canDelete || canAssign;

  function handleCardClick(e: React.MouseEvent) {
    if (!expandable) return;
    if ((e.target as Element).closest("button, input, a, [data-no-toggle]")) return;
    onToggleExpanded();
  }

  function handleDelete() {
    startTransition(async () => {
      await removeWithAnimation(rowRef.current, () => deleteUser(user.id));
      router.refresh();
    });
  }

  function handleRole(roleId: string, assigned: boolean) {
    startTransition(async () => {
      await setUserRole(user.id, roleId, assigned);
      router.refresh();
    });
  }

  function handleNickname(next: string) {
    setEditingNickname(false);
    if (next.trim() === (user.nickname ?? "")) return;
    startTransition(async () => {
      await setNickname(user.id, next);
      router.refresh();
    });
  }

  return (
    <li
      ref={rowRef}
      onClick={handleCardClick}
      className={cn("rounded-[var(--radius-md)] border border-border bg-surface p-3", expandable && "cursor-pointer")}
    >
      <div className="flex items-center gap-3">
        {expandable ? (
          <button type="button" onClick={onToggleExpanded} className="no-press text-muted" aria-label={isExpanded ? "Collapse" : "Expand"}>
            <Chevron open={isExpanded} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingNickname ? (
            <NicknameField initial={user.nickname ?? ""} placeholder={user.displayName} onDone={handleNickname} />
          ) : (
            <span className="truncate text-[15px] font-semibold">{user.nickname || user.email}</span>
          )}
          <RoleDots roles={flags} />
          {!editingNickname && (
            <span className="min-w-0 shrink truncate text-[12px] text-muted">
              {joinDescriptors(user.nickname && user.email, isSelf && "You")}
            </span>
          )}
        </div>

        <span className="hidden shrink-0 text-[12px] text-muted sm:block">{formatDate(user.created_at)}</span>
        {/* Fixed-width slot reserved even before it fills in after
            hydration (see useStartOfToday), so the row doesn't shift. */}
        {can.viewChanges && (
          <span className="min-w-[96px] shrink-0 text-right text-[12px] text-muted">
            {today !== null && todayLabel(countSince(user.latestChangeTimes, today))}
          </span>
        )}

        {hasMenu ? (
          <UserRowMenu
            user={user}
            canNickname={can.nicknames}
            canAssign={canAssign}
            canDelete={canDelete}
            onEditNickname={() => setEditingNickname(true)}
            onRole={handleRole}
            onDelete={handleDelete}
          />
        ) : (
          // Holds the menu button's place, keeping the counters lined up.
          <span className="w-8 shrink-0" />
        )}
      </div>

      {expandable && (
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
      )}
    </li>
  );
}

// In place of the name while it's being changed. Enter or leaving the
// field saves; Escape cancels. Left empty, the nickname is cleared.
function NicknameField({
  initial,
  placeholder,
  onDone,
}: {
  initial: string;
  placeholder: string;
  onDone: (next: string) => void;
}) {
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      defaultValue={initial}
      placeholder={placeholder}
      maxLength={60}
      data-no-toggle
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onDone(cancelled.current ? initial : e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className="min-w-0 flex-1 rounded-[3px] border border-accent bg-transparent px-1 -mx-1 text-[15px] font-semibold outline-none"
    />
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
        <Dialog.Title className="truncate text-[22px] font-semibold tracking-tight">{user.nickname || user.email}</Dialog.Title>
        <span className="shrink-0 text-[13px] text-muted">
          {joinDescriptors(today !== null && todayLabel(countSince(user.latestChangeTimes, today)))}
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

const MENU_ITEM =
  "press-ghost-fit flex w-full items-center gap-2 rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]";

// The page's "⋯": about the list as a whole rather than any one user in it
// — new signup links, the roles themselves, and sorting.
function UsersMenuButton({
  roles,
  sortKey,
  sortDir,
  onToggleSort,
  onNewSignup,
  onNewRole,
  onEditRole,
}: {
  roles: Role[];
  sortKey: UserSortKey;
  sortDir: SortDir;
  onToggleSort: (key: UserSortKey) => void;
  onNewSignup: () => void;
  onNewRole: () => void;
  onEditRole: (role: Role) => void;
}) {
  const viewer = useViewer();
  const can = viewer.access.users;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const hasActions = can.signups || can.manageRoles;

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="User options"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted shadow-[var(--shadow-control)] transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      <Menu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} className="w-56 p-1">
        {can.signups && (
          // Its link is made and copied in this very press — see startSignup.
          <button type="button" onClick={() => pick(onNewSignup)} className={cn(MENU_ITEM, "text-accent")}>
            New Signup
          </button>
        )}
        {can.manageRoles && (
          <>
            <button type="button" onClick={() => pick(onNewRole)} className={cn(MENU_ITEM, "text-accent")}>
              New Role
            </button>
            {roles.map((role) => (
              <button key={role.id} type="button" onClick={() => pick(() => onEditRole(role))} className={MENU_ITEM}>
                <RoleDot role={role} />
                <span className="truncate">Edit {role.name}</span>
              </button>
            ))}
          </>
        )}
        <div className={cn("px-2.5 pb-1 pt-2 text-[12px] text-muted", hasActions && "mt-1 border-t border-border")}>
          Sort by
        </div>
        {can.viewChanges && (
          <SortMenuItem label="Last Change" sortKey="activity" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        )}
        <SortMenuItem label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={onToggleSort} />
        <SortMenuItem label="Date Created" sortKey="date" active={sortKey} dir={sortDir} onClick={onToggleSort} />
      </Menu>
    </div>
  );
}

// A user's own "⋯": what can be done to that one account — their nickname,
// a "Make <Role>" / "Revoke <Role>" line for each of the viewer's roles,
// and Delete, which asks first, in place, the way the playlists' does.
function UserRowMenu({
  user,
  canNickname,
  canAssign,
  canDelete,
  onEditNickname,
  onRole,
  onDelete,
}: {
  user: UserWithActivity;
  canNickname: boolean;
  canAssign: boolean;
  canDelete: boolean;
  onEditNickname: () => void;
  onRole: (roleId: string, assigned: boolean) => void;
  onDelete: () => void;
}) {
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  // The confirmation is reset on the way in rather than out, so the menu
  // doesn't flip back to its options while it's still shrinking away.
  function close() {
    setOpen(false);
  }

  function openMenu() {
    setConfirmingDelete(false);
    setOpen(true);
  }

  function pick(action: () => void) {
    close();
    action();
  }

  return (
    <div data-no-toggle className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        aria-label="Account options"
        aria-expanded={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      <Menu open={open} onClose={close} anchorRef={anchorRef} className="w-52 p-1">
        {confirmingDelete ? (
          <div className="pop-in origin-top px-2.5 py-1.5">
            <p className="mb-1.5 text-[12px] text-muted">Delete this account?</p>
            <div className="flex items-center gap-3 text-[13px]">
              <button type="button" onClick={() => pick(onDelete)} className="press-ghost font-medium text-danger hover:opacity-70">
                Confirm
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="press-ghost text-muted hover:opacity-70">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {canNickname && (
              <button type="button" onClick={() => pick(onEditNickname)} className={MENU_ITEM}>
                {user.nickname ? "Edit Nickname" : "Give Nickname"}
              </button>
            )}
            {canAssign && (
              <div className={cn(canNickname && "mt-1 border-t border-border pt-1")}>
                {viewer.roles.map((role) => {
                  const assigned = user.roleIds.includes(role.id);
                  return (
                    <button key={role.id} type="button" onClick={() => pick(() => onRole(role.id, !assigned))} className={MENU_ITEM}>
                      <RoleDot role={role} />
                      <span className="truncate">{assigned ? `Revoke ${role.name}` : `Make ${role.name}`}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {canDelete && (
              <div className={cn((canNickname || canAssign) && "mt-1 border-t border-border pt-1")}>
                <button type="button" onClick={() => setConfirmingDelete(true)} className={cn(MENU_ITEM, "text-danger")}>
                  Delete
                </button>
              </div>
            )}
          </>
        )}
      </Menu>
    </div>
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
        "press-ghost-fit flex w-full items-center justify-between rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
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
