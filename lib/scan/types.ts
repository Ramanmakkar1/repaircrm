/**
 * The shape a scan resolves to.
 *
 * Lives apart from lib/scan/resolve.ts (which imports Prisma) so a Client
 * Component can `switch` on the result without dragging the database client
 * into the browser bundle — the same split components/search/types.ts makes.
 */

/** Every kind of thing a scanned string can turn out to be. */
export type ScanKind =
  | "product"
  | "serial"
  | "ticket"
  | "invoice"
  | "estimate"
  | "purchase-order";

/**
 * One resolved scan.
 *
 * `value` is always the cleaned string that was looked up, so a caller can
 * report "no match for X" without keeping its own copy. `href` is where the
 * app would navigate to show the thing, which is all most callers need.
 */
export type ScanResult =
  | {
      kind: "product";
      value: string;
      href: string;
      /** How the string matched, so the UI can say "SKU" or "UPC". */
      matchedOn: "upc" | "sku" | "id";
      product: {
        id: string;
        name: string;
        sku: string | null;
        upc: string | null;
        priceCents: number;
        taxable: boolean;
        stockQty: number;
        lowStockAt: number | null;
        serialized: boolean;
        active: boolean;
      };
    }
  | {
      kind: "serial";
      value: string;
      href: string;
      serial: {
        id: string;
        serial: string;
        status: string;
        productId: string;
        productName: string;
        invoiceNumber: number | null;
      };
    }
  | {
      kind: "ticket" | "invoice" | "estimate" | "purchase-order";
      value: string;
      href: string;
      /** The document number that was printed on the label. */
      number: number;
      /** A one-line "Invoice #2051 · Elena Marsh" for a toast. */
      label: string;
    }
  | { kind: "none"; value: string };

/** Narrowing helper — `result.href` only exists on a hit. */
export function isScanHit(
  result: ScanResult,
): result is Exclude<ScanResult, { kind: "none" }> {
  return result.kind !== "none";
}
