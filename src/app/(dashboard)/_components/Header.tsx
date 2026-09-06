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
    // pt-[max(env(safe-area-inset-top),12px)] instead of a plain top
    // pb-3-equivalent: the header's own background already reaches the
    // true top edge, under the status bar (see viewport-fit=cover + lvh in
    // the root layout), so this pushes the actual content down just far
    // enough to clear the status bar — no more — using the status bar's
    // own reserved height as the header's top spacing there, rather than
    // stacking our own on top of it. The max(…,12px) is just the fallback
    // for anywhere that inset is 0 (desktop) — the original py-3 amount.
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[var(--surface-elevated)] px-5 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl">
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
