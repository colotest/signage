"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { UserIcon } from "@/components/icons/UserIcon";
import { Menu } from "@/components/ui/Menu";
import { openEdgeTuner } from "@/lib/edgeTuning";
import { usePowerSaving } from "@/lib/hooks/usePowerSaving";
import { logoutAction } from "@/lib/actions/auth";
import { useViewer } from "@/lib/auth/ViewerContext";
import { PAGES } from "@/lib/auth/access";
import { RoleDot } from "@/components/RoleDot";
import { brandFont } from "@/lib/fonts";
import { cn } from "@/lib/utils/cn";

// Users lives in the account menu rather than here (see UserMenu).
const NAV_PAGES = PAGES.filter((page) => page.key !== "users");

export function Header() {
  const pathname = usePathname();
  const viewer = useViewer();
  // Pages the viewer's roles don't reach aren't shown at all.
  const navItems = NAV_PAGES.filter((page) => viewer.access.pages[page.key]);
  const headerRef = useRef<HTMLElement | null>(null);

  // Installed to the Home Screen this header lies over the page rather than
  // above it (header-overlay in globals.css), so the scrolling area below
  // has to make up its height in padding. That height isn't a constant —
  // it moves with the brand type, with the device's own top inset and with
  // the window's width — so it's measured and handed to the stylesheet
  // instead of guessed. Harmless in a Safari tab, where nothing reads it.
  useLayoutEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--header-h", `${node.offsetHeight}px`);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    // header-surface (globals.css): flat in a Safari tab, where it has to
    // match theme-color exactly — that's what Safari paints its own chrome
    // with, and a translucent header below a flat strip reads as two
    // surfaces rather than one. Installed to the Home Screen there's no
    // Safari chrome: the status bar is transparent and sits over the page
    // (black-translucent, root layout), the strip behind it is this
    // header's own glass, and header-top-safe-area holds the nav clear of
    // the clock — 6px on desktop, 0 on touch, the inset plus 6 installed.
    //
    // header-overlay (globals.css, installed only): the page runs
    // underneath this header instead of starting below it, so the glass
    // has something to blur — see --header-h above.
    //
    // z-30 beats everything a page puts in its own stacking order — section
    // titles (z-10), row and sort menus (z-20) — which are siblings of this
    // header rather than children of it, and later in the DOM. At a tie they
    // won, so the account menu hanging below the header came out behind a
    // page's own controls, and they took its clicks. Portalled dialogs stay
    // above at z-40/50.
    //
    // --shadow-bar: a soft falloff under the hairline, so the page reads as
    // passing beneath the header rather than butting up against it.
    <header
      ref={headerRef}
      className="header-overlay header-top-safe-area sticky top-0 z-30 flex items-center justify-between border-b border-border header-surface px-5 pb-1.5 shadow-[var(--shadow-bar)]"
    >
      <nav className="flex items-center gap-5">
        <span className={`${brandFont.className} mt-[0.1em] text-[28.5px] uppercase tracking-tight`}>
          Colo Cloud
        </span>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-[15px] text-foreground/80 hover:text-foreground",
              pathname === item.href && "font-semibold text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <UserMenu />
    </header>
  );
}

// Log Out lives behind a round avatar button rather than in plain view —
// it's rarely needed, and a stray tap on it signed the whole dashboard out.
// So does everything about accounts: who's signed in, their roles, and for
// those whose roles reach it, the Users page.
function UserMenu() {
  const viewer = useViewer();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Following the Users link closes the menu behind it.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }
  const anchorRef = useRef<HTMLButtonElement>(null);


  return (
    <div className="relative shrink-0">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-black/[.06] text-muted shadow-[var(--shadow-control)] hover:text-foreground dark:bg-white/[.1]"
      >
        <UserIcon className="mt-1.5 h-8 w-8" />
      </button>

      {/* Items are rounded 4px less than the menu, matching its 4px (p-1)
          inset, so their corners run parallel to its own. */}
      <Menu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} className="w-56 p-1">
        <div className="border-b border-border px-2.5 pb-2 pt-1.5">
          <p className="truncate text-[13px] font-medium">{viewer.nickname || viewer.email}</p>
          {viewer.nickname && <p className="truncate text-[12px] text-muted">{viewer.email}</p>}
          {/* The super admin holds every role, so listing them says nothing. */}
          {!viewer.access.superAdmin && viewer.roles.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {viewer.roles.map((role) => (
                <li key={role.id} className="flex items-center gap-1.5 text-[12px] text-muted">
                  <RoleDot role={role} />
                  <span className="truncate">{role.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {viewer.access.pages.users && (
          <Link
            href="/users"
            role="menuitem"
            className={cn(
              "press-ghost-fit mt-1 block w-full rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]",
              pathname === "/users" && "bg-black/[.04] dark:bg-white/[.06]",
            )}
          >
            Users
          </Link>
        )}
        <PowerSavingItem />
        {/* The scroll-edge tuning panel — a design tool, so the super
            admin's only. */}
        {viewer.access.superAdmin && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              openEdgeTuner();
            }}
            className="press-ghost-fit block w-full rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Tune Scroll Edges…
          </button>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            role="menuitem"
            className="press-ghost-fit block w-full rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] font-medium text-danger hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            Log Out
          </button>
        </form>
      </Menu>
    </div>
  );
}

// Power-saving mode's switch (see usePowerSaving). Stays in the menu when
// pressed — the switch is the feedback, and it's often flipped back and forth
// to compare.
function PowerSavingItem() {
  const [on, setOn] = usePowerSaving();
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={() => setOn(!on)}
      className="press-ghost-fit mt-1 flex w-full items-center justify-between gap-3 rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[13px] font-medium hover:bg-black/[.04] dark:hover:bg-white/[.06]"
    >
      Power Saving
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-200",
          on ? "bg-success" : "bg-black/[.12] dark:bg-white/[.2]",
        )}
      >
        <span
          className={cn(
            "absolute left-[2px] top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-[var(--ease-spring)]",
            on && "translate-x-[12px]",
          )}
        />
      </span>
    </button>
  );
}
