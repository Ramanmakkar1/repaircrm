import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteCannedResponseAction } from "@/app/(app)/tickets/actions";
import { restoreChecklistAction } from "@/app/(app)/tickets/checklist-actions";
import { setChecklistTemplateActiveAction } from "@/app/(app)/settings/checklist-actions";

import { calls, callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

/**
 * `vi.hoisted` because `vi.mock`'s factory is lifted above the imports: a plain
 * `const` declared here would not exist yet when the factory runs. Tests reach
 * in and change `session.role` to exercise the owner guard.
 */
const auth = vi.hoisted(() => ({
  session: {
    userId: "user_1",
    shopId: "shop_1",
    role: "OWNER",
    name: "Dana",
    email: "dana@example.com",
    pv: 0,
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => auth.session,
  requireRole: async () => auth.session,
}));

/**
 * THE TWO WRITES THAT MAKE "UNDO" TRUE INSTEAD OF DECORATIVE.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE TWO
 * ---------------------------------------------------------------------------
 * `components/ui/undo-toast.ts` states the contract in one line: an Undo button
 * that cannot bring the record back is a lie, and worse than no button at all.
 * Two destructive gestures were converted from a confirm dialog to that toast,
 * and each needed a server-side reverse that did not exist before:
 *
 *   removing a ticket's checklist   → restoreChecklistAction
 *   deleting a checklist template   → setChecklistTemplateActiveAction
 *
 * So the properties asserted below are the ones the UI is now promising:
 *
 *   1. the reverse puts back what was ACTUALLY there — the ticks and their
 *      timestamps, not a fresh copy of the template;
 *   2. it refuses rather than clobbers when the world moved on underneath the
 *      toast;
 *   3. it cannot be steered across a tenant boundary by any argument, because
 *      an undo is an id that came from a browser and went back to the server;
 *   4. the template "delete" retires instead of deleting, which is the whole
 *      reason its undo can be honest at all — a re-create would mint a new id
 *      and orphan every `Ticket.checklistTemplateId` pointing at the old one.
 */

const SHOP = "shop_1";

beforeEach(() => {
  resetDb();
  auth.session.role = "OWNER";
});

// ---------------------------------------------------------------------------
// restoreChecklistAction — the reverse of "Checklist removed."
// ---------------------------------------------------------------------------

/** A ticket in this shop whose checklist has just been removed. */
function stubEmptyTicket(): void {
  handlers["ticket.findFirst"] = (args) => {
    const where = (args.where ?? {}) as { shopId?: string };
    return where.shopId === SHOP ? { id: "tkt_1", checklist: null } : null;
  };
  handlers["ticket.update"] = () => ({ id: "tkt_1" });
}

const SAVED: { label: string; done: boolean; doneAt: string | null }[] = [
  { label: "Back up user data", done: true, doneAt: "2026-09-05T10:00:00.000Z" },
  { label: "Replace screen", done: true, doneAt: "2026-09-05T11:30:00.000Z" },
  { label: "QC pass before return", done: false, doneAt: null },
];

describe("restoreChecklistAction — it restores, it does not re-attach", () => {
  it("writes the ticks and their timestamps back, not a blank copy", async () => {
    // The distinction this test exists for: attaching the template again would
    // have produced three unticked rows. An Undo that silently unticks two
    // completed steps is worse than the removal it claimed to fix.
    stubEmptyTicket();
    handlers["checklistTemplate.findFirst"] = () => ({ id: "tpl_1" });

    const result = await restoreChecklistAction("tkt_1", SAVED, "tpl_1");

    expect(result.ok).toBe(true);
    expect(dataOf("ticket.update")).toEqual({
      checklist: SAVED,
      checklistTemplateId: "tpl_1",
    });
  });

  it("re-parses the rows instead of trusting them", async () => {
    // They made a round trip through a browser. `parseChecklist` is the same
    // gate the read path uses: a blank label is dropped, `done` is coerced to a
    // real boolean, and a non-string `doneAt` becomes null.
    stubEmptyTicket();

    const result = await restoreChecklistAction(
      "tkt_1",
      [
        { label: "  Keep me  ", done: "yes", doneAt: 12345 },
        { label: "   ", done: true },
        "not an object",
      ] as never,
      null,
    );

    expect(result.ok).toBe(true);
    expect(dataOf("ticket.update")).toEqual({
      checklist: [{ label: "Keep me", done: false, doneAt: null }],
      checklistTemplateId: null,
    });
  });

  it("refuses an empty restore without touching the database", async () => {
    const result = await restoreChecklistAction("tkt_1", [], null);

    expect(result).toEqual({ error: "There is no checklist to put back." });
    expect(calls).toEqual([]);
  });

  it("refuses when a different checklist arrived while the toast was up", async () => {
    // Eight seconds is long enough for somebody to attach a new list. An undo
    // that overwrites newer work is not an undo.
    handlers["ticket.findFirst"] = () => ({
      id: "tkt_1",
      checklist: [{ label: "Someone else's list", done: false }],
    });

    const result = await restoreChecklistAction("tkt_1", SAVED, "tpl_1");

    expect(result).toEqual({ error: "This ticket already has a checklist on it." });
    expect(callsTo("ticket.update")).toEqual([]);
  });
});

describe("restoreChecklistAction — tenancy", () => {
  it("scopes the ticket read to the session's shop", async () => {
    stubEmptyTicket();

    await restoreChecklistAction("tkt_1", SAVED, null);

    expect(whereOf("ticket.findFirst")).toEqual({ id: "tkt_1", shopId: SHOP });
  });

  it("writes nothing for a ticket id belonging to another shop", async () => {
    handlers["ticket.findFirst"] = () => null;

    const result = await restoreChecklistAction("tkt_from_shop_2", SAVED, "tpl_1");

    expect(result).toEqual({ error: "Ticket not found." });
    expect(callsTo("ticket.update")).toEqual([]);
    // Refused before the template was even looked up.
    expect(callsTo("checklistTemplate.findFirst")).toEqual([]);
  });

  it("scopes the template lookup, so a foreign id cannot be attached", async () => {
    stubEmptyTicket();
    handlers["checklistTemplate.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { shopId?: string };
      return where.shopId === SHOP ? { id: "tpl_1" } : null;
    };

    await restoreChecklistAction("tkt_1", SAVED, "tpl_1");

    expect(whereOf("checklistTemplate.findFirst")).toEqual({
      id: "tpl_1",
      shopId: SHOP,
    });
  });

  it("drops an unresolvable template id rather than failing the restore", async () => {
    // The template may have been retired — or the id may belong to another
    // tenant. Either way the STEPS are the substance and go back; the pointer
    // is provenance and is simply not written.
    stubEmptyTicket();
    handlers["checklistTemplate.findFirst"] = () => null;

    const result = await restoreChecklistAction("tkt_1", SAVED, "tpl_from_shop_2");

    expect(result.ok).toBe(true);
    expect(dataOf("ticket.update")).toEqual({
      checklist: SAVED,
      checklistTemplateId: null,
    });
  });

  it("skips the template query entirely when there was no template", async () => {
    stubEmptyTicket();

    await restoreChecklistAction("tkt_1", SAVED, null);

    expect(callsTo("checklistTemplate.findFirst")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// setChecklistTemplateActiveAction — "deleting" a template, and undoing it
// ---------------------------------------------------------------------------

function stubScopedTemplateUpdate(): void {
  handlers["checklistTemplate.updateMany"] = (args) => {
    const where = (args.where ?? {}) as { shopId?: string };
    return { count: where.shopId === SHOP ? 1 : 0 };
  };
}

describe("setChecklistTemplateActiveAction", () => {
  it("retires rather than deletes, so the id survives for the undo", async () => {
    // The reason this is an update and not a `deleteMany`: `Ticket
    // .checklistTemplateId` references this row with `onDelete: SetNull`, so a
    // delete-then-re-create would come back with a new id and every ticket
    // built from this checklist would have lost its provenance. A boolean
    // keeps the id, which is what makes the undo below honest.
    stubScopedTemplateUpdate();

    const result = await setChecklistTemplateActiveAction("tpl_1", false);

    expect(result).toEqual({ ok: true });
    expect(callsTo("checklistTemplate.deleteMany")).toEqual([]);
    expect(whereOf("checklistTemplate.updateMany")).toEqual({
      id: "tpl_1",
      shopId: SHOP,
    });
    expect(dataOf("checklistTemplate.updateMany")).toEqual({ active: false });
  });

  it("is its own reverse", async () => {
    stubScopedTemplateUpdate();

    const result = await setChecklistTemplateActiveAction("tpl_1", true);

    expect(result).toEqual({ ok: true });
    expect(dataOf("checklistTemplate.updateMany")).toEqual({ active: true });
  });

  it("refuses a blank id without touching the database", async () => {
    // Prisma reads `id: undefined` as "no filter", so a malformed call would
    // otherwise retire every checklist in the shop.
    for (const id of ["", undefined, null]) {
      resetDb();
      const result = await setChecklistTemplateActiveAction(id as never, false);
      expect(result, String(id)).toEqual({
        ok: false,
        error: "That checklist no longer exists.",
      });
      expect(calls, String(id)).toEqual([]);
    }
  });

  it("writes nothing for a template belonging to another shop", async () => {
    // The scoped `updateMany` IS the ownership check — a foreign id matches
    // zero rows and reads back as "gone", not as a different error, so the
    // endpoint cannot be used to probe for ids.
    handlers["checklistTemplate.updateMany"] = () => ({ count: 0 });

    const result = await setChecklistTemplateActiveAction("tpl_from_shop_2", false);

    expect(result).toEqual({ ok: false, error: "That checklist no longer exists." });
  });

  it("refuses a non-owner before any query runs", async () => {
    auth.session.role = "TECH";
    stubScopedTemplateUpdate();

    const result = await setChecklistTemplateActiveAction("tpl_1", false);

    expect(result).toEqual({
      ok: false,
      error: "Only an owner can manage checklists.",
    });
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteCannedResponseAction — the guard that makes the undo path safe to call
// ---------------------------------------------------------------------------

describe("deleteCannedResponseAction", () => {
  it("deletes exactly one response, scoped to the session's shop", async () => {
    handlers["cannedResponse.deleteMany"] = () => ({ count: 1 });

    await deleteCannedResponseAction("cr_1");

    expect(whereOf("cannedResponse.deleteMany")).toEqual({
      id: "cr_1",
      shopId: SHOP,
    });
  });

  it("does nothing at all for a blank id", async () => {
    // This one is worth its own test: the ticket-side manager now calls this
    // from a click handler rather than a bound form action, and Prisma reads
    // `id: undefined` as "no filter" — so an unguarded call here would empty
    // the shop's whole canned-response list in one query.
    handlers["cannedResponse.deleteMany"] = () => ({ count: 99 });

    for (const id of ["", undefined, null]) {
      resetDb();
      handlers["cannedResponse.deleteMany"] = () => ({ count: 99 });

      await deleteCannedResponseAction(id as never);

      expect(calls, String(id)).toEqual([]);
    }
  });
});
