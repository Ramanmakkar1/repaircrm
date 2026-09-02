import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker / bare-VPS deploys
  // (node .next/standalone/server.js). `npm run start` keeps working too.
  output: "standalone",

  async headers() {
    return [
      {
        /*
         * FRAMING, DELIBERATELY SPLIT IN TWO
         * ----------------------------------
         * Everything EXCEPT the two public shop surfaces refuses to be framed
         * from another origin. That is what protects the staff app (/dashboard,
         * /tickets, /settings…) and the customer portal (/portal) from
         * clickjacking: an attacker's page cannot put a transparent invoice or
         * a "delete customer" button under the visitor's cursor.
         *
         * `frame-ancestors 'self'` is the rule browsers actually enforce today;
         * X-Frame-Options is kept beside it for the older ones. The negative
         * lookahead — not a second rule with the same header key — is what
         * exempts the hub, because two conflicting X-Frame-Options headers on
         * one response are resolved as DENY, which would break the embed.
         */
        source: "/:path((?!s/|checkin/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        /*
         * The public shop hub and the check-in desk MAY be framed by anyone —
         * that is the entire point of /embed.js, and we do not know (and must
         * not have to be told) which domain a shop's website lives on.
         *
         * What makes that safe is that neither page can act on a session:
         *   · The hub reads one shop by public slug and holds no cookie.
         *   · Check-in only ever CREATES a ticket for that shop.
         *   · The staff cookie is scoped away from both, and the portal cookie
         *     is `path=/portal`, so a framed hub cannot borrow either.
         * There is no privileged action here to trick a signed-in user into.
         */
        source: "/:path(s/.*|checkin/.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
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
