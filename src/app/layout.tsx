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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lvh (large viewport height), not svh or dvh. The goal on iOS Safari
    // isn't to stay above its floating toolbar — recent iOS versions let
    // page content extend the full screen behind that (translucent)
    // toolbar on purpose, which is what we want here so the lists reach
    // the true bottom edge. svh explicitly excludes that area (it's
    // defined as the viewport with the toolbar fully shown), so it never
    // extends there regardless of viewport-fit=cover or any padding
    // underneath — that's what was actually capping the page short, not
    // anything about padding. lvh is the full screen, and unlike dvh it's
    // static rather than dynamic, so it doesn't depend on Safari settling
    // it via a scroll gesture this non-scrolling outer shell never gets.
    <html lang="en" className="h-lvh overflow-hidden">
      <body className="h-lvh overflow-hidden">{children}</body>
    </html>
  );
}
