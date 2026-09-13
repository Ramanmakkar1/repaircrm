import { loadReport } from "@/components/reports/query";
import { formatDuration } from "@/components/reports/period";
import { csvResponse, requireOwner, type CsvValue } from "../_lib/csv";
import { reportScope } from "../_lib/report-range";

/**
 * GET /api/exports/reports-tickets.csv?period=&from=&to=&location=
 *
 * Ticket throughput by bucket, with the time-to-resolve summary underneath —
 * the two halves of "how much work went through the shop, and how fast".
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const scope = await reportScope(request, guard.shopId);
  const { throughput, resolveTime } = await loadReport(
    guard.shopId,
    scope.period,
    // Ticket counts are not money, so the money queries never run for this file.
    { includeMoney: false, locationId: scope.locationId },
  );

  const rows: CsvValue[][] = [["Period", "Created", "Resolved", "Net"]];
  for (const bucket of throughput.byBucket) {
    rows.push([
      bucket.fullLabel,
      bucket.created,
      bucket.resolved,
      bucket.created - bucket.resolved,
    ]);
  }

  rows.push([]);
  rows.push([
    "Total",
    throughput.created,
    throughput.resolved,
    throughput.created - throughput.resolved,
  ]);

  rows.push([]);
  rows.push(["Time to resolve", "Value"]);
  rows.push(["Tickets measured", resolveTime.count]);
  rows.push(["Median", formatDuration(resolveTime.medianMs)]);
  rows.push(["Mean", formatDuration(resolveTime.meanMs)]);
  rows.push(["Fastest", formatDuration(resolveTime.fastestMs)]);
  rows.push(["Slowest", formatDuration(resolveTime.slowestMs)]);

  return csvResponse(rows, `repairpilot-tickets-${scope.fileRange}.csv`);
}
