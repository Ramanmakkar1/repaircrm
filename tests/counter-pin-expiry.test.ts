import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeJwt } from "jose";
import { handlers, resetDb } from "./helpers/db-mock";
const jar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(), hashPassword: vi.fn(), verifyPassword: vi.fn() }));
import { requireUser } from "@/lib/auth";
import { signSession, verifySession, setSessionCookie, PIN_SESSION_MAX_AGE, type SessionUser } from "@/lib/session";
import { updateProfileNameAction } from "@/app/(app)/settings/profile-actions";
const session: SessionUser = { userId: "u1", shopId: "s1", role: "TECH", name: "Counter", email: "counter@example.test", pv: 0, pinv: "version" };
const now = Date.parse("2026-10-04T12:00:00Z") / 1000;
beforeEach(() => {
  resetDb(); vi.clearAllMocks(); vi.stubEnv("AUTH_SECRET", "isolated-pin-expiry-test-secret");
  vi.useFakeTimers(); vi.setSystemTime(new Date(now * 1000));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("caps default PIN tokens at eight hours", async () => {
  const token = await signSession(session);
  expect(decodeJwt(token).exp).toBe(now + PIN_SESSION_MAX_AGE);
  expect(await verifySession(token)).toMatchObject({ pinv: "version", pinExpiresAt: now + PIN_SESSION_MAX_AGE });
});
it("cannot extend the original PIN deadline by reissuing a cookie", async () => {
  await setSessionCookie({ ...session, pinExpiresAt: now + 600 });
  expect(jar.set.mock.calls[0][2]).toMatchObject({ maxAge: 600 });
  expect(decodeJwt(jar.set.mock.calls[0][1]).exp).toBe(now + 600);
});
it("keeps normal password sessions at seven days", async () => {
  const normal = { ...session, pinv: undefined };
  expect(decodeJwt(await signSession(normal)).exp).toBe(now + 7 * 24 * 60 * 60);
});
it("preserves PIN credentials and remaining lifetime when saving a display name", async () => {
  vi.mocked(requireUser).mockResolvedValue({ ...session, pinExpiresAt: now + 1200 });
  handlers["user.update"] = () => ({ id: "u1", shopId: "s1", role: "TECH", name: "New name", email: session.email, passwordChangedAt: null });
  const form = new FormData(); form.set("name", "New name");
  await updateProfileNameAction({ error: null }, form);
  expect(jar.set.mock.calls[0][2]).toMatchObject({ maxAge: 1200 });
  const payload = decodeJwt(jar.set.mock.calls[0][1]);
  expect(payload).toMatchObject({ name: "New name", pinv: "version", exp: now + 1200 });
});
