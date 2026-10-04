import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ shopId: "shop_1" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { addTimeToInvoiceAction } from "@/app/(app)/invoices/time-actions";

beforeEach(() => {
  resetDb();
  handlers["invoice.findFirst"] = () => ({ id: "invoice_1", number: 1, status: "SENT", ticketId: "ticket_1", _count: { lines: 0 } });
  handlers["shop.findUnique"] = () => ({ settings: null, timezone: "America/Edmonton" });
  handlers["timeEntry.findMany"] = () => [{ id: "time_1", seconds: 3600, startedAt: new Date("2026-10-04T03:00:00Z"), user: { name: "Ada" } }];
  handlers["invoiceLine.createMany"] = () => ({ count: 1 });
});

describe("billing time once even when another tab wins", () => {
  it("adds no invoice line when the entry was already billed", async () => {
    handlers["timeEntry.updateMany"] = () => ({ count: 0 });
    expect(await addTimeToInvoiceAction("invoice_1")).toMatchObject({ ok: false, error: expect.stringContaining("already billed") });
    expect(callsTo("invoiceLine.createMany")).toHaveLength(0);
  });
  it("rejects a partially changed batch instead of billing stale entries", async () => {
    handlers["timeEntry.findMany"] = () => [1, 2].map((id) => ({ id: `time_${id}`, seconds: 3600, startedAt: new Date(), user: { name: "Ada" } }));
    handlers["timeEntry.updateMany"] = () => ({ count: 1 });
    expect(await addTimeToInvoiceAction("invoice_1")).toMatchObject({ ok: false });
    expect(callsTo("invoiceLine.createMany")).toHaveLength(0);
  });
  it("claims this shop's stopped unbilled time before adding its correctly dated line", async () => {
    handlers["timeEntry.updateMany"] = () => ({ count: 1 });
    expect(await addTimeToInvoiceAction("invoice_1")).toMatchObject({ ok: true });
    expect(whereOf("timeEntry.updateMany")).toMatchObject({ shopId: "shop_1", ticketId: "ticket_1", invoiceId: null, billable: true, endedAt: { not: null } });
    const lineCall = callsTo("invoiceLine.createMany")[0];
    expect(calls.indexOf(callsTo("timeEntry.updateMany")[0])).toBeLessThan(calls.indexOf(lineCall));
    expect(lineCall.args.data).toMatchObject([{ invoiceId: "invoice_1", description: expect.stringContaining("Oct 3") }]);
  });
});
