"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
    // (globals.css) pushes the header's content down clear of the status
    // bar's icons on touch devices.
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
      <form action={logoutAction}>
        <button type="submit" className="text-[15px] text-accent">
          Log Out
        </button>
      </form>
    </header>
  );
}
