import { describe, expect, it } from "vitest";

import { runtimeKnowsAlbertaPermanentTime } from "@/lib/dashboard/zone";

/**
 * Shop times come from the runtime's own time zone data (Intl). Alberta moved to
 * permanent UTC-6 in 2026 (IANA tzdata 2026c). Node 22.22.x ships tzdata 2026a,
 * which still falls Edmonton back on 2026-11-01, so the November 2026 checks in
 * fix-shop-zone and verification-export-calendar fail there. Use `.nvmrc`.
 */
describe("runtime time zone data", () => {
  it("knows Alberta's permanent UTC-6 (run Node 22.23.3+, see .nvmrc)", () => {
    expect(
      runtimeKnowsAlbertaPermanentTime(),
      `Node ${process.version} has tzdata ${process.versions.tz}; Alberta's permanent UTC-6 needs tzdata 2026c+ (Node 22.23.3, .nvmrc)`,
    ).toBe(true);
  });
});
