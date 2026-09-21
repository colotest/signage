"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UserIcon } from "@/components/icons/UserIcon";
import { logoutAction } from "@/lib/actions/auth";
import { brandFont } from "@/lib/fonts";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Screens" },
  { href: "/library", label: "Media" },
];

export function Header() {
  const pathname = usePathname();

  return (
    // Solid, not translucent/blurred: iOS Safari's status bar can't be
    // tinted or made translucent from a regular (non-standalone) browser
    // tab — apple-mobile-web-app-status-bar-style is a standalone/
    // home-screen-app-only feature and had no effect here. theme-color
    // (root layout), which *does* work in a regular tab, only paints a
    // flat color — so the header matches that flatly instead of relying
    // on a blur effect the status bar area can't share. header-top-safe-area
    // (globals.css) is the normal 12px on desktop, but 0 on touch devices —
    // no extra clearance looked best there on device.
    <header className="header-top-safe-area sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[var(--surface)] px-5 pb-3">
      <nav className="flex items-center gap-5">
        <span className={`${brandFont.className} mt-[0.1em] text-[38px] uppercase tracking-tight`}>
          Colo Cloud
        </span>
        {NAV_ITEMS.map((item) => (
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
function UserMenu() {
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
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-black/[.06] text-muted hover:text-foreground dark:bg-white/[.1]"
      >
        <UserIcon className="mt-1.5 h-8 w-8" />
      </button>

      {open && (
        <div
          role="menu"
          className="menu-pop absolute right-0 top-full z-20 mt-2 w-40 origin-top-right rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-card)]"
        >
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="press-ghost-fit block w-full rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] font-medium text-danger hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Log Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
