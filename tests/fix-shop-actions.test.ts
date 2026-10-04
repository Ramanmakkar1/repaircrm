import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ emitAppointmentEvent: vi.fn(), emitCustomerEvent: vi.fn() }));
vi.mock("@/lib/comms", () => ({ sendEmail: vi.fn(), sendSms: vi.fn() }));

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const { saveAppointmentAction, searchBookingCustomersAction, setAppointmentStatusAction } = await import(
  "@/app/(app)/appointments/actions"
);
const { updateTimeClockEntryAction } = await import("@/app/(app)/time-clock/actions");

function bookingForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    title: "Drop-off",
    customerId: "none",
    ticketId: "none",
    assignedToId: "none",
    locationId: "none",
    startDate: "2026-10-04",
    startTime: "09:00",
    duration: "60",
    endTime: "10:00",
    notes: "",
    ...over,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  resetDb();
  session.shopId = "shop_1";
  session.role = "OWNER";
  handlers["shop.findUnique"] = () => ({ timezone: "America/Edmonton" });
});

describe("booking a visit: the typed time is the SHOP'S wall clock", () => {
  it("stores 9:00 AM Edmonton as 15:00 UTC, whatever zone the server runs in", async () => {
    handlers["appointment.create"] = () => ({ id: "appt_new" });

    const result = await saveAppointmentAction(null, bookingForm());

    expect(result).toEqual({ ok: true, id: "appt_new" });
    const data = dataOf("appointment.create");
    expect((data.startsAt as Date).toISOString()).toBe("2026-10-04T15:00:00.000Z");
    expect((data.endsAt as Date).toISOString()).toBe("2026-10-04T16:00:00.000Z");
    expect(data.shopId).toBe("shop_1");
    expect(whereOf("shop.findUnique")).toEqual({ id: "shop_1" });
  });

  it("reads a custom end time in the shop's zone too", async () => {
    handlers["appointment.create"] = () => ({ id: "appt_new" });
    await saveAppointmentAction(null, bookingForm({ duration: "custom", startTime: "13:30", endTime: "14:15" }));
    const data = dataOf("appointment.create");
    expect((data.startsAt as Date).toISOString()).toBe("2026-10-04T19:30:00.000Z");
    expect((data.endsAt as Date).toISOString()).toBe("2026-10-04T20:15:00.000Z");
  });

  it("refuses a date that is not a date, in plain words", async () => {
    const result = await saveAppointmentAction(null, bookingForm({ startDate: "2026-02-31" }));
    expect(result).toEqual({ ok: false, error: "Pick a start date and time." });
    expect(callsTo("appointment.create")).toHaveLength(0);
  });

  it("names the clash on the shop's clock", async () => {
    handlers["appointment.findFirst"] = (args) => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if ("startsAt" in where) {
        return {
          id: "appt_other",
          title: "Battery swap",
          startsAt: new Date("2026-10-04T15:00:00Z"),
          endsAt: new Date("2026-10-04T16:00:00Z"),
          assignedTo: { name: "Marcus Webb" },
          customer: null,
        };
      }
      return { status: "CANCELED", assignedToId: "user_tech", startsAt: new Date(), endsAt: new Date() };
    };
    handlers["appointment.updateMany"] = () => ({ count: 1 });

    const result = await setAppointmentStatusAction("appt_1", "SCHEDULED");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Sun Oct 4, 9:00 AM – 10:00 AM");
  });
});

describe("finding a customer beyond the first 500", () => {
  it("searches this shop only, by every word of a full name, with their repairs", async () => {
    handlers["customer.findMany"] = () => [
      { id: "cus_9", firstName: "Daniel", lastName: "Brooks", businessName: null, phone: "(512) 555-0145", mobile: null, email: "d@example.com" },
    ];
    handlers["ticket.findMany"] = () => [
      { id: "tik_1", number: 1015, subject: "Thermal service", customerId: "cus_9" },
    ];

    const result = await searchBookingCustomersAction("Daniel Brooks");

    expect(result.customers).toEqual([
      { value: "cus_9", label: "Daniel Brooks", phone: "(512) 555-0145", email: "d@example.com" },
    ]);
    expect(result.ticketsByCustomer).toEqual({ cus_9: [{ value: "tik_1", label: "#1015 · Thermal service" }] });
    const where = whereOf("customer.findMany");
    expect(where.shopId).toBe("shop_1");
    expect(JSON.stringify(where.OR)).toContain('"AND"');
    expect(whereOf("ticket.findMany")).toMatchObject({ shopId: "shop_1", customerId: { in: ["cus_9"] } });
  });

  it("asks nothing for one letter", async () => {
    expect(await searchBookingCustomersAction("D")).toEqual({ customers: [], ticketsByCustomer: {} });
    expect(callsTo("customer.findMany")).toHaveLength(0);
  });
});

describe("time clock corrections are the shop's wall clock", () => {
  it("stores a 9:00 AM correction as 9:00 AM in Edmonton", async () => {
    handlers["timeClockEntry.updateMany"] = () => ({ count: 1 });

    const result = await updateTimeClockEntryAction("entry_1", {
      clockIn: "2026-09-30T09:02",
      clockOut: "2026-09-30T18:00",
      note: "Forgot to clock out",
    });

    expect(result).toEqual({ ok: true });
    const data = dataOf("timeClockEntry.updateMany");
    expect((data.clockInAt as Date).toISOString()).toBe("2026-09-30T15:02:00.000Z");
    expect((data.clockOutAt as Date).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(whereOf("timeClockEntry.updateMany")).toEqual({ id: "entry_1", shopId: "shop_1" });
  });

  it("still refuses an end before the start", async () => {
    const result = await updateTimeClockEntryAction("entry_1", { clockIn: "2026-09-30T09:00", clockOut: "2026-09-30T08:00", note: "" });
    expect(result).toEqual({ ok: false, error: "The end time has to be after the start time." });
  });
});
