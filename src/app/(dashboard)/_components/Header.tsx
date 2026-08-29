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
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[var(--surface-elevated)] px-5 py-3 backdrop-blur-xl">
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
