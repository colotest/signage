import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Colo Cloud",
  description: "Digital signage control for event venue screens",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Tints Safari's status bar to match the header's own surface color
  // (light/dark aware, same breakpoint the CSS itself keys off), so the
  // header can incorporate it — appearing to be one contiguous surface —
  // instead of the header needing its own visually-separate top edge.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // app-shell-height (100lvh + env(safe-area-inset-bottom)), not plain
    // lvh/svh/dvh. The goal on iOS Safari isn't to stay above its floating
    // toolbar — recent iOS versions let page content extend the full
    // screen behind that (translucent) toolbar on purpose, which is what
    // we want here so the lists reach the true bottom edge. svh explicitly
    // excludes that area (it's defined as the viewport with the toolbar
    // fully shown), so it never extends there regardless of
    // viewport-fit=cover or any padding underneath. lvh alone gets
    // partway there — it accounts for the toolbar collapsing — but still
    // stops at the safe-area boundary, short of the true edge by the
    // home-indicator inset; adding that inset back on top is what actually
    // closes the rest of the gap. Static rather than dynamic (unlike dvh),
    // so it doesn't depend on Safari settling it via a scroll gesture this
    // non-scrolling outer shell never gets.
    <html lang="en" className="app-shell-height overflow-hidden">
      <body className="app-shell-height overflow-hidden">{children}</body>
    </html>
  );
}
