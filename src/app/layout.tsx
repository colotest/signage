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
            Safari bug. html/body are overflow:hidden and meant to never
            scroll themselves — overscroll-behavior in globals.css stops
            momentum chaining from the inner lists, but there's a second,
            separate trigger: focusing a text input (e.g. renaming a
            screen/playlist) makes iOS Safari's own keyboard-avoidance
            logic scroll the real document to keep the input clear of the
            keyboard, and on this overflow:hidden shell that scroll
            sometimes doesn't get reversed when the keyboard closes again.
            Reloading fixes it because reload replays the load/pageshow
            reset below — but switching views or using other UI doesn't,
            since nothing else in the app ever touches document scroll.
            So: watch visualViewport for the keyboard closing (its height
            goes back to matching window.innerHeight) and force the
            document back to scrollY 0 at that moment — not while the
            keyboard is open, which would fight Safari's legitimate
            scroll-into-view while the user is still typing. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function reset(){if("scrollRestoration" in history){history.scrollRestoration="manual";}window.scrollTo(0,0);document.documentElement.scrollTop=0;if(document.body){document.body.scrollTop=0;}}reset();window.addEventListener("pageshow",reset);var vv=window.visualViewport;if(vv){var onVvResize=function(){if(Math.abs(vv.height-window.innerHeight)<1){reset();}};vv.addEventListener("resize",onVvResize);}})();`,
          }}
        />
      </head>
      <body className="app-shell-height overflow-hidden">{children}</body>
    </html>
  );
}
