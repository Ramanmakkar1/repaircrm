import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", () => ({ db: fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ shopId: "shop_1", userId: "user_1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { removeChargeAction, deleteChargeAction, updateChargeAction } = await import("@/app/(app)/tickets/actions");

const charge = {
  id: "charge_1", ticketId: "ticket_1", productId: null,
  description: "Screen repair", quantity: 1, unitPriceCents: 10000,
  taxable: true, invoiceId: null, createdAt: new Date("2026-10-04T12:00:00Z"),
};

describe("charge writes when invoicing races the repair screen", () => {
  beforeEach(() => {
    resetDb();
    handlers["ticketCharge.findFirst"] = () => charge;
    // Simulate an invoice claiming the charge AFTER the action's initial read.
    handlers["ticketCharge.deleteMany"] = () => ({ count: 0 });
    handlers["ticketCharge.updateMany"] = () => ({ count: 0 });
    handlers["ticketCharge.delete"] = () => charge;
    handlers["ticketCharge.update"] = () => charge;
  });

  it("refuses removal without offering Undo if invoicing claimed the charge", async () => {
    const result = await removeChargeAction(charge.id);
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("removed");
    expect(callsTo("ticketCharge.delete")).toHaveLength(0);
    expect(callsTo("ticketCharge.deleteMany")[0].args.where).toEqual({ id: charge.id, shopId: "shop_1", invoiceId: null });
  });

  it("returns the removed snapshot only after a conditional delete succeeds", async () => {
    handlers["ticketCharge.deleteMany"] = () => ({ count: 1 });
    const result = await removeChargeAction(charge.id);
    expect(result).toMatchObject({ ok: true, removed: { ticketId: charge.ticketId, description: charge.description, unitPriceCents: 10000 } });
  });

  it("the legacy deletion action also refuses a charge claimed by invoicing", async () => {
    await deleteChargeAction(charge.id);
    expect(callsTo("ticketCharge.delete")).toHaveLength(0);
    expect(callsTo("ticketCharge.deleteMany")[0].args.where).toEqual({ id: charge.id, shopId: "shop_1", invoiceId: null });
  });

  it("refuses editing if invoicing claimed the charge after it was read", async () => {
    const form = new FormData();
    form.set("description", "Changed repair");
    form.set("unitPrice", "25");
    const result = await updateChargeAction(charge.id, {}, form);
    expect(result).toHaveProperty("error");
    expect(callsTo("ticketCharge.update")).toHaveLength(0);
    expect(callsTo("ticketCharge.updateMany")[0].args.where).toEqual({ id: charge.id, shopId: "shop_1", invoiceId: null });
  });

  it("never writes for an unavailable or foreign-shop charge", async () => {
    handlers["ticketCharge.findFirst"] = () => null;
    expect(await removeChargeAction(charge.id)).toHaveProperty("error");
    expect(callsTo("ticketCharge.findFirst")[0].args.where).toMatchObject({ shopId: "shop_1" });
    expect(callsTo("ticketCharge.deleteMany")).toHaveLength(0);
    expect(callsTo("ticketCharge.delete")).toHaveLength(0);
  });
});
