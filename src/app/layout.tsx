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
    // svh (small viewport height), not dvh: dvh is *dynamic* — on iOS
    // Safari it only settles to the correct value once the page has
    // actually been scrolled, which this app's outer html/body never is
    // (everything scrolls in nested regions instead, on purpose, to avoid
    // a separate double-scroll bug). Left on dvh, that meant Safari kept
    // treating the address bar as the size it'd be if hidden, leaving a
    // gap of bare background where the (still-visible) toolbar actually
    // sits. svh is static — always the viewport height with the toolbar
    // fully shown — so it's never wrong, just occasionally an underuse of
    // space on the rare page where the toolbar does auto-hide.
    <html lang="en" className="h-svh overflow-hidden">
      <body className="h-svh overflow-hidden">{children}</body>
    </html>
  );
}
