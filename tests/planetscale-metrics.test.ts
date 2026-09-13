import { describe, expect, it } from "vitest";

import { parsePlanetScaleMetrics } from "@/lib/planetscale-metrics";

describe("PlanetScale metric response parsing", () => {
  it("uses the newest primary samples and keeps host volume separate from SQL size", () => {
    const timeSeries = {
      series: [
        {
          metric: "planetscale_primary_pods_cpu_util_percentages",
          points: [
            [1_789_270_260, 12.5],
            [1_789_270_320, 19.5],
          ],
        },
        {
          metric: "planetscale_primary_pods_cpu_util_percentages",
          points: [[1_789_270_320, 17]],
        },
        {
          metric: "planetscale_primary_memory_rss_bytes",
          points: [[1_789_270_320, 100]],
        },
        {
          metric: "planetscale_primary_memory_rss_bytes",
          points: [[1_789_270_320, 200]],
        },
        {
          metric: "planetscale_primary_pods_mem_util_percentages",
          points: [[1_789_270_320, 62]],
        },
        {
          metric: "planetscale_storage_usage_bytes",
          points: [[1_789_270_320, 500]],
        },
        {
          metric: "planetscale_volume_usage_percentages",
          points: [[1_789_270_320, 5.2]],
        },
      ],
    };
    const instant = {
      metrics: [
        {
          metric: "planetscale_volume_capacity_bytes",
          values: [{ pod: "primary", role: "primary", value: 10_000 }],
        },
      ],
    };

    expect(parsePlanetScaleMetrics(timeSeries, instant)).toEqual({
      cpuPercent: 19.5,
      memoryUtilPercent: 62,
      memoryRssBytes: 300,
      storageUsageBytes: 500,
      volumeUsagePercent: 5.2,
      volumeCapacityBytes: 10_000,
      sampleAt: new Date(1_789_270_320 * 1_000).toISOString(),
    });
  });

  it("returns null for missing or malformed samples", () => {
    expect(parsePlanetScaleMetrics({ series: "invalid" }, null)).toEqual({
      cpuPercent: null,
      memoryUtilPercent: null,
      memoryRssBytes: null,
      storageUsageBytes: null,
      volumeUsagePercent: null,
      volumeCapacityBytes: null,
      sampleAt: null,
    });
  });
});
