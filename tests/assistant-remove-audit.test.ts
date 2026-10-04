import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb } from "./helpers/db-mock";

/**
 * The assistant's price change writes an audit-log row; removing a product
 * (which hides it from sale) must leave the same kind of trail, so the owner
 * can see who removed what and that it was the assistant.
 */

const auditMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/audit", () => ({ audit: auditMock }));
vi.mock("@/lib/ai", () => ({ generate: vi.fn() }));
vi.mock("@/app/(app)/inventory/actions", () => ({ quickAddProductAction: vi.fn(), adjustStockAction: vi.fn() }));
vi.mock("@/app/(app)/tickets/actions", () => ({
  bulkTicketStatusAction: vi.fn(),
  postUpdateAction: vi.fn(),
  notifyReadyForPickupAction: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ emitCustomerEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const session = { shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Ada" };
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
}));

const { confirmAssistantAction, confirmRemoveProductAction } = await import("@/app/(app)/assistant/actions");

beforeEach(() => {
  resetDb();
  auditMock.mockClear();
  handlers["product.findFirst"] = () => ({ id: "p1", name: "iPhone 6 Screen", priceCents: 4500 });
  handlers["product.update"] = () => ({ id: "p1" });
});

describe("confirming a product removal", () => {
  it("writes an audit entry for the shop, the person and the product, marked as the assistant's", async () => {
    const result = await confirmRemoveProductAction("p1");

    expect(result).toMatchObject({ kind: "done" });
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledWith({
      shopId: "shop_1",
      userId: "user_1",
      action: "product.removed",
      entity: "product",
      entityId: "p1",
      summary: "iPhone 6 Screen: removed from sale (assistant)",
      meta: { via: "assistant" },
    });
  });

  it("writes the audit entry after the product is hidden, never for a product that is not in the shop", async () => {
    handlers["product.findFirst"] = () => null;

    const result = await confirmRemoveProductAction("p1");

    expect(result).toMatchObject({ kind: "error" });
    expect(callsTo("product.update")).toHaveLength(0);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("still writes the price-change entry it always did", async () => {
    await confirmAssistantAction({ type: "set_price", productId: "p1", priceCents: 5000 });

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "product.price_changed", entityId: "p1" }),
    );
  });
});
