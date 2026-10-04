import { requireUser } from "@/lib/auth";
import { neutralizeFormula } from "@/lib/csv";
import { dayKeyIn, formatInZone, parseZonedDateInput, safeTimeZone } from "@/lib/shop-time";

/**
 * CSV plumbing for the accounting exports.
 *
 * These files are opened in Excel and imported into QuickBooks, which between
 * them dictate every decision here:
 *
 *  - UTF-8 BOM. Without it Excel on Windows reads the file as the local ANSI
 *    codepage and an accented customer name arrives as mojibake.
 *  - CRLF line endings. The RFC says so and older Excel builds agree.
 *  - Every field quoted, always. Quoting only "when needed" is where CSV
 *    exports break: a customer called "Nguyen, Minh" or an address with a
 *    newline in it silently shifts every column to its right.
 *  - Amounts as plain decimals ("1284.50"), never "$1,284.50" — a currency
 *    symbol makes QuickBooks reject the row.
 *  - Dates as MM/DD/YYYY, the format QuickBooks' import mapper defaults to.
 *  - Text that starts with = + - @ gets a leading single quote (see
 *    neutralizeFormula), so a customer or part named like a formula cannot run
 *    when the file is opened. Numbers, including negative amounts, are untouched.
 *
 * Directory is `_lib` so the App Router ignores it as a route.
 */

const BOM = "\uFEFF";
const CRLF = "\r\n";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default window when no `?from=&to=` is supplied. */
const DEFAULT_DAYS = 90;

export type CsvValue = string | number | null | undefined;

/** Quotes every field and doubles any embedded quote, per RFC 4180. */
export function csvCell(value: CsvValue): string {
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
}

export function csvBody(rows: CsvValue[][]): string {
  return BOM + rows.map((row) => row.map(csvCell).join(",")).join(CRLF) + CRLF;
}

/** 123456 -> "1234.56". Cents in, accounting-safe decimal out. */
export function csvAmount(cents: number | null | undefined): string {
  return (Math.round(Number(cents ?? 0)) / 100).toFixed(2);
}

/** MM/DD/YYYY on the shop's calendar. */
export function csvDate(date: Date | null | undefined, zone = "UTC"): string {
  if (!date) return "";
  return formatInZone(date, "MM/dd/yyyy", safeTimeZone(zone));
}

export type ExportRange = {
  from: Date;
  /** Exclusive — `createdAt < toExclusive`. */
  toExclusive: Date;
  /** `yyyy-mm-dd`, used to name the downloaded file. */
  fromValue: string;
  toValue: string;
};

function parseDay(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
}

/**
 * `?from=&to=` -> a range. `to` is inclusive to the operator (they typed a day
 * they want in the file) and exclusive to the query. A reversed pair is
 * swapped rather than rejected — the intent is obvious.
 */
export function parseRange(url: URL, now: Date = new Date(), zone = "UTC"): ExportRange {
  const timezone = safeTimeZone(zone);
  // UTC dates here are calendar keys only; convert both query boundaries below.
  const today = new Date(`${dayKeyIn(now.getTime(), timezone)}T00:00:00.000Z`);

  let to = parseDay(url.searchParams.get("to")) ?? today;
  let from =
    parseDay(url.searchParams.get("from")) ??
    new Date(to.getTime() - DEFAULT_DAYS * DAY_MS);

  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  const fromValue = from.toISOString().slice(0, 10);
  const toValue = to.toISOString().slice(0, 10);
  const nextDay = new Date(to.getTime() + DAY_MS).toISOString().slice(0, 10);
  return {
    from: parseZonedDateInput(fromValue, timezone)!,
    toExclusive: parseZonedDateInput(nextDay, timezone)!,
    fromValue,
    toValue,
  };
}

export function csvResponse(rows: CsvValue[][], fileName: string): Response {
  return new Response(csvBody(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      // An accounting export must never come off a cache — the whole point is
      // "the books as of the moment I clicked".
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Staff-cookie guard for the export routes.
 *
 * `requireUser` redirects a signed-out visitor to /login, which is the right
 * answer for a link clicked in the UI. A signed-in non-owner gets a plain 403
 * instead: they are authenticated, they simply may not have the books.
 */
export async function requireOwner(): Promise<
  { shopId: string } | { denied: Response }
> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return {
      denied: new Response("Only an owner can export accounting data.", {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    };
  }
  return { shopId };
}

/** "Nguyen, Minh" or the business name when there is one. */
export function customerLabel(customer: {
  firstName: string;
  lastName: string;
  businessName: string | null;
}): string {
  return (
    customer.businessName ||
    `${customer.firstName} ${customer.lastName}`.trim() ||
    "Unnamed customer"
  );
}
