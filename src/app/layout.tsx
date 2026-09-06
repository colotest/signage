import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Colo Cloud",
  description: "Digital signage control for event venue screens",
  // The standards-based way to ask iOS Safari for a translucent status
  // bar — traditionally scoped to standalone/home-screen mode, but
  // harmless to declare regardless, and worth having in case the newer
  // "content extends behind the toolbar" behavior extends its reach to
  // this too. Lets the header's own translucent, blurred background (see
  // Header.tsx) be what's visible through the status bar, rather than a
  // flat color painted behind it.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // app-shell-height (100lvh + env(safe-area-inset-bottom) * 2), not
    // plain lvh/svh/dvh. The goal on iOS Safari isn't to stay above its
    // floating toolbar — recent iOS versions let page content extend the
    // full screen behind that (translucent) toolbar on purpose, which is
    // what we want here so the lists reach the true bottom edge. svh
    // explicitly excludes that area (it's defined as the viewport with the
    // toolbar fully shown), so it never extends there regardless of
    // viewport-fit=cover or any padding underneath. lvh alone gets partway
    // there — it accounts for the toolbar collapsing — but still stops at
    // the safe-area boundary, short of the true edge by the home-indicator
    // inset; a single inset back on top only closed half that remaining
    // gap on device, so it's doubled. Static rather than dynamic (unlike
    // dvh), so it doesn't depend on Safari settling it via a scroll
    // gesture this non-scrolling outer shell never gets.
    <html lang="en" className="app-shell-height overflow-hidden">
      <body className="app-shell-height overflow-hidden">{children}</body>
    </html>
  );
}
