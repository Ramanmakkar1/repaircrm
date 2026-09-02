import { loadReport } from "@/components/reports/query";
import {
  csvAmount,
  csvResponse,
  requireOwner,
  type CsvValue,
} from "../_lib/csv";
import { reportScope } from "../_lib/report-range";

/**
 * GET /api/exports/reports-revenue.csv?period=&from=&to=&location=
 *
 * The Revenue card, as a spreadsheet: one row per bucket (the same weeks or
 * months the chart draws), then the period's refunds and the net beneath them.
 * It reuses components/reports/query.ts, so the numbers here and the numbers on
 * screen cannot drift apart.
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const scope = await reportScope(request, guard.shopId);
  const { money } = await loadReport(guard.shopId, scope.period, {
    includeMoney: true,
    locationId: scope.locationId,
  });
  if (!money) return csvResponse([["Period", "Collected"]], "repairflow-revenue.csv");

  const rows: CsvValue[][] = [["Period", "Collected"]];
  for (const bucket of money.revenueByBucket) {
    rows.push([bucket.fullLabel, csvAmount(bucket.value)]);
  }

  rows.push([]);
  rows.push(["Gross collected", csvAmount(money.revenueCents)]);
  rows.push(["Refunded", csvAmount(-money.refundCents)]);
  rows.push(["Net revenue", csvAmount(money.netRevenueCents)]);
  rows.push(["Deposits held (as of now)", csvAmount(money.depositsHeldCents)]);

  rows.push([]);
  rows.push(["Method", "Collected", "Payments"]);
  for (const method of money.byMethod) {
    rows.push([method.label, csvAmount(method.cents), method.count]);
  }

  return csvResponse(
    rows,
    `repairflow-revenue-${scope.fileRange}.csv`,
  );
}
