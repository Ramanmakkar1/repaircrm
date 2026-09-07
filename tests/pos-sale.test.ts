import { beforeEach, describe, expect, it, vi } from "vitest";

import { performCheckout, WALK_IN } from "@/app/(app)/pos/checkout";
import type { CheckoutInput } from "@/components/pos/types";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

/**
 * app/(app)/pos/checkout.ts — `performCheckout`, the counter sale itself.
 *
 * The three things this test file is protecting:
 *
 *   1. THE PAYMENT IS THE DUE FIGURE. A repair with $50 already on deposit and
 *      a $150 total takes $100 at the counter. Writing the gross total as the
 *      payment AND consuming the deposit would charge the customer twice.
 *   2. WARRANTY IS SNAPSHOTTED. `InvoiceLine.warrantyDays` is copied off the
 *      product (or off the ticket charge's product) at the moment of sale, so
 *      changing a product's policy later never restates cover somebody already
 *      bought.
 *   3. TICKET LINES DO NOT MOVE STOCK. A part on a ticket charge left the shelf
 *      at the bench; decrementing again at the till would count one physical
 *      part out of stock twice.
 */

const CONTEXT = { shopId: "shop_1", userId: "user_1", locationId: "loc_1" };
const SHOP = CONTEXT.shopId;

const cart = (over: Partial<CheckoutInput> = {}): CheckoutInput => ({
  lines: [],
  customerId: null,
  method: "CASH",
  reference: null,
  tenderedCents: null,
  ...over,
});

const cartLine = (over: Partial<CheckoutInput["lines"][number]> = {}) => ({
  productId: null,
  description: "",
  unitPriceCents: 0,
  taxable: false,
  quantity: 1,
  ...over,
});

/** A catalogue row as `resolveSale` selects it. */
type CatalogueProduct = {
  id: string;
  name: string;
  priceCents: number;
  taxable: boolean;
  warrantyDays: number | null;
  serialized: boolean;
};

const WIDGET: CatalogueProduct = {
  id: "prod_widget",
  name: "Screen assembly",
  priceCents: 12_000,
  taxable: true,
  warrantyDays: 90,
  serialized: false,
};

/** Everything a sale touches, stubbed for a plain no-ticket cash sale. */
function stubSale(products: CatalogueProduct[] = [WIDGET]): void {
  handlers["product.findMany"] = (args) => {
    const where = (args.where ?? {}) as { id?: { in?: string[] } };
    const wanted = new Set(where.id?.in ?? []);
    return products.filter((product) => wanted.has(product.id));
  };
  handlers["ticketCharge.findMany"] = () => [];
  handlers["shop.findUnique"] = () => ({ taxRateBps: 0 });
  handlers["taxRate.findMany"] = () => [];
  handlers["invoice.aggregate"] = () => ({ _max: { number: 1041 } });
  handlers["customer.findFirst"] = () => null;
  handlers["customer.create"] = () => ({ id: "cus_walkin" });
  handlers["invoice.create"] = () => ({ id: "inv_new", number: 1042 });
  handlers["payment.create"] = () => ({ id: "pay_new" });
  handlers["product.update"] = () => ({ id: "prod_widget" });
  handlers["stockAdjustment.create"] = () => ({ id: "adj_1" });
  // No serialized units on this sale.
  handlers["invoiceLine.findMany"] = () => [];
}

beforeEach(() => {
  resetDb();
  stubSale();
});

