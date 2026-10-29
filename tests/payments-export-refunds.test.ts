import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({ userId: "user_1", shopId: "shop_1", role: "OWNER" })),
}));

const { GET } = await import("@/app/api/exports/payments.csv/route");

/**
 * payments.csv says it reconciles with the "Money in after refunds" card on
 * /reports. It listed payments only, so any refund left the file $X over the
 * report. Refunds are now negative rows in the same register.
 */

const customer = { firstName: "Ngozi", lastName: "Smith", businessName: null };

beforeEach(() => {
  resetDb();
  handlers["shop.findUnique"] = () => ({ timezone: "UTC" });
  handlers["payment.findMany"] = () => [
    { createdAt: new Date("2026-10-29T15:42:00Z"), amountCents: 5000, method: "CASH", reference: null, invoice: { number: 1000, customer } },
    { createdAt: new Date("2026-10-29T15:43:00Z"), amountCents: 9070, method: "CASH", reference: null, invoice: { number: 1000, customer } },
  ];
  handlers["refund.findMany"] = () => [
    { createdAt: new Date("2026-10-29T15:44:00Z"), amountCents: 2000, method: "CASH", reason: "Goodwill", invoice: { number: 1000, customer } },
  ];
});

describe("payments.csv", () => {
  it("lists refunds as negative rows so the column sums to money in after refunds", async () => {
    const response = await GET(new Request("https://example.test/api/exports/payments.csv?from=2026-10-01&to=2026-10-29"));
    const lines = (await response.text()).replace(/^﻿/, "").trim().split(/\r?\n/);

    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain("-20.00");
    expect(lines[3]).toContain("Refund: Goodwill");
    const total = lines.slice(1).reduce((sum, line) => sum + Number(line.split(",")[3].replace(/"/g, "")), 0);
    expect(total.toFixed(2)).toBe("120.70");

    const where = callsTo("refund.findMany")[0].args.where as { shopId?: string; status?: unknown };
    expect(where.shopId).toBe("shop_1");
    expect(where.status).toEqual({ not: "failed" });
  });
});
