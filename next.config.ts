import type { NextConfig } from "next";

const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;

const nextConfig: NextConfig = {
  images: {
    // Dashboard/library thumbnails (MediaThumb) are resized from the public
    // media bucket.
    remotePatterns: [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/media/**" }],
    formats: ["image/webp"],
    // Uploads never change in place — replacing a file writes a new
    // storage path — so a resized copy can be kept as long as allowed.
    // (Supabase serves them as no-cache, which would otherwise make every
    // copy expire after the 4h default.)
    minimumCacheTTL: 2678400, // 31 days
  },
};

export default nextConfig;
