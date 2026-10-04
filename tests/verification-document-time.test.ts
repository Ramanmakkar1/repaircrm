import { describe, expect, it } from "vitest";
import { invoiceMessage, estimateMessage, receiptMessage } from "@/lib/comms/documents";
import { labourLinesFor } from "@/lib/time-billing";
import { readLabourSettings } from "@/lib/labour";
import { promisedIso, quickPromisedLocal } from "@/lib/intake";
import { fromDateInputValue } from "@/components/billing/format";
import { fieldValues, initialState, withPromised } from "@/components/tickets/intake/flow";

const instant = new Date("2026-10-04T03:00:00Z");
const calendarDay = new Date("2026-10-04T00:00:00Z");
const base = { shopName: "Fixture shop", timeZone: "America/Edmonton", customerFirstName: "Ada", number: 1, publicToken: "fixture", totalCents: 10000 };

describe("document transaction dates on the shop calendar", () => {
  it("makes Today the shop day and submits its actual 5pm instant", () => {
    const state = withPromised(initialState(), "today", instant, base.timeZone);
    expect(state.promised.local).toBe("2026-10-03T17:00");
    const fields = fieldValues(state, { timeZone: base.timeZone, assetsByCustomer: {}, locations: [], checklists: [] });
    expect(fields.promisedAt).toBe("2026-10-03T23:00:00.000Z");
  });
  it("uses the offset of the promised day across a clock change", () => {
    const next = quickPromisedLocal(1, new Date("2026-03-08T03:00:00Z"), base.timeZone);
    expect(next).toBe("2026-03-08T17:00");
    expect(promisedIso(next, base.timeZone)).toBe("2026-03-08T23:00:00.000Z");
    expect(promisedIso("2026-02-31T17:00", base.timeZone)).toBe("");
  });
  it("rejects an impossible billing calendar date", () => {
    expect(fromDateInputValue("2026-02-31")).toBeNull();
    expect(fromDateInputValue("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });
  it("keeps the invoice's creation day and due calendar day distinct", () => {
    const message = invoiceMessage({ ...base, createdAt: instant, dueDate: calendarDay, lineCount: 1, balanceCents: 10000 });
    expect(message.summary).toContainEqual({ label: "Date", value: "Oct 3, 2026" });
    expect(message.summary).toContainEqual({ label: "Due", value: "Oct 4, 2026" });
  });
  it("keeps the estimate's creation day and expiry calendar day distinct", () => {
    const message = estimateMessage({ ...base, createdAt: instant, expiresAt: calendarDay, lineCount: 1 });
    expect(message.summary).toContainEqual({ label: "Quoted", value: "Oct 3, 2026" });
    expect(message.summary).toContainEqual({ label: "Valid until", value: "Oct 4, 2026" });
  });
  it("dates a receipt at the shop where the payment happened", () => {
    const message = receiptMessage({ ...base, paidAt: instant, method: "Cash", amountCents: 10000, netPaidCents: 10000, balanceCents: 0 });
    expect(message.summary).toContainEqual({ label: "Paid on", value: "Oct 3, 2026" });
  });
  it("uses the same shop day in billed labour without changing its price", () => {
    const entries = [{ id: "time_1", startedAt: instant, seconds: 3600, userName: "Ada" }];
    const settings = readLabourSettings(null);
    const local = labourLinesFor(entries, settings, base.timeZone);
    const utc = labourLinesFor(entries, settings, "UTC");
    expect(local[0].description).toContain("Oct 3");
    expect(utc[0].description).toContain("Oct 4");
    expect(local[0].unitPriceCents).toBe(utc[0].unitPriceCents);
  });
});
