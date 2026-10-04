import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
import { csvDate, parseRange } from "@/app/api/exports/_lib/csv";

const zone = "America/Edmonton";
const now = new Date("2026-10-04T03:00:00Z");
const url = (query = "") => new URL(`https://example.test/export?${query}`);

describe("accounting export shop calendar", () => {
  it("includes the complete requested shop day", () => {
    const range = parseRange(url("from=2026-10-03&to=2026-10-03"), now, zone);
    expect(range.from.toISOString()).toBe("2026-10-03T06:00:00.000Z");
    expect(range.toExclusive.toISOString()).toBe("2026-10-04T06:00:00.000Z");
  });
  it.each([["2026-03-08", 23], ["2025-11-02", 25], ["2026-11-01", 24]])("uses real day boundaries for %s", (day, hours) => {
    const range = parseRange(url(`from=${day}&to=${day}`), now, zone);
    expect((range.toExclusive.getTime() - range.from.getTime()) / 3_600_000).toBe(hours);
  });
  it("defaults to today at the shop rather than UTC", () => {
    expect(parseRange(url(), now, zone).toValue).toBe("2026-10-03");
  });
  it("rejects impossible dates instead of silently exporting March", () => {
    const range = parseRange(url("to=2026-02-31"), now, zone);
    expect(range.toValue).toBe("2026-10-03");
  });
  it("formats transaction instants on the same calendar as their query", () => {
    expect(csvDate(now, zone)).toBe("10/03/2026");
    expect(csvDate(now, "UTC")).toBe("10/04/2026");
    expect(csvDate(null, zone)).toBe("");
  });
  it("preserves stored due-date calendar days when no transaction zone is passed", () => {
    expect(csvDate(new Date("2026-10-03T00:00:00Z"))).toBe("10/03/2026");
  });
});
