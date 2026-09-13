/**
 * What a scanned string is allowed to be, and how to read the app's OWN
 * printed labels back off paper.
 *
 * Pure and dependency-free: the register (client) and the resolver (server)
 * both import it, so nothing here may touch Prisma, `next/*` or the DOM.
 *
 * ---------------------------------------------------------------------------
 * THE PRINTED CODE128 VOCABULARY
 * ---------------------------------------------------------------------------
 * Every sheet the app prints already carries a Code128 of its own number, and
 * the prefix is what tells them apart (components/billing/print-sheet.tsx
 * builds it as `docLabel[0] + number`, and print-ticket-sheet.tsx hard-codes
 * the work order's `T`):
 *
 *   T1042   work order / ticket #1042      print-ticket-sheet.tsx
 *   I2051   invoice #2051                  print-sheet.tsx, docLabel "Invoice"
 *   E118    estimate #118                  print-sheet.tsx, docLabel "Estimate"
 *   PO37    purchase order #37             app/print/purchase-orders
 *
 * So a shop can scan the paperwork stapled to a device and land on the job.
 * `PO` is matched before the single letters, or "PO37" would read as a
 * purchase order that thinks it is an estimate.
 *
 * Deliberately NOT in the table: `S` (statements, which are a customer-and-
 * period view rather than a numbered record) and `D` (drawer reports, which
 * are closed shifts nobody scans to reopen).
 */

/** The document kinds a printed RepairPilot barcode can name. */
export type DocKind = "ticket" | "invoice" | "estimate" | "purchase-order";

/** Longest first, so "PO" wins over "P"-anything and never reads as one letter. */
const DOC_PREFIXES: readonly (readonly [string, DocKind])[] = [
  ["PO", "purchase-order"],
  ["T", "ticket"],
  ["I", "invoice"],
  ["E", "estimate"],
];

/** The most a scanned string may ever be. Longer is a decode gone wrong. */
export const MAX_SCAN_LENGTH = 200;

/**
 * Cleans a raw decode into something safe to look up.
 *
 * A camera decode is outside input: it can carry a trailing CR from a keyboard
 * wedge, invisible control bytes from a mangled symbol, or megabytes from a QR
 * code somebody pointed at a poster. Everything here is defensive — the result
 * is only ever compared against columns, never interpolated into anything.
 */
export function normalizeScan(raw: string): string {
  return raw
    // Control bytes: a keyboard-wedge CR, or a mangled symbol's stray 0x1f.
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_SCAN_LENGTH);
}

/**
 * Reads one of the app's printed document barcodes, or null for anything else.
 *
 * The number must be the whole tail, so "T1042" is ticket 1042 while a product
 * SKU like "T1042-B" falls through to the catalogue lookup where it belongs.
 */
export function parseDocCode(
  value: string,
): { kind: DocKind; number: number } | null {
  const code = normalizeScan(value).toUpperCase();
  for (const [prefix, kind] of DOC_PREFIXES) {
    if (!code.startsWith(prefix)) continue;
    const digits = code.slice(prefix.length);
    if (!/^\d{1,9}$/.test(digits)) continue;
    const number = Number(digits);
    if (number > 0) return { kind, number };
  }
  return null;
}

/**
 * True when a string could plausibly be a retail product code.
 *
 * Only used for copy — "No product matches 0123456789012" reads better than
 * the same sentence about a QR code's worth of URL — never for a lookup.
 */
export function looksLikeUpc(value: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(normalizeScan(value));
}

/**
 * The forms one retail code can legitimately take.
 *
 * UPC-A and EAN-13 are the same symbol: EAN-13 is UPC-A with a leading zero,
 * and readers disagree about which one to report. Chrome's BarcodeDetector and
 * ZXing both hand back the 13-digit form for a UPC-A barcode, while shops type
 * the 12 digits printed under the bars into the UPC field. Matching only the
 * scanned string would therefore miss every product entered by hand — which is
 * most of them.
 *
 * Returns the value first, so an exact match still wins, followed by its
 * sibling. Anything that is not a 12- or 13-digit number comes back alone.
 */
export function scanCodeVariants(value: string): string[] {
  const code = normalizeScan(value);
  if (/^\d{13}$/.test(code) && code.startsWith("0")) {
    return [code, code.slice(1)];
  }
  if (/^\d{12}$/.test(code)) {
    return [code, `0${code}`];
  }
  return [code];
}
