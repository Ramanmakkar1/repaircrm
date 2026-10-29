import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/session", () => ({ readSessionCookie: async () => null, setSessionCookie: vi.fn(), clearSessionCookie: vi.fn() }));

import { hashPassword, login, SHOP_DELETION_PENDING_MESSAGE } from "@/lib/auth";

/**
 * A shop scheduled for deletion switches every login off. The owner typing the
 * RIGHT password is told why (and pointed at "Keep my shop"); a wrong password
 * still says nothing about the account.
 */
let n = 0;
let user: Record<string, unknown>;
beforeEach(async () => {
  resetDb();
  n += 1;
  user = { id: "u1", shopId: "s1", email: `owner${n}@example.test`, active: false, totpEnabledAt: null, passwordHash: await hashPassword("right-password-1") };
  handlers["user.findUnique"] = () => user;
  handlers["shop.findUnique"] = () => ({ deletionRequestedAt: new Date("2026-10-20"), deletionSuspendedUserIds: ["u1"] });
});

describe("signing in to a shop that is scheduled for deletion", () => {
  it("says the shop is scheduled for deletion when the password is right", async () => {
    expect(await login(user.email as string, "right-password-1")).toEqual({ status: "shop-deletion-pending", error: SHOP_DELETION_PENDING_MESSAGE });
  });

  it("reveals nothing for a wrong password, and does not even look at the shop", async () => {
    expect(await login(user.email as string, "wrong-password-1")).toEqual({ status: "error", error: "Incorrect email or password." });
    expect(callsTo("shop.findUnique")).toHaveLength(0);
  });

  it("keeps the generic answer for a login an owner had switched off before", async () => {
    handlers["shop.findUnique"] = () => ({ deletionRequestedAt: new Date("2026-10-20"), deletionSuspendedUserIds: [] });
    expect(await login(user.email as string, "right-password-1")).toEqual({ status: "error", error: "Incorrect email or password." });
  });

  it("keeps the generic answer for a switched-off login in a shop that is not being deleted", async () => {
    handlers["shop.findUnique"] = () => ({ deletionRequestedAt: null, deletionSuspendedUserIds: [] });
    expect(await login(user.email as string, "right-password-1")).toEqual({ status: "error", error: "Incorrect email or password." });
  });
});
