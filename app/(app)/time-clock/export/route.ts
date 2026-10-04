/**
 * GET /time-clock/export?week=yyyy-MM-dd — one week of shifts as CSV.
 *
 * Reuses the accounting exports' CSV plumbing (BOM, CRLF, everything quoted)
 * for the same reason: this file is opened in Excel and pasted into a payroll
 * run, and a shift note containing a comma must not shift every column right.
 *
 * OWNER only — a timesheet is the whole team's hours, which is payroll.
 * `requireOwner` answers a signed-in technician with a plain 403 rather than a
 * redirect, because this URL is a download, not a page.
 */

import { requireOwner, csvResponse, type CsvValue } from "@/app/api/exports/_lib/csv";
import { db } from "@/lib/db";
import { loadShopZone } from "@/lib/dashboard/shop-zone";
import { dayKeyIn, wallTimeValue } from "@/lib/dashboard/zone";
import { decimalHours, secondsBetween, shopWeek } from "../meta";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const url = new URL(request.url);
  // The week, the dates and the times are the shop's own (Shop.timezone), whatever zone the server runs in.
  const zone = await loadShopZone(guard.shopId);
  const week = shopWeek(url.searchParams.get("week"), Date.now(), zone);

  const entries = await db.timeClockEntry.findMany({
    where: { shopId: guard.shopId, clockInAt: { gte: week.from, lt: week.toExclusive } },
    orderBy: [{ clockInAt: "asc" }],
    select: {
      clockInAt: true,
      clockOutAt: true,
      note: true,
      user: { select: { name: true, email: true } },
    },
  });

  const rows: CsvValue[][] = [
    ["Employee", "Email", "Date", "Clock in", "Clock out", "Hours", "Note"],
  ];

  for (const entry of entries) {
    // A shift still running has no closing time; its hours column is left
    // blank rather than guessed, so a payroll total can never include an
    // open-ended shift by accident.
    const open = entry.clockOutAt === null;
    rows.push([
      entry.user.name,
      entry.user.email,
      localDate(entry.clockInAt, zone),
      wallTimeValue(entry.clockInAt.getTime(), zone),
      open ? "" : wallTimeValue((entry.clockOutAt as Date).getTime(), zone),
      open ? "" : decimalHours(secondsBetween(entry.clockInAt, entry.clockOutAt as Date)),
      entry.note ?? "",
    ]);
  }

  return csvResponse(rows, `time-clock-${week.monday}.csv`);
}

/** MM/DD/YYYY on the shop's own calendar — the timesheet is a local document. */
function localDate(date: Date, zone: string): string {
  const [year, month, day] = dayKeyIn(date.getTime(), zone).split("-");
  return `${month}/${day}/${year}`;
}
