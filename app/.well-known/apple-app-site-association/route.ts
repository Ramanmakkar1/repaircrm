import {
  APPLE_TEAM_ID,
  NATIVE_APP_ID,
  NATIVE_LINK_PATHS,
  placeholder,
} from "@/lib/native-app";

/**
 * GET /.well-known/apple-app-site-association — lets iOS open
 * https://repairshelper.com links for the staff app in the Repairs helper app
 * (Universal Links). Apple fetches it through its CDN when the app is
 * installed; it must be JSON at exactly this path, with no redirect.
 *
 * 404 until APPLE_TEAM_ID in lib/native-app.ts is filled in (TODO for the owner).
 */
export const dynamic = "force-static";

export function GET(): Response {
  if (placeholder(APPLE_TEAM_ID)) return new Response("Not found", { status: 404 });

  const body = {
    applinks: {
      details: [
        {
          appIDs: [`${APPLE_TEAM_ID}.${NATIVE_APP_ID}`],
          components: NATIVE_LINK_PATHS.flatMap((path) => [
            { "/": path },
            { "/": `${path}/*` },
          ]),
        },
      ],
    },
  };

  return Response.json(body, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
