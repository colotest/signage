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
    // height) — it's already translucent + blurred, and with the status
    // bar itself now also translucent (apple-mobile-web-app-status-bar-style
    // in the root layout), that shared blur is meant to read as one merged
    // surface rather than two stacked bars. So this isn't pushing the
    // header's content all the way clear of the status bar (that was the
    // "two stacked bars" look, and ate a full status-bar-height of
    // otherwise-usable space) — just a third of that inset on top of the
    // original 12px, trusting the status bar's own icons to auto-contrast
    // against whatever's behind them the way iOS always draws them. The
    // env() term is 0 on desktop, so this is exactly the original 12px
    // there, unchanged.
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[var(--surface-elevated)] px-5 pb-3 pt-[calc(12px+(env(safe-area-inset-top)/3))] backdrop-blur-xl">
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
