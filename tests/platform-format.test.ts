import { describe, expect, it } from "vitest";

import { daysFromNow, formatBytes, formatCount, formatDate, formatMoney, percentOf, timeAgo } from "@/lib/platform-format";

const NOW = new Date("2026-11-01T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe("sizes", () => {
  it("speaks in KB, MB and GB like the rest of the app", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(297)).toBe("< 1 KB");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(97 * 1024)).toBe("97 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(3.25 * 1024 ** 3)).toBe("3.3 GB");
    expect(formatBytes(2048 * 1024 ** 4)).toBe("2,048 TB");
  });

  it("says Unknown rather than printing nonsense", () => {
    expect(formatBytes(null)).toBe("Unknown");
    expect(formatBytes(undefined)).toBe("Unknown");
    expect(formatBytes(-1)).toBe("Unknown");
    expect(formatBytes(Number.NaN)).toBe("Unknown");
    expect(formatCount(null)).toBe("Unknown");
    expect(formatCount(12_345)).toBe("12,345");
  });
});

describe("money", () => {
  it("shows whole amounts in the shop's own currency", () => {
    expect(formatMoney(326_189, "usd")).toBe("$3,262");
    expect(formatMoney(900_000, "cad")).toBe("CA$9,000");
    expect(formatMoney(0, "USD")).toBe("$0");
  });

  it("still prints a currency it does not recognise", () => {
    expect(formatMoney(12_300, "zzzz")).toBe("123 ZZZZ");
    expect(formatMoney(12_300, "")).toBe("$123");
  });
});

describe("time in plain words", () => {
  it("counts up from just now to years", () => {
    expect(timeAgo(ago(10_000), NOW)).toBe("just now");
    expect(timeAgo(ago(-5 * MINUTE), NOW)).toBe("just now");
    expect(timeAgo(ago(MINUTE), NOW)).toBe("1 minute ago");
    expect(timeAgo(ago(59 * MINUTE), NOW)).toBe("59 minutes ago");
    expect(timeAgo(ago(60 * MINUTE), NOW)).toBe("1 hour ago");
    expect(timeAgo(ago(23 * 60 * MINUTE), NOW)).toBe("23 hours ago");
    expect(timeAgo(ago(DAY), NOW)).toBe("yesterday");
    expect(timeAgo(ago(3 * DAY), NOW)).toBe("3 days ago");
    expect(timeAgo(ago(20 * DAY), NOW)).toBe("2 weeks ago");
    expect(timeAgo(ago(90 * DAY), NOW)).toBe("3 months ago");
    expect(timeAgo(ago(400 * DAY), NOW)).toBe("1 year ago");
    expect(timeAgo(ago(800 * DAY), NOW)).toBe("2 years ago");
    expect(timeAgo(null, NOW)).toBe("Never");
  });

  it("describes a scheduled day either side of today", () => {
    expect(daysFromNow(new Date(NOW.getTime() + 5 * DAY), NOW)).toBe("in 5 days");
    expect(daysFromNow(new Date(NOW.getTime() + DAY), NOW)).toBe("in 1 day");
    expect(daysFromNow(NOW, NOW)).toBe("today");
    expect(daysFromNow(ago(2 * DAY), NOW)).toBe("2 days ago");
  });

  it("dates by the UTC calendar, so every operator sees the same day", () => {
    expect(formatDate(new Date("2026-10-04T23:30:00Z"))).toBe("Oct 4, 2026");
  });
});

describe("bars", () => {
  it("gives any non-zero share a visible sliver and never passes 100", () => {
    expect(percentOf(1, 1_000_000)).toBe(1);
    expect(percentOf(50, 100)).toBe(50);
    expect(percentOf(200, 100)).toBe(100);
    expect(percentOf(0, 100)).toBe(0);
    expect(percentOf(5, 0)).toBe(0);
  });
});
