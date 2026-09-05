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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Sized (and pinned) to the *dynamic* viewport, not the ordinary %-based
    // height a nested h-dvh alone would still be measured against — this is
    // what stops Safari's collapsing address bar from leaving the page free
    // to scroll past the app shell and expose a gap of bare background
    // beneath it.
    <html lang="en" className="h-dvh overflow-hidden">
      <body className="h-dvh overflow-hidden">{children}</body>
    </html>
  );
}
