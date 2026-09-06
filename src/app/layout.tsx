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
  // apple-mobile-web-app-status-bar-style (which would make the status
  // bar translucent) is standalone/home-screen-app only — it does
  // nothing in a regular Safari tab, which is what this app runs in, so
  // there's no way to make the status bar itself translucent here.
  // theme-color is the one status-bar-adjacent lever that *does* work in
  // a regular tab: it tints Safari's own chrome to match, so the header
  // going solid (see Header.tsx) and this matching it flatly is the
  // closest thing to "the header and status bar are the same color"
  // actually available in this context.
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
    // app-shell-height (109lvh — see globals.css for why), not plain
    // lvh/svh/dvh. The goal on iOS Safari isn't to stay above its floating
    // toolbar — recent iOS versions let page content extend the full
    // screen behind that (translucent) toolbar on purpose, which is what
    // we want here so the lists reach the true bottom edge.
    <html lang="en" className="app-shell-height overflow-hidden">
      <body className="app-shell-height overflow-hidden">{children}</body>
    </html>
  );
}
