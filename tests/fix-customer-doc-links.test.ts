import { beforeEach, describe, expect, it, vi } from "vitest";

import { handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

process.env.AUTH_SECRET ||= "test-secret-for-doc-links-only-0123456789";
Reflect.deleteProperty(process.env, "APP_URL");
Reflect.deleteProperty(process.env, "NEXT_PUBLIC_APP_URL");

const invoiceRoute = await import("@/app/portal/i/[token]/route");
const estimateRoute = await import("@/app/portal/e/[token]/route");

function request(path: string) {
  // The handlers only read `url`; a plain Request carries it.
  return new Request(`http://shop.test${path}`) as unknown as Parameters<typeof invoiceRoute.GET>[0];
}

beforeEach(() => resetDb());

describe("dead invoice / estimate links (item 9)", () => {
  it("an unknown or draft invoice token lands on the payment-link page, not the generic sign-in error, and mints no session", async () => {
    handlers["invoice.findFirst"] = () => null;
    const response = await invoiceRoute.GET(request("/portal/i/nope"), { params: Promise.resolve({ token: "nope" }) });

    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/portal/link-expired");
    expect(location.searchParams.get("doc")).toBe("invoice");
    expect(location.searchParams.get("error")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    // Drafts never open: the guard rides in the same query.
    expect(whereOf("invoice.findFirst")).toEqual({ publicToken: "nope", status: { not: "DRAFT" } });
  });

  it("an unknown estimate token lands on the estimate wording", async () => {
    handlers["estimate.findFirst"] = () => null;
    const response = await estimateRoute.GET(request("/portal/e/nope"), { params: Promise.resolve({ token: "nope" }) });
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/portal/link-expired");
    expect(location.searchParams.get("doc")).toBe("estimate");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("a good invoice token still opens the invoice with a session for ITS customer (unchanged)", async () => {
    handlers["invoice.findFirst"] = () => ({ id: "inv_1", customerId: "cus_1", shopId: "shop_1" });
    const response = await invoiceRoute.GET(request("/portal/i/good"), { params: Promise.resolve({ token: "good" }) });
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/portal/invoices/inv_1");
    expect(response.headers.get("set-cookie")).toContain("rf_portal=");
  });
});
