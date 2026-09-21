import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
});

const { signPlatformSession, verifyPlatformSession } = await import("@/lib/platform-session");
const { signSession, verifySession } = await import("@/lib/session");

/**
 * The console's separation rests on these: the two session kinds are signed
 * with the same key, so each verifier MUST refuse the other's token.
 */
describe("platform vs shop sessions", () => {
  it("round-trips a platform session", async () => {
    const token = await signPlatformSession({ adminId: "pa1", email: "ops@x.co", pv: 5 });
    expect(await verifyPlatformSession(token)).toEqual({ adminId: "pa1", email: "ops@x.co", pv: 5 });
  });

  it("refuses a shop owner's session at the console", async () => {
    const shop = await signSession({ userId: "u1", shopId: "s1", role: "OWNER", name: "Dana", email: "ops@x.co", pv: 0 });
    expect(await verifyPlatformSession(shop)).toBeNull();
  });

  it("refuses a platform session in the shop app", async () => {
    const platform = await signPlatformSession({ adminId: "pa1", email: "ops@x.co", pv: 0 });
    expect(await verifySession(platform)).toBeNull();
  });

  it("refuses garbage and tampering", async () => {
    const token = await signPlatformSession({ adminId: "pa1", email: "ops@x.co", pv: 0 });
    expect(await verifyPlatformSession(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifyPlatformSession("nope")).toBeNull();
    expect(await verifyPlatformSession(undefined)).toBeNull();
  });
});
