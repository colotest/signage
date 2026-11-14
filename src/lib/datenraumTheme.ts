// The Datenraum page's own light or dark (see its DatenraumTheme): the
// cookie that remembers a switch, read by the page before it's sent.
export const DATENRAUM_THEME_COOKIE = "datenraum-theme";
export type DatenraumThemeName = "dark" | "light";

// Dark unless light was chosen.
export function parseDatenraumTheme(value: string | undefined): DatenraumThemeName {
  return value === "light" ? "light" : "dark";
}
