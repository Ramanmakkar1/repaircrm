import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runDueRecurringInvoicesForShop } from "@/lib/jobs/recurring";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

vi.mock("@/lib/location", () => ({
  shopDefaultLocationId: vi.fn(async () => "loc_default"),
}));

vi.mock("@/lib/warranty", () => ({
  warrantyDaysByProduct: vi.fn(async () => new Map([["prod_1", 365]])),
}));

/**
 * lib/jobs/recurring.ts — unattended recurring-invoice generation.
 *
 * The two rules this file is here to hold:
 *
 *   DRAFT IS THE DEFAULT. A generated invoice is not sent and not charged
 *   unless the schedule was explicitly told to. Recurring billing that mails
 *   itself out unattended is how a shop bills a cancelled contract for six
 *   months.
 *
 *   THE CADENCE COMES FROM THE SCHEDULED DATE. `nextRunAt` advances from the
 *   date that was DUE, never from `Date.now()`, so a job that ticks four days
 *   late still bills on the 1st next month. This is the rule the pure
 *   arithmetic in tests/recurring-cadence.test.ts implements; here it is
 *   asserted at the call site that actually has to honour it.
 */

const SHOP = "shop_1";

const SCHEDULE = {
  id: "sched_1",
  shopId: SHOP,
  name: "Managed IT — monthly",
  customerId: "cus_1",
  frequency: "MONTHLY",
  // Due on the 1st; the job below runs on the 5th.
  nextRunAt: new Date("2026-03-01T00:00:00.000Z"),
  dueInDays: 14,
  taxRateId: "rate_gst",
  taxRateBps: 500,
  autoSend: false,
  autoCharge: false,
  lines: [
    {
      productId: "prod_1",
      description: "Managed IT",
      quantity: 1,
      unitPriceCents: 25_000,
      taxable: true,
      sortOrder: 0,
    },
  ],
};

function stubSchedule(over: Partial<typeof SCHEDULE> = {}): void {
  const row = { ...SCHEDULE, ...over };
  handlers["recurringInvoice.findMany"] = () => [{ id: row.id }];
  handlers["recurringInvoice.findFirst"] = () => row;
  handlers["recurringInvoice.update"] = () => ({ id: row.id });
  handlers["invoice.aggregate"] = () => ({ _max: { number: 1041 } });
  handlers["invoice.create"] = () => ({ id: "inv_new", number: 1042 });
}

beforeEach(() => {
  resetDb();
  vi.useFakeTimers();
  // Four days after the schedule was due.
  vi.setSystemTime(new Date("2026-03-05T09:17:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("generating an invoice", () => {
  it("raises one DRAFT invoice per due schedule", async () => {
    stubSchedule();

    const result = await runDueRecurringInvoicesForShop(SHOP);

    expect(result).toEqual({
      created: 1,
      charges: { attempted: 0, succeeded: 0, failed: 0 },
      errors: [],
    });
    expect(dataOf("invoice.create")).toMatchObject({
      shopId: SHOP,
      customerId: "cus_1",
      recurringInvoiceId: "sched_1",
      locationId: "loc_default",
      number: 1042,
      status: "DRAFT",
    });
  });

  it("carries BOTH halves of the schedule's tax onto the invoice", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    // The id prints the rate's NAME on the invoice; the bps is the snapshotted
    // fact that a later re-pricing must not restate.
    expect(dataOf("invoice.create")).toMatchObject({
      taxRateId: "rate_gst",
      taxRateBps: 500,
    });
  });

  it("snapshots each line's warranty from the product catalogue", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    const created = dataOf("invoice.create") as {
      lines: { create: { warrantyDays: number | null; unitPriceCents: number }[] };
    };
    expect(created.lines.create[0]).toMatchObject({
      unitPriceCents: 25_000,
      warrantyDays: 365,
    });
  });

  it("dates the terms from TODAY, normalised to UTC midnight", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    // Raised on 5 March, net 14 -> 19 March, at midnight so the printed due
    // date reads the same in every timezone.
    expect((dataOf("invoice.create").dueDate as Date).toISOString()).toBe(
      "2026-03-19T00:00:00.000Z",
    );
  });

  it("refuses a schedule with no lines, without stopping the rest of the shop", async () => {
    stubSchedule({ lines: [] });

    const result = await runDueRecurringInvoicesForShop(SHOP);

    expect(result.created).toBe(0);
    expect(result.errors).toEqual(['"Managed IT — monthly" has no line items to bill.']);
    expect(callsTo("invoice.create")).toHaveLength(0);
  });

  it("collects the failure and carries on when a schedule vanishes mid-run", async () => {
    stubSchedule();
    handlers["recurringInvoice.findFirst"] = () => null;

    const result = await runDueRecurringInvoicesForShop(SHOP);

    expect(result.created).toBe(0);
    expect(result.errors).toEqual(["That schedule no longer exists."]);
  });
});