describe("a plain counter sale", () => {
  it("rings up a PAID invoice for the cart's server-priced total", async () => {
    const result = await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id, quantity: 2 })] }),
    );

    expect(result).toMatchObject({
      ok: true,
      invoiceId: "inv_new",
      number: 1042,
      totalCents: 24_000,
      depositAppliedCents: 0,
      method: "CASH",
    });

    const invoice = dataOf("invoice.create");
    expect(invoice).toMatchObject({
      shopId: SHOP,
      number: 1042,
      status: "PAID",
      locationId: "loc_1",
      ticketId: null,
      taxRateBps: 0,
    });
    expect(invoice.paidAt).toBeInstanceOf(Date);
  });

  it("records the payment as what the SALE was worth, not what was handed over", async () => {
    const result = await performCheckout(
      CONTEXT,
      cart({
        lines: [cartLine({ productId: WIDGET.id })],
        method: "CASH",
        tenderedCents: 20_000,
      }),
    );

    // A $200 bill against a $120 sale is a $120 payment plus $80 change, not an
    // $80 overpayment.
    expect(dataOf("payment.create")).toMatchObject({
      amountCents: 12_000,
      method: "CASH",
      reference: "Tendered $200.00",
      takenById: "user_1",
    });
    expect(result.ok && result.changeDueCents).toBe(8_000);
  });

  it("gives no change on a non-cash tender", async () => {
    const result = await performCheckout(
      CONTEXT,
      cart({
        lines: [cartLine({ productId: WIDGET.id })],
        method: "CARD",
        tenderedCents: 20_000,
        reference: "auth 1234",
      }),
    );

    expect(result.ok && result.changeDueCents).toBe(0);
    expect(dataOf("payment.create").reference).toBe("auth 1234");
  });

  it("creates the walk-in placeholder only when the sale is real", async () => {
    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(dataOf("customer.create")).toMatchObject({
      shopId: SHOP,
      firstName: WALK_IN.firstName,
      lastName: WALK_IN.lastName,
    });
    expect(dataOf("invoice.create").customerId).toBe("cus_walkin");
  });

  it("reuses the existing walk-in rather than making a second one", async () => {
    handlers["customer.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { firstName?: string };
      return where.firstName === WALK_IN.firstName ? { id: "cus_walkin_1" } : null;
    };

    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(callsTo("customer.create")).toHaveLength(0);
    expect(dataOf("invoice.create").customerId).toBe("cus_walkin_1");
  });
});

describe("warranty is snapshotted at the moment of sale", () => {
  it("copies the catalogue product's policy onto the line", async () => {
    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    const created = dataOf("invoice.create") as {
      lines: { create: { warrantyDays: number | null; description: string }[] };
    };
    expect(created.lines.create[0]).toMatchObject({
      description: "Screen assembly",
      warrantyDays: 90,
    });
  });

  it("leaves a typed-at-the-counter item with no cover — it has no policy to copy", async () => {
    await performCheckout(
      CONTEXT,
      cart({
        lines: [cartLine({ description: "Data recovery", unitPriceCents: 9_900 })],
      }),
    );

    const created = dataOf("invoice.create") as {
      lines: { create: { warrantyDays: number | null }[] };
    };
    expect(created.lines.create[0].warrantyDays).toBeNull();
  });

  it("writes a NULL rather than a zero when the product has no policy", async () => {
    resetDb();
    stubSale([{ ...WIDGET, id: "prod_nowarranty", warrantyDays: null }]);
    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: "prod_nowarranty" })] }),
    );

    const created = dataOf("invoice.create") as {
      lines: { create: { warrantyDays: number | null }[] };
    };
    expect(created.lines.create[0].warrantyDays).toBeNull();
  });
});

describe("stock", () => {
  it("decrements a catalogue line and writes the audit row", async () => {
    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id, quantity: 3 })] }),
    );

    expect(dataOf("product.update")).toEqual({ stockQty: { decrement: 3 } });
    expect(dataOf("stockAdjustment.create")).toMatchObject({
      shopId: SHOP,
      productId: WIDGET.id,
      delta: -3,
      reason: "Sold — POS",
      userId: "user_1",
    });
  });

  it("moves no stock for a custom line", async () => {
    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ description: "Diagnostic", unitPriceCents: 4_500 })] }),
    );

    expect(callsTo("product.update")).toHaveLength(0);
    expect(callsTo("stockAdjustment.create")).toHaveLength(0);
  });
});

