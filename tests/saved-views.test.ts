import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@prisma/client";

import {
  SAVED_VIEW_LIMIT,
  isSavedViewPath,
  normalizeViewQuery,
  savedViewHref,
} from "@/lib/saved-views";

import { calls, callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * The session, mutable so a test can point it at another tenant.
 *
 * That is the load-bearing trick: neither action ACCEPTS a shopId or a userId,
 * so the only honest way to prove the filter comes from the session is to move
 * the session and watch every `where` follow it.
 */
const session = { shopId: "shop_1", userId: "user_1", role: "OWNER" };

vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
}));

const { createSavedViewAction, deleteSavedViewAction } = await import(
  "@/app/(app)/saved-views-actions"
);

beforeEach(() => {
  resetDb();
  session.shopId = "shop_1";
  session.userId = "user_1";
});

/* ------------------------------------------------------------------ pure -- */

describe("normalizeViewQuery", () => {
  it("sorts params so one filter has one representation", () => {
    expect(normalizeViewQuery("tech=b&status=a")).toBe(
      normalizeViewQuery("status=a&tech=b"),
    );
  });

  it("drops position, which is not a filter", () => {
    // A view saved from page 3 must not always reopen on page 3.
    expect(normalizeViewQuery("status=open&page=3&cursor=abc")).toBe(
      "status=open",
    );
  });

  it("drops empty values, so a cleared filter is not part of the identity", () => {
    expect(normalizeViewQuery("status=open&q=")).toBe("status=open");
  });

  it("tolerates a leading question mark and an empty string", () => {
    expect(normalizeViewQuery("?status=open")).toBe("status=open");
    expect(normalizeViewQuery("")).toBe("");
  });
});

describe("savedViewHref", () => {
  it("omits the ? when there is nothing to ask", () => {
    expect(savedViewHref("/tickets", "")).toBe("/tickets");
    expect(savedViewHref("/tickets", "status=x")).toBe("/tickets?status=x");
  });
});

describe("isSavedViewPath", () => {
  it("accepts only the screens that have the feature", () => {
    expect(isSavedViewPath("/tickets")).toBe(true);
    expect(isSavedViewPath("/invoices")).toBe(true);
    expect(isSavedViewPath("/leads")).toBe(true);
  });

  it("rejects anything else, including near misses", () => {
    for (const bad of ["/settings", "/tickets/", "tickets", "", "/../tickets"]) {
      expect(isSavedViewPath(bad)).toBe(false);
    }
  });
});

/* ---------------------------------------------------------------- create -- */

