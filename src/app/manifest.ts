import type { MetadataRoute } from "next";

// Added to an iPhone's Home Screen, this is what makes it open as its own
// app rather than a Safari tab with browser chrome around it.
//
// scope is the point worth not getting wrong: left out, it defaults to the
// start_url's own directory, so /dashboard would be the whole app as far
// as iOS is concerned and tapping through to /library would count as
// leaving it — which iOS answers by throwing the page into an in-app
// browser on top of the app. "/" keeps every page of the dashboard inside.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Colo Cloud",
    short_name: "Colo Cloud",
    description: "Digital signage control for event venue screens",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#1c1c1e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
