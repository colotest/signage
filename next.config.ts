import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Media files are resized by their own route, which checks who's
    // asking first (src/app/m/[...path]/route.ts) — not by Next's
    // optimizer, which fetches without the viewer's cookies and shares
    // what it made with anyone. See src/lib/media/imageLoader.ts.
    loader: "custom",
    loaderFile: "./src/lib/media/imageLoader.ts",
  },
  // The fonts the Übergabeprotokoll's PDF is set in (src/lib/handoverPdf.ts),
  // read from disk by the Events page's server actions: shipped with it.
  outputFileTracingIncludes: { "/events": ["./src/fonts/**"] },
  // The Events page was the Forms page: old links and bookmarks still get
  // there, the event they had open and all (the query carries over).
  async redirects() {
    return [{ source: "/forms/:path*", destination: "/events/:path*", permanent: false }];
  },
  // The brand font, as emails load it (src/lib/email/templates.ts): from
  // whatever origin a webmail shows it on, which fonts need leave for.
  async headers() {
    return [{ source: "/email/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
};

export default nextConfig;
