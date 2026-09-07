import { beforeEach, describe, expect, it, vi } from "vitest";

import { calls, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/events", () => ({
  emitTicketEvent: vi.fn(async () => {}),
  emitInvoiceEvent: vi.fn(async () => {}),
  emitPaymentEvent: vi.fn(async () => {}),
  emitLeadEvent: vi.fn(async () => {}),
}));

const { deleteTicketAction } = await import("@/app/(app)/tickets/actions");
const { deleteLeadAction } = await import("@/app/(app)/leads/actions");
const { deleteWebhookAction, setWebhookActiveAction } = await import(
  "@/app/(app)/settings/webhook-actions"
);

/**
 * THE `id: undefined` FOOTGUN.
 *
 * Prisma omits undefined fields from a `where`, so this:
 *
 *     deleteMany({ where: { id: someId, shopId } })
 *
 * does not delete nothing when `someId` is undefined. It deletes THE SHOP'S
 * ENTIRE TABLE, in one query, with no error — and the `shopId` filter that
 * makes the query look careful is exactly what makes it look like it worked.
 *
 * This codebase has already shipped this bug once, in
 * `deleteCannedResponseAction`, where it would have emptied a shop's saved
 * replies. These tests exist because a guard is invisible: nothing about the
 * call site changes when someone deletes the `if`, and no other test would
 * notice, because every other test passes a real id.
 *
 * Each case asserts `calls` is EMPTY rather than merely "no delete happened" —
 * a guard that still issued the read would be both a wasted query and, on a
 * findFirst, an existence oracle.
 */

/** The values a bad call actually arrives with in practice. */
const MISSING = [undefined, null, "", 0, false, {}, []] as const;

beforeEach(() => {
  resetDb();
  session.shopId = "shop_1";
});

describe("deleteTicketAction", () => {
  it("issues no query at all when the id is missing", async () => {
    for (const bad of MISSING) {
      resetDb();
      // Registered so that a regression DELETES rather than throwing — the
      // test has to fail on the write, not on a missing handler.
      handlers["ticket.findFirst"] = () => ({ number: 1042 });
      handlers["ticket.deleteMany"] = () => ({ count: 99 });

      await deleteTicketAction(bad as unknown as string);

      expect(calls, `id=${JSON.stringify(bad)}`).toEqual([]);
    }
  });

  it("still deletes when given a real id", async () => {
    handlers["ticket.findFirst"] = () => ({ number: 1042 });
    handlers["ticket.deleteMany"] = () => ({ count: 1 });

    // The action ends in `redirect("/tickets")`, and Next implements redirect
    // by throwing — so the throw IS the success path here. Swallowing it and
    // asserting on the recorded queries is the only way to see what happened
    // before it fired.
    await expect(deleteTicketAction("ticket_1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(calls.map((c) => c.path)).toContain("ticket.deleteMany");
  });
});

describe("deleteLeadAction", () => {
  it("issues no query at all when the id is missing", async () => {
    for (const bad of MISSING) {
      resetDb();
      handlers["lead.deleteMany"] = () => ({ count: 99 });

      const result = await deleteLeadAction(bad as unknown as string);

      expect(result.ok, `id=${JSON.stringify(bad)}`).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it("still deletes when given a real id", async () => {
    handlers["lead.deleteMany"] = () => ({ count: 1 });

    const result = await deleteLeadAction("lead_1");

    expect(result).toEqual({ ok: true });
  });
});

describe("deleteWebhookAction", () => {
  it("issues no query at all when the id is missing", async () => {
    for (const bad of MISSING) {
      resetDb();
      handlers["webhook.deleteMany"] = () => ({ count: 99 });

      const result = await deleteWebhookAction(bad as unknown as string);

      expect(result.ok, `id=${JSON.stringify(bad)}`).toBe(false);
      expect(calls).toEqual([]);
    }
  });
});

describe("setWebhookActiveAction", () => {
  it("issues no query at all when the id is missing", async () => {
    // Not destructive in the delete sense, but an undefined id here silently
    // switches EVERY endpoint the shop has on or off — which for a shop
    // relying on webhooks is an outage nobody triggered.
    for (const bad of MISSING) {
      resetDb();
      handlers["webhook.updateMany"] = () => ({ count: 99 });

      const result = await setWebhookActiveAction(
        bad as unknown as string,
        false,
      );

      expect(result.ok, `id=${JSON.stringify(bad)}`).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it("still flips one endpoint when given a real id", async () => {
    handlers["webhook.updateMany"] = () => ({ count: 1 });

    const result = await setWebhookActiveAction("wh_1", false);

    expect(result).toEqual({ ok: true });
  });
});
