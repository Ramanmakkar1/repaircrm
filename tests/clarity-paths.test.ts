import { describe, expect, it } from "vitest";
import { isClarityPath } from "@/components/analytics/clarity";

describe("Clarity only records public pages", () => {
  it.each(["/", "/pricing", "/features/pos", "/compare/repairshopr-alternative", "/login", "/privacy"])(
    "records %s",
    (path) => expect(isClarityPath(path)).toBe(true),
  );
  it.each(["/dashboard", "/tickets/abc", "/customers", "/portal", "/portal/tickets/x", "/print/invoices/1", "/counter", "/pricingx", "/s/demo", "/checkin/demo"])(
    "never records %s",
    (path) => expect(isClarityPath(path)).toBe(false),
  );
});
