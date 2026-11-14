"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { DATENRAUM_THEME_COOKIE, type DatenraumThemeName } from "@/lib/datenraumTheme";

const ThemeContext = createContext<{ theme: DatenraumThemeName; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export const useDatenraumTheme = () => useContext(ThemeContext);

// The Datenraum's own light or dark, whatever the device's (see the dark
// variant in globals.css): dark unless someone's switched it, which is
// remembered for this page only, in a cookie the page reads before it's
// sent, so a light choice doesn't arrive dark first.
//
// Drawn on its own box from the first paint, and once running on <html>
// too while the page is open — so what's drawn outside the box (the
// account menu, under the header) takes it as well — along with Safari's
// tab colour, which the header has to match (see .header-surface). Both
// are handed back on the way out.
export function DatenraumTheme({
  initial,
  className,
  children,
}: {
  initial: DatenraumThemeName;
  className?: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    const html = document.documentElement;
    const themeClass = `theme-${theme}`;
    html.classList.add(themeClass);
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((meta) => meta.content);
    const surface = getComputedStyle(html).getPropertyValue("--surface").trim();
    for (const meta of metas) meta.content = surface;
    return () => {
      html.classList.remove(themeClass);
      metas.forEach((meta, i) => (meta.content = before[i]));
    };
  }, [theme]);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.cookie = `${DATENRAUM_THEME_COOKIE}=${next}; path=/datenraum; max-age=31536000; samesite=lax`;
    setTheme(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div className={cn(`theme-${theme}`, className)}>{children}</div>
    </ThemeContext.Provider>
  );
}

// Top left on the page: to light and back.
export function DatenraumThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useDatenraumTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Helle Darstellung" : "Dunkle Darstellung"}
      title={dark ? "Hell" : "Dunkel"}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full border border-border glass-material text-foreground shadow-[var(--shadow-float)]",
        className,
      )}
    >
      {dark ? (
        // A sun: the way to light.
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        // A moon: the way back to dark.
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}
