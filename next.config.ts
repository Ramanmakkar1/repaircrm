import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker / bare-VPS deploys
  // (node .next/standalone/server.js). `npm run start` keeps working too.
  output: "standalone",

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The service worker must never be served from cache. A browser that
        // holds onto an old sw.js keeps serving whatever that version cached —
        // for as long as its own heuristic freshness lifetime, which for a
        // static file with no headers can be hours. `no-cache` (revalidate
        // every time), not `no-store`, so the update check is a cheap 304.
        //
        // `Service-Worker-Allowed: /` lets a worker served from /sw.js control
        // the whole origin, which is the scope public/sw.js assumes.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
