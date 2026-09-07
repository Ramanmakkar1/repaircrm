import { beforeEach, describe, expect, it, vi } from "vitest";

import { priceCart } from "@/app/(app)/pos/checkout";
import type { CheckoutInput } from "@/components/pos/types";

import { calls, callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

/**
 * app/(app)/pos/checkout.ts — `priceCart`, the server-side price of the cart
 * currently on the register's screen.
 *
 * ---------------------------------------------------------------------------
 * THE FIGURE THIS FUNCTION RETURNS IS THE AMOUNT PUT ON A CARD
 * ---------------------------------------------------------------------------
 * At the counter there is no invoice yet — the sale is only written once the
 * money is taken — so the card reader has to be shown a number that comes from
 * here. That number is what is still DUE, i.e. the total LESS any deposit
 * already on the ticket. Charging the gross total and then also consuming the
 * deposit would take the customer's money twice.
 *
 * The field it comes back in is named `totalCents`, which is a trap worth
 * knowing about: it carries the DUE figure, not the total. The tests below pin
 * the value rather than the name.
 *
 * ---------------------------------------------------------------------------
 * AND IT MUST NOT WRITE
 * ---------------------------------------------------------------------------
 * Pricing a cart happens on every keystroke at the register. It creates no
 * invoice, no walk-in placeholder customer, and moves no stock.
 */

const SHOP = "shop_1";

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

/** The shop charges 8.25%, with no named rates. */
function stubShop(taxRateBps = 825, taxRates: unknown[] = []): void {
  handlers["shop.findUnique"] = () => ({ taxRateBps });
  handlers["taxRate.findMany"] = () => taxRates;
}

function stubNoTicketCharges(): void {
  handlers["ticketCharge.findMany"] = () => [];
}

function stubProducts(
  products: {
    id: string;
    name: string;
    priceCents: number;
    taxable: boolean;
    warrantyDays: number | null;
    serialized: boolean;
  }[],
): void {
  handlers["product.findMany"] = (args) => {
    const where = (args.where ?? {}) as { id?: { in?: string[] } };
    const wanted = new Set(where.id?.in ?? []);
    return products.filter((product) => wanted.has(product.id));
  };
}

const WIDGET = {
  id: "prod_widget",
  name: "Screen assembly",
  priceCents: 12_000,
  taxable: true,
  warrantyDays: 90,
  serialized: false,
};

beforeEach(() => {
  resetDb();
  stubShop();
  stubNoTicketCharges();
});

describe("validation", () => {
  it("refuses an empty cart", async () => {
    const result = await priceCart(SHOP, cart());
    expect(result).toEqual({ ok: false, error: "Add something to the cart first." });
  });

  it("refuses a custom line with no description", async () => {
    stubProducts([]);

    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ description: "   ", unitPriceCents: 500 })] }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Every custom item needs a description.",
    });
  });

  it("refuses a sale that comes to nothing", async () => {
    stubProducts([]);

    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ description: "Goodwill", unitPriceCents: 0 })] }),
    );

    expect(result).toEqual({
      ok: false,
      error: "This sale comes to nothing — add a priced item.",
    });
  });

  it("refuses a negative quantity at the schema, before any query runs", async () => {
    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ description: "x", unitPriceCents: 100, quantity: -1 })] }),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("the cart is a list of intents, not prices", () => {
  it("re-reads a catalogue line's price from the database and ignores the cart's", async () => {
    stubProducts([WIDGET]);

    const result = await priceCart(
      SHOP,
      cart({
        lines: [
          cartLine({
            productId: WIDGET.id,
            // A forged price straight off the browser.
            unitPriceCents: 1,
            description: "Free screen",
            taxable: false,
            quantity: 2,
          }),
        ],
      }),
    );

    // 2 x $120.00 = $240.00 plus 8.25% = $259.80.
    expect(result).toEqual({ ok: true, totalCents: 25_980 });
  });

  it("refuses a product id that does not belong to this shop", async () => {
    // The scoped findMany simply does not return it, and the count check turns
    // that into a refusal.
    stubProducts([]);

    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ productId: "prod_from_another_tenant" })] }),
    );

    expect(result).toEqual({
      ok: false,
      error: "One of those products is no longer available. Refresh the register.",
    });
  });

  it("does trust a typed-at-the-counter custom line — it has no catalogue row", async () => {
    stubProducts([]);

    const result = await priceCart(
      SHOP,
      cart({
        lines: [
          cartLine({ description: "Data recovery", unitPriceCents: 9_900, taxable: false }),
          cartLine({ description: "  Cleaning  ", unitPriceCents: 1_500, taxable: true }),
        ],
      }),
    );

    expect(result).toEqual({ ok: true, totalCents: 9_900 + 1_500 + 124 });
  });

  it("refuses a negative custom price at the schema, before the clamp is needed", async () => {
    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ description: "Discount", unitPriceCents: -5_000 })] }),
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("forces a serialized product to one unit and demands a serial", async () => {
    const phone = { ...WIDGET, id: "prod_phone", name: "iPhone 13", serialized: true };
    stubProducts([phone]);

    const missing = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ productId: phone.id, quantity: 3 })] }),
    );
    expect(missing).toEqual({
      ok: false,
      error: "iPhone 13 is tracked by serial number — pick which unit is being sold.",
    });

    const picked = await priceCart(
      SHOP,
      cart({
        lines: [cartLine({ productId: phone.id, quantity: 3, serial: "SN-1" })],
      }),
    );
    // Quantity 3 is ignored: one row per physical unit.
    expect(picked).toEqual({ ok: true, totalCents: Math.round(12_000 * 1.0825) });
  });
});