describe("the cadence is anchored to the SCHEDULED date", () => {
  it("advances from the date that was due, not from when the job ran", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    const update = dataOf("recurringInvoice.update") as {
      nextRunAt: Date;
      lastRunAt: Date;
    };

    // Due 1 March, run 5 March: the next run is 1 APRIL. Advancing from "now"
    // would have given 5 April and the billing day would walk forward every
    // month until it lapped itself.
    expect(update.nextRunAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");

    // `lastRunAt` is the only field that records when the job actually ticked.
    expect(update.lastRunAt.toISOString()).toBe("2026-03-05T09:17:00.000Z");
  });

  it("holds the anchor however late the run is", async () => {
    for (const ranAt of [
      "2026-03-01T00:00:01.000Z",
      "2026-03-05T09:17:00.000Z",
      "2026-03-28T23:59:00.000Z",
    ]) {
      resetDb();
      vi.setSystemTime(new Date(ranAt));
      stubSchedule();

      await runDueRecurringInvoicesForShop(SHOP);

      expect(
        (dataOf("recurringInvoice.update").nextRunAt as Date).toISOString(),
      ).toBe("2026-04-01T00:00:00.000Z");
    }
  });

  it("catches a badly overdue schedule up ONE period per pass", async () => {
    // Three months overdue: the pass advances to February, not to today, so
    // the invoices nobody raised still get raised on the next passes.
    stubSchedule({ nextRunAt: new Date("2026-01-01T00:00:00.000Z") });

    await runDueRecurringInvoicesForShop(SHOP);

    expect(
      (dataOf("recurringInvoice.update").nextRunAt as Date).toISOString(),
    ).toBe("2026-02-01T00:00:00.000Z");
  });

  it("moves the invoice and the new run date in ONE transaction", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    // A crash between the two writes would either bill the customer twice or
    // never again.
    expect(callsTo("$transaction").length).toBeGreaterThanOrEqual(1);
    expect(callsTo("invoice.create")).toHaveLength(1);
    expect(callsTo("recurringInvoice.update")).toHaveLength(1);
  });
});

describe("nothing goes out unattended", () => {
  it("neither sends nor charges when the schedule says not to", async () => {
    stubSchedule();

    const result = await runDueRecurringInvoicesForShop(SHOP);

    expect(result.charges).toEqual({ attempted: 0, succeeded: 0, failed: 0 });
    // A DRAFT is never promoted to SENT by the job itself.
    expect(callsTo("invoice.update")).toHaveLength(0);
    expect(dataOf("invoice.create").status).toBe("DRAFT");
  });
});

describe("multi-tenancy", () => {
  it("only picks up ACTIVE, DUE schedules belonging to this shop", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    const where = whereOf("recurringInvoice.findMany") as {
      shopId: string;
      active: boolean;
      nextRunAt: { lte: Date };
    };
    expect(where.shopId).toBe(SHOP);
    expect(where.active).toBe(true);
    expect(where.nextRunAt.lte).toBeInstanceOf(Date);
  });

  it("re-reads the schedule scoped by shopId before billing it", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    expect(whereOf("recurringInvoice.findFirst")).toEqual({
      id: "sched_1",
      shopId: SHOP,
    });
  });

  it("stamps the shop onto the invoice it creates", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    expect(dataOf("invoice.create").shopId).toBe(SHOP);
  });

  it("caps one pass so a pathological schedule set cannot run away", async () => {
    stubSchedule();

    await runDueRecurringInvoicesForShop(SHOP);

    expect(callsTo("recurringInvoice.findMany")[0].args.take).toBe(200);
  });
});
