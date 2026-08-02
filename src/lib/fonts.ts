import localFont from "next/font/local";

// Brand font, used only for the "Colo Cloud" title (login screen + dashboard header) — not the app's general UI typeface.
export const brandFont = localFont({
  src: "../fonts/colo.ttf",
  display: "swap",
  variable: "--font-brand",
});
