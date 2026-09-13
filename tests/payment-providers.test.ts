import { describe, expect, it } from "vitest";

import { providersForCountry } from "@/lib/payments/providers";

describe("payment provider country catalogue", () => {
  it("offers Stripe but not Square to New Zealand shops", () => {
    const ids = providersForCountry("nz").map((provider) => provider.id);
    expect(ids).toContain("stripe");
    expect(ids).toContain("windcave");
    expect(ids).not.toContain("square");
  });

  it.each(["US", "CA", "GB"])("offers Stripe and Square in %s", (country) => {
    const ids = providersForCountry(country).map((provider) => provider.id);
    expect(ids).toContain("stripe");
    expect(ids).toContain("square");
  });
});
