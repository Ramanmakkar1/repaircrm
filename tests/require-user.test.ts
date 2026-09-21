import { beforeEach, describe, expect, it, vi } from "vitest";

import { handlers, resetDb, whereOf } from "./helpers/db-mock";

/**
 * requireUser must not believe the seven-day session cookie on its own word:
 * a fired, demoted or password-changed account has to take effect on the very
 * next request — including server actions, which never pass through a layout.
 */

const { cookieSession } = vi.hoisted(() => ({
  cookieSession: {
    value: null as null | Record<string, unknown>,
  },
}));

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  readSessionCookie: vi.fn(async () => cookieSession.value),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/pending-2fa", () => ({ setPending2faCookie: vi.fn() }));

const { requireUser } = await import("@/lib/auth");

const cookie = {
  userId: "u1",
  shopId: "s1",
  role: "OWNER",
  name: "Dana",
  email: "old@example.com",
  pv: 1_700_000_000,
};

beforeEach(() => {
  resetDb();
  cookieSession.value = { ...cookie };
});

describe("requireUser", () => {
  it("sends a signed-out visitor to login without touching the database", async () => {
    cookieSession.value = null;
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("returns the database's role and email, not the cookie's", async () => {
    handlers["user.findFirst"] = () => ({
      active: true,
      role: "TECH",
      email: "new@example.com",
      passwordChangedAt: new Date(1_600_000_000_000),
    });

    const user = await requireUser();

    expect(user.role).toBe("TECH");
    expect(user.email).toBe("new@example.com");
    expect(whereOf("user.findFirst")).toEqual({ id: "u1", shopId: "s1" });
  });

  it("cuts off a deactivated account at once", async () => {
    handlers["user.findFirst"] = () => ({
      active: false,
      role: "OWNER",
      email: "x@example.com",
      passwordChangedAt: null,
    });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/session-expired?reason=inactive");
  });

  it("cuts off a session issued before the password changed", async () => {
    handlers["user.findFirst"] = () => ({
      active: true,
      role: "OWNER",
      email: "x@example.com",
      passwordChangedAt: new Date((cookie.pv + 60) * 1000),
    });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/session-expired?reason=password");
  });

  it("treats a deleted account as signed out", async () => {
    handlers["user.findFirst"] = () => null;
    await expect(requireUser()).rejects.toThrow("REDIRECT:/session-expired?reason=gone");
  });
});
