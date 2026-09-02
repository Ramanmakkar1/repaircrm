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
import {
  decimalHours,
  parseDateParam,
  secondsBetween,
  toDateParam,
  weekEnd,
  weekStart,
} from "../meta";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const url = new URL(request.url);
  const now = new Date();
  const start = weekStart(parseDateParam(url.searchParams.get("week") ?? undefined, now));
  const end = weekEnd(start);

  const entries = await db.timeClockEntry.findMany({
    where: { shopId: guard.shopId, clockInAt: { gte: start, lte: end } },
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
      localDate(entry.clockInAt),
      localTime(entry.clockInAt),
      open ? "" : localTime(entry.clockOutAt as Date),
      open ? "" : decimalHours(secondsBetween(entry.clockInAt, entry.clockOutAt as Date)),
      entry.note ?? "",
    ]);
  }

  return csvResponse(rows, `time-clock-${toDateParam(start)}.csv`);
}

/** MM/DD/YYYY in the shop's own clock — the timesheet is a local document. */
function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}/${date.getFullYear()}`;
}

function localTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
