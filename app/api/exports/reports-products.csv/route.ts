import { loadReport } from "@/components/reports/query";
import {
  csvAmount,
  csvResponse,
  requireOwner,
  type CsvValue,
} from "../_lib/csv";
import { reportScope } from "../_lib/report-range";

/**
 * GET /api/exports/reports-products.csv?period=&from=&to=&location=
 *
 * What sold, by revenue. Same ranking the "Top products" card shows, which is
 * capped for the screen — the CSV carries the same list rather than a longer
 * one, so the two cannot disagree about what "top" means.
 */
export async function GET(request: Request) {
  const guard = await requireOwner();
  if ("denied" in guard) return guard.denied;

  const scope = await reportScope(request, guard.shopId);
  const { money } = await loadReport(guard.shopId, scope.period, {
    includeMoney: true,
    locationId: scope.locationId,
  });

  const rows: CsvValue[][] = [["Product", "Quantity", "Revenue"]];
  for (const product of money?.topProducts ?? []) {
    rows.push([product.name, product.quantity, csvAmount(product.cents)]);
  }

  return csvResponse(rows, `repairflow-products-${scope.fileRange}.csv`);
}