describe("tax resolution", () => {
  it("applies the shop's rate to taxable lines only", async () => {
    stubProducts([WIDGET, { ...WIDGET, id: "prod_labour", taxable: false }]);

    const result = await priceCart(
      SHOP,
      cart({
        lines: [
          cartLine({ productId: WIDGET.id }),
          cartLine({ productId: "prod_labour" }),
        ],
      }),
    );

    // $240.00 subtotal, tax on $120.00 only.
    expect(result).toEqual({ ok: true, totalCents: 24_000 + 990 });
  });

  it("charges a TAX-EXEMPT customer nothing, whatever the shop's rate is", async () => {
    stubProducts([WIDGET]);
    handlers["customer.findFirst"] = () => ({
      id: "cus_1",
      taxExempt: true,
      taxRateId: null,
    });

    const result = await priceCart(
      SHOP,
      cart({ customerId: "cus_1", lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(result).toEqual({ ok: true, totalCents: 12_000 });
  });

  it("uses the customer's own named rate over the shop default", async () => {
    stubProducts([WIDGET]);
    stubShop(825, [
      { id: "rate_gst", name: "GST 5%", rateBps: 500, isDefault: false, active: true },
    ]);
    handlers["customer.findFirst"] = () => ({
      id: "cus_1",
      taxExempt: false,
      taxRateId: "rate_gst",
    });

    const result = await priceCart(
      SHOP,
      cart({ customerId: "cus_1", lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(result).toEqual({ ok: true, totalCents: 12_600 });
  });

  it("uses the shop's starred rate for an anonymous walk-in", async () => {
    stubProducts([WIDGET]);
    stubShop(825, [
      {
        id: "rate_both",
        name: "GST + PST 12%",
        rateBps: 1200,
        isDefault: true,
        active: true,
      },
    ]);

    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(result).toEqual({ ok: true, totalCents: 13_440 });
  });

  it("refuses a customer that is not in this shop", async () => {
    stubProducts([WIDGET]);
    handlers["customer.findFirst"] = () => null;

    const result = await priceCart(
      SHOP,
      cart({
        customerId: "cus_from_another_tenant",
        lines: [cartLine({ productId: WIDGET.id })],
      }),
    );

    expect(result).toEqual({ ok: false, error: "That customer no longer exists." });
  });
});

describe("ticket charges", () => {
  const charge = {
    id: "chg_1",
    ticketId: "tkt_1",
    productId: "prod_battery",
    description: "Battery replacement",
    quantity: 1,
    unitPriceCents: 8_900,
    taxable: true,
    product: { warrantyDays: 180 },
    ticket: { id: "tkt_1", number: 1042, customerId: "cus_ticket" },
  };

  function stubCharges(rows: (typeof charge)[]): void {
    handlers["ticketCharge.findMany"] = (args) => {
      const where = (args.where ?? {}) as { id?: { in?: string[] } };
      const wanted = new Set(where.id?.in ?? []);
      return rows.filter((row) => wanted.has(row.id));
    };
  }

  function stubNoDeposits(): void {
    handlers["deposit.findMany"] = () => [];
  }

  it("prices a ticket line off the CHARGE row, not the cart", async () => {
    stubProducts([]);
    stubCharges([charge]);
    stubNoDeposits();
    handlers["customer.findFirst"] = () => ({
      id: "cus_ticket",
      taxExempt: false,
      taxRateId: null,
    });

    const result = await priceCart(
      SHOP,
      cart({
        // A different customer, a different price, a different quantity — all
        // ignored.
        customerId: "cus_someone_else",
        lines: [
          cartLine({ ticketChargeId: "chg_1", unitPriceCents: 1, quantity: 99 }),
        ],
      }),
    );

    expect(result).toEqual({ ok: true, totalCents: Math.round(8_900 * 1.0825) });
    // Rule 2: the TICKET owns the customer on its own invoice.
    expect(whereOf("customer.findFirst").id).toBe("cus_ticket");
  });

  it("refuses a charge that has already been invoiced", async () => {
    stubProducts([]);
    stubCharges([]); // scoped to invoiceId: null, so a billed charge is absent
    stubNoDeposits();

    const result = await priceCart(
      SHOP,
      cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
    );

    expect(result).toEqual({
      ok: false,
      error:
        "Some of that ticket's charges have already been invoiced. Refresh the register.",
    });
  });

  it("refuses to bill two tickets on one sale", async () => {
    stubProducts([]);
    stubCharges([
      charge,
      {
        ...charge,
        id: "chg_2",
        ticketId: "tkt_2",
        ticket: { id: "tkt_2", number: 1043, customerId: "cus_other" },
      },
    ]);
    stubNoDeposits();

    const result = await priceCart(
      SHOP,
      cart({
        lines: [
          cartLine({ ticketChargeId: "chg_1" }),
          cartLine({ ticketChargeId: "chg_2" }),
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: "One sale can only bill one ticket. Ring the second repair up separately.",
    });
  });

  describe("deposits", () => {
    function stubDeposits(
      deposits: { id: string; amountCents: number }[],
      creditBalanceCents: number,
    ): void {
      handlers["deposit.findMany"] = () => deposits;
      handlers["customer.findFirst"] = (args) => {
        const where = (args.where ?? {}) as { id?: string };
        // planTicketDeposits re-reads the customer for their credit balance.
        return {
          id: where.id,
          taxExempt: false,
          taxRateId: null,
          creditBalanceCents,
        };
      };
    }

    it("RETURNS THE DUE FIGURE — the total LESS the deposit already taken", async () => {
      stubProducts([]);
      stubCharges([charge]);
      stubDeposits([{ id: "dep_1", amountCents: 5_000 }], 5_000);

      const total = Math.round(8_900 * 1.0825); // 9_634
      const result = await priceCart(
        SHOP,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      expect(result).toEqual({ ok: true, totalCents: total - 5_000 });
      // The trap: the field is called `totalCents` but it is NOT the total.
      expect(result.ok && result.totalCents).not.toBe(total);
    });

    it("caps the deposit at the invoice total, never overpaying it", async () => {
      stubProducts([]);
      stubCharges([charge]);
      stubDeposits([{ id: "dep_1", amountCents: 50_000 }], 50_000);

      const result = await priceCart(
        SHOP,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      // Nothing left to hand over, and no negative figure on the reader.
      expect(result).toEqual({ ok: true, totalCents: 0 });
    });

    it("caps the deposit at the credit actually still on the account", async () => {
      stubProducts([]);
      stubCharges([charge]);
      // A $50 deposit was taken, but the credit has since been spent elsewhere.
      stubDeposits([{ id: "dep_1", amountCents: 5_000 }], 1_000);

      const total = Math.round(8_900 * 1.0825);
      const result = await priceCart(
        SHOP,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      expect(result).toEqual({ ok: true, totalCents: total - 1_000 });
    });

    it("charges the full total when the ticket has no deposit", async () => {
      stubProducts([]);
      stubCharges([charge]);
      stubDeposits([], 0);

      const result = await priceCart(
        SHOP,
        cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }),
      );

      expect(result).toEqual({ ok: true, totalCents: Math.round(8_900 * 1.0825) });
    });

    it("never looks for a deposit on a cart with no ticket on it", async () => {
      stubProducts([WIDGET]);

      await priceCart(SHOP, cart({ lines: [cartLine({ productId: WIDGET.id })] }));

      expect(callsTo("deposit.findMany")).toHaveLength(0);
    });
  });
});

describe("pricing a cart writes nothing", () => {
  it("issues no create, update, delete or upsert of any kind", async () => {
    stubProducts([WIDGET]);

    await priceCart(SHOP, cart({ lines: [cartLine({ productId: WIDGET.id })] }));

    const writes = calls.filter((call) =>
      /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(
        call.path,
      ),
    );
    expect(writes).toEqual([]);
  });

  it("does not create the walk-in placeholder customer for an anonymous cart", async () => {
    stubProducts([WIDGET]);

    await priceCart(SHOP, cart({ lines: [cartLine({ productId: WIDGET.id })] }));

    expect(callsTo("customer.create")).toHaveLength(0);
    // With no customerId on the cart it should not even look one up.
    expect(callsTo("customer.findFirst")).toHaveLength(0);
  });

  it("does not open a transaction — a read-only quote does not need one", async () => {
    stubProducts([WIDGET]);

    await priceCart(SHOP, cart({ lines: [cartLine({ productId: WIDGET.id })] }));

    expect(callsTo("$transaction")).toHaveLength(0);
  });
});

describe("multi-tenancy", () => {
  it("scopes products, charges, the customer, the shop and the tax rates", async () => {
    stubProducts([WIDGET]);
    handlers["customer.findFirst"] = () => ({
      id: "cus_1",
      taxExempt: false,
      taxRateId: null,
    });

    await priceCart(
      SHOP,
      cart({ customerId: "cus_1", lines: [cartLine({ productId: WIDGET.id })] }),
    );

    expect(whereOf("product.findMany")).toMatchObject({ shopId: SHOP });
    expect(whereOf("customer.findFirst")).toEqual({ id: "cus_1", shopId: SHOP });
    expect(whereOf("taxRate.findMany")).toEqual({ shopId: SHOP });
    expect(whereOf("shop.findUnique")).toEqual({ id: SHOP });
  });

  it("scopes ticket charges by shopId AND to charges nobody has billed yet", async () => {
    stubProducts([]);
    handlers["ticketCharge.findMany"] = () => [];

    await priceCart(SHOP, cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }));

    expect(whereOf("ticketCharge.findMany")).toMatchObject({
      shopId: SHOP,
      invoiceId: null,
    });
  });

  it("scopes the ticket's deposits by shopId", async () => {
    stubProducts([]);
    handlers["ticketCharge.findMany"] = () => [
      {
        id: "chg_1",
        ticketId: "tkt_1",
        productId: null,
        description: "Repair",
        quantity: 1,
        unitPriceCents: 10_000,
        taxable: false,
        product: null,
        ticket: { id: "tkt_1", number: 1042, customerId: "cus_1" },
      },
    ];
    handlers["customer.findFirst"] = () => ({
      id: "cus_1",
      taxExempt: false,
      taxRateId: null,
      creditBalanceCents: 0,
    });
    handlers["deposit.findMany"] = () => [];

    await priceCart(SHOP, cart({ lines: [cartLine({ ticketChargeId: "chg_1" })] }));

    expect(whereOf("deposit.findMany")).toMatchObject({
      shopId: SHOP,
      ticketId: "tkt_1",
      appliedInvoiceId: null,
      refundedAt: null,
    });
  });
});
