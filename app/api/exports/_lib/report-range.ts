import { db } from "@/lib/db";
import {
  resolveReportPeriod,
  type ReportPeriod,
} from "@/components/reports/period";

/**
 * The bridge between the report screen's URL and the export routes.
 *
 * The four `reports-*.csv` routes are "download what I am looking at", so they
 * take the SAME parameters the page does — `period`, `from`, `to`, `location` —
 * and resolve them through the same `resolveReportPeriod`. A CSV that covered a
 * different window than the cards above it would be worse than no CSV.
 *
 * Directory is `_lib` so the App Router ignores it as a route.
 */
export type ReportExportScope = {
  period: ReportPeriod;
  /** Validated against the shop; undefined means every location. */
  locationId: string | undefined;
  /** Slug fragment for the downloaded file name. */
  fileRange: string;
};

export async function reportScope(
  request: Request,
  shopId: string,
): Promise<ReportExportScope> {
  const url = new URL(request.url);
  const period = resolveReportPeriod({
    period: url.searchParams.get("period"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });

  const requested = url.searchParams.get("location");
  // Re-read against this shop: an id from another tenant simply does not come
  // back, and the export falls through to "every location" rather than leaking.
  const location = requested
    ? await db.location.findFirst({
        where: { id: requested, shopId },
        select: { id: true },
      })
    : null;

  return {
    period,
    locationId: location?.id,
    fileRange: `${period.fromValue}-to-${period.toValue}`,
  };
}
