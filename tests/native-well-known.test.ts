import { describe, expect, it, vi } from "vitest";

describe("app deep-link files", () => {
  it("answer 404 while the Team ID and fingerprint are still placeholders", async () => {
    const aasa = await import("@/app/.well-known/apple-app-site-association/route");
    const links = await import("@/app/.well-known/assetlinks.json/route");
    expect(aasa.GET().status).toBe(404);
    expect(links.GET().status).toBe(404);
  });

  it("name the app once the owner fills them in", async () => {
    vi.resetModules();
    vi.doMock("@/lib/native-app", async (original) => ({
      ...(await original<typeof import("@/lib/native-app")>()),
      APPLE_TEAM_ID: "ABCDE12345",
      ANDROID_CERT_SHA256: ["AA:BB"],
    }));
    const aasa = await import("@/app/.well-known/apple-app-site-association/route");
    const links = await import("@/app/.well-known/assetlinks.json/route");

    const apple = await aasa.GET().json();
    expect(apple.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.repairshelper.app"]);
    expect(apple.applinks.details[0].components).toContainEqual({ "/": "/tickets/*" });

    const android = await links.GET().json();
    expect(android[0].target).toEqual({
      namespace: "android_app",
      package_name: "com.repairshelper.app",
      sha256_cert_fingerprints: ["AA:BB"],
    });
    vi.doUnmock("@/lib/native-app");
  });
});