describe("a sale that bills a repair ticket", () => {
  const charge = {
    id: "chg_1",
    ticketId: "tkt_1",
    productId: "prod_battery",
    description: "Battery replacement",
    quantity: 1,
    unitPriceCents: 10_000,
    taxable: false,
    product: { warrantyDays: 180 },
    ticket: { id: "tkt_1", number: 1042, customerId: "cus_ticket" },
  };

  function stubTicketSale(deposits: { id: string; amountCents: number }[] = []): void {
    handlers["ticketCharge.findMany"] = (args) => {
      const where = (args.where ?? {}) as { id?: { in?: string[] } };
      return (where.id?.in ?? []).includes("chg_1") ? [charge] : [];
    };
    handlers["customer.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { id?: string };
      return {
        id: where.id ?? "cus_ticket",
        taxExempt: false,
        taxRateId: null,
        creditBalanceCents: 100_000,
      };
    };
    handlers["deposit.findMany"] = () => deposits;
    handlers["customer.update"] = () => ({ id: "cus_ticket" });
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });
    handlers["deposit.updateMany"] = () => ({ count: deposits.length });
    handlers["ticketCharge.updateMany"] = () => ({ count: 1 });
    handlers["ticketComment.create"] = () => ({ id: "cmt_1" });
  }

  it("bills the TICKET's customer, whatever the cart claimed", async () => {
    stubTicketSale();

    await performCheckout(
      CONTEXT,
      cart({
        customerId: "cus_someone_else",
        lines: [cartLine({ ticketChargeId: "chg_1" })],
      }),
    );

    expect(dataOf("invoice.create")).toMatchObject({
      customerId: "cus_ticket",
      ticketId: "tkt_1",
    });
  });

  it("snapshots the warranty from the CHARGE's product", async () => {
    stubTicketSale();

    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
    );

    const created = dataOf("invoice.create") as {
      lines: { create: { warrantyDays: number | null; description: string }[] };
    };
    expect(created.lines.create[0]).toMatchObject({
      description: "Ticket #1042 — Battery replacement",
      warrantyDays: 180,
    });
  });

  it("DOES NOT move stock for a ticket line — the part left the shelf at the bench", async () => {
    stubTicketSale();

    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
    );

    // The charge names a product, and it is deliberately not a signal to
    // decrement: doing so would count one physical part out of stock twice.
    expect(callsTo("product.update")).toHaveLength(0);
    expect(callsTo("stockAdjustment.create")).toHaveLength(0);
  });

  it("locks the charges to the new invoice and notes it on the ticket", async () => {
    stubTicketSale();

    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
    );

    expect(whereOf("ticketCharge.updateMany")).toMatchObject({
      id: { in: ["chg_1"] },
      shopId: SHOP,
      invoiceId: null,
    });
    expect(dataOf("ticketCharge.updateMany")).toEqual({ invoiceId: "inv_new" });
    expect(dataOf("ticketComment.create")).toMatchObject({
      shopId: SHOP,
      ticketId: "tkt_1",
      isPublic: false,
      body: "Invoice #1042 created at POS.",
    });
  });

  describe("deposits", () => {
    it("TAKES ONLY THE REMAINDER at the counter", async () => {
      stubTicketSale([{ id: "dep_1", amountCents: 4_000 }]);

      const result = await performCheckout(
        CONTEXT,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      expect(result).toMatchObject({
        ok: true,
        totalCents: 10_000,
        depositAppliedCents: 4_000,
      });

      // Two payments: the deposit as CREDIT, then the tender for the rest.
      const payments = callsTo("payment.create").map(
        (call) => call.args.data as { amountCents: number; method: string },
      );
      expect(payments).toEqual([
        expect.objectContaining({ amountCents: 4_000, method: "CREDIT" }),
        expect.objectContaining({ amountCents: 6_000, method: "CASH" }),
      ]);
      expect(payments[0].amountCents + payments[1].amountCents).toBe(10_000);
    });

    it("takes no tender at all when the deposit covers the whole sale", async () => {
      stubTicketSale([{ id: "dep_1", amountCents: 10_000 }]);

      const result = await performCheckout(
        CONTEXT,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      expect(result).toMatchObject({ ok: true, depositAppliedCents: 10_000 });
      const payments = callsTo("payment.create").map(
        (call) => call.args.data as { amountCents: number; method: string },
      );
      expect(payments).toEqual([
        expect.objectContaining({ amountCents: 10_000, method: "CREDIT" }),
      ]);
    });

    it("gives change against the DUE figure, not the gross total", async () => {
      stubTicketSale([{ id: "dep_1", amountCents: 4_000 }]);

      const result = await performCheckout(
        CONTEXT,
        cart({
          lines: [cartLine({ ticketChargeId: "chg_1" })],
          method: "CASH",
          tenderedCents: 10_000,
        }),
      );

      // $100 handed over against $60 still due.
      expect(result.ok && result.changeDueCents).toBe(4_000);
    });

    it("stamps every deposit on the ticket as consumed", async () => {
      stubTicketSale([
        { id: "dep_1", amountCents: 2_000 },
        { id: "dep_2", amountCents: 2_000 },
      ]);

      await performCheckout(
        CONTEXT,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      expect(whereOf("deposit.updateMany")).toMatchObject({
        id: { in: ["dep_1", "dep_2"] },
        shopId: SHOP,
      });
      expect(dataOf("deposit.updateMany")).toEqual({ appliedInvoiceId: "inv_new" });
    });
  });
});

describe("store credit at the till", () => {
  function stubCreditSale(creditBalanceCents: number): void {
    handlers["customer.findFirst"] = (args) => {
      const where = (args.where ?? {}) as { id?: string };
      return {
        id: where.id ?? "cus_1",
        taxExempt: false,
        taxRateId: null,
        creditBalanceCents,
      };
    };
    handlers["customer.update"] = () => ({ id: "cus_1" });
    handlers["creditAdjustment.create"] = () => ({ id: "adj_1" });
  }

  it("draws the balance down and writes the ledger row", async () => {
    stubCreditSale(50_000);

    const result = await performCheckout(
      CONTEXT,
      cart({
        customerId: "cus_1",
        method: "CREDIT",
        lines: [cartLine({ productId: WIDGET.id })],
      }),
    );

    expect(result.ok).toBe(true);
    expect(dataOf("customer.update")).toEqual({
      creditBalanceCents: { decrement: 12_000 },
    });
    expect(dataOf("creditAdjustment.create")).toMatchObject({
      shopId: SHOP,
      deltaCents: -12_000,
      reason: "Applied to invoice #1042",
    });
  });

  it("refuses when there is not enough credit, and rings nothing up", async () => {
    stubCreditSale(500);

    const result = await performCheckout(
      CONTEXT,
      cart({
        customerId: "cus_1",
        method: "CREDIT",
        lines: [cartLine({ productId: WIDGET.id })],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("$5.00 of store credit");
    expect(callsTo("invoice.create")).toHaveLength(0);
  });

  it("refuses a credit sale with nobody to charge it to", async () => {
    const result = await performCheckout(
      CONTEXT,
      cart({ method: "CREDIT", lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Attach a customer before paying with store credit.",
    });
  });
});

describe("the card reader", () => {
  it("refuses a reader payment tendered as anything but a card", async () => {
    const result = await performCheckout(
      CONTEXT,
      cart({
        method: "CASH",
        terminalPaymentIntentId: "pi_1",
        lines: [cartLine({ productId: WIDGET.id })],
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: "A reader payment has to be tendered as a card.",
    });
  });
});

describe("failure leaves nothing behind", () => {
  it("returns a counter-safe message and no invoice when a product vanishes", async () => {
    handlers["product.findMany"] = () => [];

    const result = await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(result).toEqual({
      ok: false,
      error: "One of those products is no longer available. Refresh the register.",
    });
    expect(callsTo("invoice.create")).toHaveLength(0);
    expect(callsTo("payment.create")).toHaveLength(0);
    expect(callsTo("product.update")).toHaveLength(0);
  });

  it("hides an unexpected failure behind a generic message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    handlers["invoice.create"] = () => {
      throw new Error("deadlock detected on relation invoice");
    };

    const result = await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not complete that sale. Nothing was charged.",
    });
    error.mockRestore();
  });
});

describe("multi-tenancy", () => {
  it("stamps the session's shopId onto everything it writes", async () => {
    await performCheckout(
      CONTEXT,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    for (const path of [
      "customer.create",
      "invoice.create",
      "payment.create",
      "stockAdjustment.create",
    ]) {
      expect(dataOf(path).shopId).toBe(SHOP);
    }
  });

  it("never takes a shopId from the cart — the signature has no slot for one", async () => {
    // `performCheckout` takes its tenant from a SaleContext the caller resolved
    // from the session cookie. That is the whole reason it lives in a plain
    // module rather than in actions.ts, where every export becomes a
    // browser-callable endpoint.
    const forged = { ...cart({ lines: [cartLine({ productId: WIDGET.id })] }) } as
      CheckoutInput & { shopId?: string };
    forged.shopId = "shop_other";

    await performCheckout(CONTEXT, forged);

    expect(dataOf("invoice.create").shopId).toBe(SHOP);
    expect(whereOf("product.findMany")).toMatchObject({ shopId: SHOP });
  });
});
