"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/datenraumContent";
import {
  DATENRAUM_LANG_COOKIE,
  DATENRAUM_THEME_COOKIE,
  type DatenraumThemeName,
} from "@/lib/datenraumPrefs";
import { cn } from "@/lib/utils/cn";

type Prefs = {
  theme: DatenraumThemeName;
  lang: Lang;
  toggleTheme: () => void;
  setLang: (lang: Lang) => void;
};

const PrefsContext = createContext<Prefs>({ theme: "dark", lang: "de", toggleTheme: () => {}, setLang: () => {} });

export const useDatenraumPrefs = () => useContext(PrefsContext);

// The words around the content (the content itself is in datenraumContent).
export const UI: Record<Lang, Record<string, string>> = {
  de: {
    overview: "Übersicht",
    gallery: "Bildersammlung",
    view: "Ansicht",
    scroll: "Scrollen",
    idealFor: "Ideal für",
    toLight: "Helle Darstellung",
    toDark: "Dunkle Darstellung",
    language: "Sprache",
    picture: "Bild",
    openTour: "In neuem Tab öffnen",
    tour: "360°-Tour",
    floor: "Etage",
  },
  en: {
    overview: "Overview",
    gallery: "Gallery",
    view: "View",
    scroll: "Scroll",
    idealFor: "Ideal for",
    toLight: "Light appearance",
    toDark: "Dark appearance",
    language: "Language",
    picture: "Picture",
    openTour: "Open in a new tab",
    tour: "360° tour",
    floor: "Floor",
  },
};

const remember = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/datenraum; max-age=31536000; samesite=lax`;
};

// The Datenraum's own light or dark — whatever the device's (see the dark
// variant in globals.css), its dark all black — and its language: dark and
// German unless someone's switched, which is remembered for this page only,
// in cookies the page reads before it's sent, so a choice doesn't arrive
// as the default first.
//
// The theme's drawn on its own box from the first paint, and once running
// on <html> too while the page is open — so what's drawn outside the box
// (the account menu, under the header) takes it as well — along with
// Safari's tab colour, which the header has to match (see .header-surface),
// and the document's language. All handed back on the way out.
export function DatenraumPrefs({
  initialTheme,
  initialLang,
  className,
  children,
}: {
  initialTheme: DatenraumThemeName;
  initialLang: Lang;
  className?: string;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [lang, setLangState] = useState(initialLang);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const themeClass = `theme-${theme}`;
    html.classList.add(themeClass);
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((meta) => meta.content);
    const surface = boxRef.current ? getComputedStyle(boxRef.current).getPropertyValue("--surface").trim() : "";
    if (surface) for (const meta of metas) meta.content = surface;
    return () => {
      html.classList.remove(themeClass);
      metas.forEach((meta, i) => (meta.content = before[i]));
    };
  }, [theme]);

  useEffect(() => {
    const html = document.documentElement;
    const before = html.lang;
    html.lang = lang;
    return () => {
      html.lang = before;
    };
  }, [lang]);

  const prefs: Prefs = {
    theme,
    lang,
    toggleTheme() {
      const next = theme === "dark" ? "light" : "dark";
      remember(DATENRAUM_THEME_COOKIE, next);
      setTheme(next);
    },
    setLang(next) {
      remember(DATENRAUM_LANG_COOKIE, next);
      setLangState(next);
    },
  };

  return (
    <PrefsContext.Provider value={prefs}>
      <div ref={boxRef} lang={lang} className={cn("datenraum", `theme-${theme}`, className)}>
        {children}
      </div>
    </PrefsContext.Provider>
  );
}

// Top left on the page: light or dark, and German or English.
// Top left on a wide screen; on a narrow one, light/dark in the left
// corner and the language in the right (parts), the title between them.
export function DatenraumPrefsControls({
  className,
  parts = "both",
}: {
  className?: string;
  parts?: "both" | "theme" | "language";
}) {
  const { theme, lang, toggleTheme, setLang } = useDatenraumPrefs();
  const ui = UI[lang];
  const dark = theme === "dark";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {parts !== "language" && (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={dark ? ui.toLight : ui.toDark}
        title={dark ? ui.toLight : ui.toDark}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border glass-material text-foreground shadow-[var(--shadow-float)]"
      >
        {dark ? (
          // A sun: the way to light.
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
          </svg>
        ) : (
          // A moon: the way back to dark.
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
          </svg>
        )}
      </button>
      )}
      {parts !== "theme" && (
      <div
        role="radiogroup"
        aria-label={ui.language}
        className="flex h-9 items-center rounded-full border border-border glass-material p-[3px] shadow-[var(--shadow-float)]"
      >
        {(["de", "en"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={lang === option}
            onClick={() => setLang(option)}
            className={cn(
              "no-press h-full rounded-full px-2.5 text-[12px] font-semibold uppercase tracking-wide transition-colors",
              lang === option ? "bg-foreground text-surface" : "text-muted hover:text-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
