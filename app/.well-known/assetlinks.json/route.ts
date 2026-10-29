import { ANDROID_CERT_SHA256, NATIVE_APP_ID, placeholder } from "@/lib/native-app";

/**
 * GET /.well-known/assetlinks.json — Digital Asset Links, which is what lets
 * Android verify the app's `autoVerify` intent filter and open
 * https://repairshelper.com links in the app without a chooser (App Links).
 *
 * 404 until ANDROID_CERT_SHA256 in lib/native-app.ts holds a real fingerprint
 * (TODO for the owner).
 */
export const dynamic = "force-static";

export function GET(): Response {
  const fingerprints = ANDROID_CERT_SHA256.filter((value) => !placeholder(value));
  if (fingerprints.length === 0) return new Response("Not found", { status: 404 });

  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: NATIVE_APP_ID,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