describe("createSavedViewAction", () => {
  function allowCreate() {
    handlers["savedView.count"] = () => 0;
    handlers["savedView.create"] = () => ({ id: "view_1" });
  }

  it("writes the view scoped to the session's shop AND user", async () => {
    allowCreate();

    const result = await createSavedViewAction({
      path: "/tickets",
      name: "Parts queue",
      query: "status=Waiting+for+Parts",
    });

    expect(result).toEqual({ ok: true });
    const data = dataOf("savedView.create");
    expect(data.shopId).toBe("shop_1");
    expect(data.userId).toBe("user_1");
    expect(data.path).toBe("/tickets");
    expect(data.name).toBe("Parts queue");
  });

  it("takes its scope from the session, not from anything the caller sent", async () => {
    allowCreate();
    session.shopId = "shop_2";
    session.userId = "user_9";

    await createSavedViewAction({
      path: "/tickets",
      name: "Mine",
      query: "status=x",
    });

    const data = dataOf("savedView.create");
    expect(data.shopId).toBe("shop_2");
    expect(data.userId).toBe("user_9");
    // and the count that gates the limit follows too
    expect(whereOf("savedView.count").userId).toBe("user_9");
  });

  it("normalises the query before storing it", async () => {
    allowCreate();

    await createSavedViewAction({
      path: "/tickets",
      name: "Sorted",
      query: "tech=b&status=a&page=4",
    });

    expect(dataOf("savedView.create").query).toBe("status=a&tech=b");
  });

  it("refuses a path that is not a saved-view screen, and writes NOTHING", async () => {
    allowCreate();

    for (const path of ["/settings", "/dashboard", "", "../tickets"]) {
      resetDb();
      allowCreate();
      const result = await createSavedViewAction({
        path,
        name: "Sneaky",
        query: "a=1",
      });
      expect(result.ok).toBe(false);
      // Not merely "no create": no query at all. A refusal that still counted
      // rows would be an existence oracle for another user's data.
      expect(calls).toEqual([]);
    }
  });

  it("refuses an empty or whitespace name before touching the database", async () => {
    allowCreate();

    for (const name of ["", "   ", "\t\n"]) {
      resetDb();
      allowCreate();
      const result = await createSavedViewAction({
        path: "/tickets",
        name,
        query: "status=x",
      });
      expect(result).toEqual({ ok: false, error: "Give the view a name." });
      expect(calls).toEqual([]);
    }
  });

  it("truncates an over-long name rather than refusing it", async () => {
    allowCreate();

    await createSavedViewAction({
      path: "/tickets",
      name: "x".repeat(200),
      query: "status=x",
    });

    expect(String(dataOf("savedView.create").name)).toHaveLength(40);
  });

  it("refuses once the per-screen limit is reached, and does not create", async () => {
    handlers["savedView.count"] = () => SAVED_VIEW_LIMIT;
    handlers["savedView.create"] = () => ({ id: "nope" });

    const result = await createSavedViewAction({
      path: "/tickets",
      name: "One too many",
      query: "status=x",
    });

    expect(result.ok).toBe(false);
    expect(callsTo("savedView.create")).toHaveLength(0);
  });

  it("turns a unique-constraint collision into a readable message", async () => {
    // The index is the authority on duplicates, not a pre-check — a pre-check
    // races with the same person saving from a second tab.
    handlers["savedView.count"] = () => 0;
    handlers["savedView.create"] = () => {
      throw new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`userId`,`path`,`name`)",
        { code: "P2002", clientVersion: "6.19.3" },
      );
    };

    const result = await createSavedViewAction({
      path: "/tickets",
      name: "Parts queue",
      query: "status=x",
    });

    expect(result).toEqual({
      ok: false,
      error: 'You already have a view called "Parts queue".',
    });
  });
});

/* ---------------------------------------------------------------- delete -- */

describe("deleteSavedViewAction", () => {
  it("deletes only a view owned by this user in this shop", async () => {
    handlers["savedView.deleteMany"] = () => ({ count: 1 });

    const result = await deleteSavedViewAction("view_1");

    expect(result).toEqual({ ok: true });
    expect(whereOf("savedView.deleteMany")).toEqual({
      id: "view_1",
      userId: "user_1",
      shopId: "shop_1",
    });
  });

  it("reports a colleague's view as simply not there", async () => {
    // deleteMany with the ownership filter matches nothing, which is
    // indistinguishable from "already gone" — no existence oracle.
    handlers["savedView.deleteMany"] = () => ({ count: 0 });

    const result = await deleteSavedViewAction("someone_elses_view");

    expect(result).toEqual({ ok: false, error: "That view no longer exists." });
  });

  it("refuses a missing id and issues NO query at all", async () => {
    // Prisma reads `id: undefined` as "no filter": an unguarded deleteMany
    // here would wipe every saved view this user has. The same shape has
    // already caused a real bug in this codebase (canned responses).
    handlers["savedView.deleteMany"] = () => ({ count: 99 });

    for (const bad of ["", undefined, null, 0, {}]) {
      resetDb();
      handlers["savedView.deleteMany"] = () => ({ count: 99 });
      const result = await deleteSavedViewAction(bad as unknown as string);
      expect(result.ok).toBe(false);
      expect(calls).toEqual([]);
    }
  });
});
