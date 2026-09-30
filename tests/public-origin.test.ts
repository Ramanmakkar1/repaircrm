import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin } from "@/lib/comms/config";

afterEach(() => vi.unstubAllEnvs());
describe("public redirects behind the VPS proxy", () => {
  it("keeps Google, portal and logout destinations on the configured HTTPS domain", () => {
    vi.stubEnv("APP_URL", "https://repairshelper.com/");
    const origin = appOrigin("https://localhost:3020/api/auth/google/callback?code=example");
    for (const path of ["/dashboard", "/login", "/portal/home"]) {
      expect(new URL(path, origin).toString()).toBe(`https://repairshelper.com${path}`);
    }
    expect(appOrigin("https://attacker.example/")).toBe("https://repairshelper.com");
  });
  it("supports the public fallback and unconfigured development origins", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://repairshelper.com");
    expect(appOrigin("http://127.0.0.1:3020/logout")).toBe("https://repairshelper.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appOrigin("http://127.0.0.1:3020/logout")).toBe("http://127.0.0.1:3020");
  });
});
