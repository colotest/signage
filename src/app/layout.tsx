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
      <head>
        {/* Safety net for the "page shifted upward, header clipped" iOS
            Safari bug: html/body are overflow:hidden and meant to never
            scroll themselves (overscroll-behavior in globals.css stops the
            usual trigger, momentum chaining from the inner lists). But if
            Safari ever does record a nonzero scroll offset for html/body,
            its default scroll-restoration replays that offset on every
            reload of the tab — which is exactly why a reload alone didn't
            clear the bug and only a fresh tab did. Forcing manual
            restoration and zeroing the scroll position on every load/
            pageshow (pageshow also covers the bfcache-restore case, which
            "load" misses) means a reload now genuinely resets it. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function reset(){if("scrollRestoration" in history){history.scrollRestoration="manual";}window.scrollTo(0,0);document.documentElement.scrollTop=0;if(document.body){document.body.scrollTop=0;}}reset();window.addEventListener("pageshow",reset);})();`,
          }}
        />
      </head>
      <body className="app-shell-height overflow-hidden">{children}</body>
    </html>
  );
}
