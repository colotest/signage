import type { Lang } from "@/lib/datenraumContent";

// The Datenraum page's own light or dark and language (see its
// DatenraumPrefs): the cookies that remember a switch, read by the page
// before it's sent.
export const DATENRAUM_THEME_COOKIE = "datenraum-theme";
export const DATENRAUM_LANG_COOKIE = "datenraum-lang";
export type DatenraumThemeName = "dark" | "light";

// Dark unless light was chosen.
export function parseDatenraumTheme(value: string | undefined): DatenraumThemeName {
  return value === "light" ? "light" : "dark";
}

// German unless English was chosen.
export function parseDatenraumLang(value: string | undefined): Lang {
  return value === "en" ? "en" : "de";
}
