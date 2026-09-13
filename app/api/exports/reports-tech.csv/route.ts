import { loadReport } from "@/components/reports/query";
import { csvResponse, requireOwner, type CsvValue } from "../_lib/csv";
import { reportScope } from "../_lib/report-range";

/**
 * GET /api/exports/reports-tech.csv?period=&from=&to=&location=
 *
 * The tech leaderboard. Hours are given to one decimal AND in whole seconds:
 * the first is what a human reads, the second is what a payroll sheet can add
 * up without inheriting a rounding error.
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const scope = await reportScope(request, guard.shopId);
  const { leaderboard } = await loadReport(guard.shopId, scope.period, {
    includeMoney: false,
    locationId: scope.locationId,
  });

  const rows: CsvValue[][] = [
    ["Technician", "TicketsResolved", "Hours", "Seconds"],
  ];
  for (const row of leaderboard) {
    rows.push([
      row.name,
      row.resolved,
      (row.seconds / 3600).toFixed(2),
      row.seconds,
    ]);
  }

  return csvResponse(rows, `repairpilot-tech-${scope.fileRange}.csv`);
}
