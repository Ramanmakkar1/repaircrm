/**
 * Shapes the read-only PlanetScale Postgres metrics API response into the
 * small set of values used by the operations console.
 */

export type PlanetScaleMetricsSnapshot = {
  cpuPercent: number | null;
  memoryUtilPercent: number | null;
  memoryRssBytes: number | null;
  storageUsageBytes: number | null;
  volumeUsagePercent: number | null;
  volumeCapacityBytes: number | null;
  sampleAt: string | null;
};

type Point = { timestamp: number; value: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latestSeriesPoints(payload: unknown, metricName: string): Point[] {
  if (!isRecord(payload) || !Array.isArray(payload.series)) return [];

  const points: Point[] = [];
  for (const series of payload.series) {
    if (!isRecord(series) || series.metric !== metricName || !Array.isArray(series.points)) {
      continue;
    }

    let latest: Point | null = null;
    for (const point of series.points) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const timestamp = finiteNumber(point[0]);
      const value = finiteNumber(point[1]);
      if (timestamp === null || value === null) continue;
      if (!latest || timestamp > latest.timestamp) latest = { timestamp, value };
    }
    if (latest) points.push(latest);
  }
  return points;
}

function latestInstantValues(payload: unknown, metricName: string): number[] {
  if (!isRecord(payload) || !Array.isArray(payload.metrics)) return [];

  const values: number[] = [];
  for (const metric of payload.metrics) {
    if (!isRecord(metric) || metric.metric !== metricName || !Array.isArray(metric.values)) {
      continue;
    }
    for (const entry of metric.values) {
      if (!isRecord(entry)) continue;
      const value = finiteNumber(entry.value);
      if (value !== null) values.push(value);
    }
  }
  return values;
}

function latestValue(points: Point[], strategy: "max" | "sum"): number | null {
  if (points.length === 0) return null;
  return strategy === "max"
    ? Math.max(...points.map((point) => point.value))
    : points.reduce((sum, point) => sum + point.value, 0);
}

export function parsePlanetScaleMetrics(
  timeSeriesPayload: unknown,
  instantPayload: unknown,
): PlanetScaleMetricsSnapshot {
  const cpu = latestSeriesPoints(
    timeSeriesPayload,
    "planetscale_primary_pods_cpu_util_percentages",
  );
  const memory = latestSeriesPoints(
    timeSeriesPayload,
    "planetscale_primary_memory_rss_bytes",
  );
  const memoryPercent = latestSeriesPoints(
    timeSeriesPayload,
    "planetscale_primary_pods_mem_util_percentages",
  );
  const storage = latestSeriesPoints(
    timeSeriesPayload,
    "planetscale_storage_usage_bytes",
  );
  const volumePercent = latestSeriesPoints(
    timeSeriesPayload,
    "planetscale_volume_usage_percentages",
  );
  const timestamps = [
    ...cpu,
    ...memory,
    ...memoryPercent,
    ...storage,
    ...volumePercent,
  ].map((point) => point.timestamp);
  const newestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const capacities = latestInstantValues(
    instantPayload,
    "planetscale_volume_capacity_bytes",
  );

  return {
    cpuPercent: latestValue(cpu, "max"),
    memoryUtilPercent: latestValue(memoryPercent, "max"),
    memoryRssBytes: latestValue(memory, "sum"),
    storageUsageBytes: latestValue(storage, "max"),
    volumeUsagePercent: latestValue(volumePercent, "max"),
    volumeCapacityBytes:
      capacities.length > 0 ? Math.max(...capacities) : null,
    sampleAt:
      newestTimestamp === null
        ? null
        : new Date(newestTimestamp * 1_000).toISOString(),
  };
}
