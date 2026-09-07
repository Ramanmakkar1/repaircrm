import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

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

const { setAppointmentStatusAction } = await import(
  "@/app/(app)/appointments/actions"
);

const APPT = "appt_1";
const TECH = "user_tech";
const START = new Date("2026-09-10T15:00:00.000Z");
const END = new Date("2026-09-10T16:00:00.000Z");

function stubCurrent(over: Record<string, unknown> = {}) {
  handlers["appointment.findFirst"] = (args) => {
    // The second findFirst in an un-cancel is the conflict search; it carries a
    // status filter, which is how the two are told apart here.
    const where = (args.where ?? {}) as Record<string, unknown>;
    if ("startsAt" in where) return null; // no clash unless a test says so
    return {
      status: "CANCELED",
      assignedToId: TECH,
      startsAt: START,
      endsAt: END,
      ...over,
    };
  };
  handlers["appointment.updateMany"] = () => ({ count: 1 });
}

beforeEach(() => {
  resetDb();
  session.shopId = "shop_1";
});

/**
 * REINSTATING A CANCELED APPOINTMENT IS A BOOKING.
 *
 * `findConflict` excludes CANCELED rows — correctly, a canceled slot is free.
 * The consequence is that the slot really does become bookable the moment it is
 * canceled, so bringing the appointment back has to ask again. Both paths that
 * do it are quiet ones: the Reopen button, and the Undo on the cancel toast,
 * which fires seconds later when nothing looks like it could have changed.
 */
describe("setAppointmentStatusAction — un-cancelling re-checks the slot", () => {
  it("refuses to reinstate over another booking, and writes nothing", async () => {
    handlers["appointment.findFirst"] = (args) => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if ("startsAt" in where) {
        return {
          id: "appt_other",
          title: "Battery swap",
          startsAt: START,
          endsAt: END,
          assignedTo: { name: "Marcus Webb" },
          customer: { firstName: "Ana", lastName: "Diaz", businessName: null },
        };
      }
      return {
        status: "CANCELED",
        assignedToId: TECH,
        startsAt: START,
        endsAt: END,
      };
    };
    handlers["appointment.updateMany"] = () => ({ count: 1 });

    const result = await setAppointmentStatusAction(APPT, "SCHEDULED");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Marcus Webb");
    expect(callsTo("appointment.updateMany")).toHaveLength(0);
  });

  it("reinstates when the slot is still free", async () => {
    stubCurrent();

    const result = await setAppointmentStatusAction(APPT, "SCHEDULED");

    expect(result).toEqual({ ok: true });
    expect(dataOf("appointment.updateMany").status).toBe("SCHEDULED");
  });

  it("excludes the appointment itself from its own conflict search", async () => {
    // Without this it would collide with the row it is about to reinstate.
    stubCurrent();

    await setAppointmentStatusAction(APPT, "SCHEDULED");

    const search = callsTo("appointment.findFirst")[1];
    expect(search).toBeDefined();
    expect((search.args.where as Record<string, unknown>).id).toEqual({
      not: APPT,
    });
  });

  it("does not check when the appointment was not canceled", async () => {
    // Moving SCHEDULED -> DONE releases a slot; asking would be pure latency.
    stubCurrent({ status: "SCHEDULED" });

    const result = await setAppointmentStatusAction(APPT, "DONE");

    expect(result).toEqual({ ok: true });
    expect(callsTo("appointment.findFirst")).toHaveLength(1);
  });

  it("does not check when moving TO canceled", async () => {
    // Cancelling only ever frees a slot, so it reads nothing at all.
    handlers["appointment.updateMany"] = () => ({ count: 1 });

    const result = await setAppointmentStatusAction(APPT, "CANCELED");

    expect(result).toEqual({ ok: true });
    expect(callsTo("appointment.findFirst")).toHaveLength(0);
  });

  it("scopes every read and the write to the session's shop", async () => {
    stubCurrent();
    session.shopId = "shop_2";

    await setAppointmentStatusAction(APPT, "SCHEDULED");

    for (const call of callsTo("appointment.findFirst")) {
      expect((call.args.where as Record<string, unknown>).shopId).toBe("shop_2");
    }
    expect(whereOf("appointment.updateMany").shopId).toBe("shop_2");
  });

  it("reports a missing appointment rather than reinstating nothing", async () => {
    handlers["appointment.findFirst"] = () => null;
    handlers["appointment.updateMany"] = () => ({ count: 0 });

    const result = await setAppointmentStatusAction(APPT, "SCHEDULED");

    expect(result).toEqual({ ok: false, error: "Appointment not found." });
    expect(callsTo("appointment.updateMany")).toHaveLength(0);
  });
});
