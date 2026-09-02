import { db } from "@/lib/db";
import { normalizeScan, parseDocCode, scanCodeVariants } from "./codes";
import type { ScanResult } from "./types";

/**
 * "What did I just scan?" — answered once, for every caller.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER, AND WHY IT IS THIS ORDER
 * ---------------------------------------------------------------------------
 *   1. UPC      the manufacturer's code, the thing physically printed on the
 *               box a customer hands over. Most scans at a counter are this.
 *   2. SKU      the shop's own part number, which is what the app prints on
 *               its shelf labels (components/inventory/format.ts).
 *   3. serial   an individual unit. Checked after the catalogue because a
 *               serial is a longer, rarer string and a collision with a SKU
 *               should resolve to the sellable product, not to one unit of it.
 *   4. product id  the shelf label's last resort when a product has neither
 *               code, so a label this app printed always reads back.
 *   5. document  T1042 / I2051 / E118 / PO37 — the app's own paperwork
 *               (see lib/scan/codes.ts). Last, because a shop that genuinely
 *               has a SKU called "E118" means the part.
 *
 * Each step is exact and case-insensitive; nothing here does a `contains`,
 * because a scan is a precise thing and a fuzzy hit at the till is worse than
 * no hit at all. The search box is where fuzzy belongs.
 *
 * MULTI-TENANCY. Every query filters by the `shopId` handed in, which callers
 * take from the session and never from the payload (see lib/db.ts). The
 * scanned string itself is treated as data throughout: it is only ever an
 * equality operand, never a path, a redirect target or an identifier the
 * caller trusts.
 */
export async function resolveScan(
  shopId: string,
  raw: string,
): Promise<ScanResult> {
  const value = normalizeScan(raw);
  if (!value) return { kind: "none", value };

  const productSelect = {
    id: true,
    name: true,
    sku: true,
    upc: true,
    priceCents: true,
    taxable: true,
    stockQty: true,
    lowStockAt: true,
    serialized: true,
    active: true,
  } as const;

  // Postgres has no case-insensitive equality operator in Prisma's `equals`
  // without `mode`, so both codes use it. The columns are short and indexed by
  // shop, and this runs once per scan rather than once per keystroke.
  const insensitive = { equals: value, mode: "insensitive" as const };

  // A UPC-A barcode is reported as its 13-digit EAN-13 form by both decoders,
  // while the shop typed the 12 digits printed under the bars. Both are tried
  // (see `scanCodeVariants`), exact first.
  const byUpc = await db.product.findFirst({
    where: {
      shopId,
      OR: scanCodeVariants(value).map((code) => ({
        upc: { equals: code, mode: "insensitive" as const },
      })),
    },
    select: productSelect,
  });
  if (byUpc) {
    return {
      kind: "product",
      value,
      matchedOn: "upc",
      href: `/inventory/${byUpc.id}`,
      product: byUpc,
    };
  }

  const bySku = await db.product.findFirst({
    where: { shopId, sku: insensitive },
    select: productSelect,
  });
  if (bySku) {
    return {
      kind: "product",
      value,
      matchedOn: "sku",
      href: `/inventory/${bySku.id}`,
      product: bySku,
    };
  }

  const unit = await db.productSerial.findFirst({
    where: { shopId, serial: insensitive },
    select: {
      id: true,
      serial: true,
      status: true,
      product: { select: { id: true, name: true } },
      invoiceLine: { select: { invoice: { select: { id: true, number: true } } } },
    },
  });
  if (unit) {
    return {
      kind: "serial",
      value,
      // A sold unit's story is on its invoice; anything else is answered on the
      // product's serial list — the same rule the ⌘K palette follows.
      href: unit.invoiceLine?.invoice
        ? `/invoices/${unit.invoiceLine.invoice.id}`
        : `/inventory/${unit.product.id}`,
      serial: {
        id: unit.id,
        serial: unit.serial,
        status: unit.status,
        productId: unit.product.id,
        productName: unit.product.name,
        invoiceNumber: unit.invoiceLine?.invoice?.number ?? null,
      },
    };
  }

  // The shelf label falls back to the row id when a product has no SKU and no
  // UPC, so a label this app printed has to read back as that product.
  const byId = await db.product.findFirst({
    where: { shopId, id: value },
    select: productSelect,
  });
  if (byId) {
    return {
      kind: "product",
      value,
      matchedOn: "id",
      href: `/inventory/${byId.id}`,
      product: byId,
    };
  }

  const doc = parseDocCode(value);
  if (doc) {
    const hit = await resolveDocCode(shopId, doc.kind, doc.number);
    if (hit) return { ...hit, value };
  }

  return { kind: "none", value };
}

// ---------------------------------------------------------------------------

/** One of the app's own printed sheets, looked up by its number. */
async function resolveDocCode(
  shopId: string,
  kind: "ticket" | "invoice" | "estimate" | "purchase-order",
  number: number,
): Promise<Omit<Extract<ScanResult, { number: number }>, "value"> | null> {
  const person = {
    select: { firstName: true, lastName: true, businessName: true },
  } as const;

  if (kind === "ticket") {
    const row = await db.ticket.findFirst({
      where: { shopId, number },
      select: { id: true, number: true, subject: true },
    });
    return row
      ? {
          kind,
          number: row.number,
          href: `/tickets/${row.id}`,
          label: `Ticket #${row.number} · ${row.subject}`,
        }
      : null;
  }

  if (kind === "invoice") {
    const row = await db.invoice.findFirst({
      where: { shopId, number },
      select: { id: true, number: true, customer: person },
    });
    return row
      ? {
          kind,
          number: row.number,
          href: `/invoices/${row.id}`,
          label: `Invoice #${row.number} · ${personName(row.customer)}`,
        }
      : null;
  }

  if (kind === "estimate") {
    const row = await db.estimate.findFirst({
      where: { shopId, number },
      select: { id: true, number: true, customer: person },
    });
    return row
      ? {
          kind,
          number: row.number,
          href: `/estimates/${row.id}`,
          label: `Estimate #${row.number} · ${personName(row.customer)}`,
        }
      : null;
  }

  const row = await db.purchaseOrder.findFirst({
    where: { shopId, number },
    select: { id: true, number: true, vendor: { select: { name: true } } },
  });
  return row
    ? {
        kind,
        number: row.number,
        href: `/inventory/purchase-orders/${row.id}`,
        label: `Purchase order #${row.number} · ${row.vendor.name}`,
      }
    : null;
}

function personName(
  customer: {
    firstName: string;
    lastName: string;
    businessName: string | null;
  } | null,
): string {
  if (!customer) return "No customer";
  const name = `${customer.firstName} ${customer.lastName}`.trim();
  return name || customer.businessName || "Unnamed";
}
