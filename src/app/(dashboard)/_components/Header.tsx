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
    // The header's own background already reaches the true top edge, under
    // the status bar (viewport-fit=cover + the app shell's lvh-based
    // height) — it's already translucent + blurred, so that's the status
    // bar area's "translucent" look for free, with no theme-color needed
    // to force a flat tint over it. pt-[max(env(safe-area-inset-top),12px)]
    // just pushes the header's own *content* down far enough to clear the
    // status bar's icons instead of colliding with them, using that
    // reserved space as the header's top spacing rather than adding more
    // on top of it. Falls back to the original 12px anywhere the inset is
    // 0 (desktop), so nothing changes there.
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
