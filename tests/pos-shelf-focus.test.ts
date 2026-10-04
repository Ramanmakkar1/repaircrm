import { describe, expect, it } from "vitest";

import { focusAfterShelfChange } from "@/components/pos/product-grid";

describe("register focus after choosing a shelf", () => {
  it("puts the caret in the scan box when a shelf or All products opens", () => {
    expect(focusAfterShelfChange(null, "screens", true)).toBe("scan");
    expect(focusAfterShelfChange(null, "all", true)).toBe("scan");
    expect(focusAfterShelfChange("screens", "batteries", true)).toBe("scan");
  });

  it("returns to the shelf heading when going back to the boxes", () => {
    expect(focusAfterShelfChange("screens", null, true)).toBe("shelves");
    expect(focusAfterShelfChange("all", null, true)).toBe("shelves");
  });

  it("does nothing when the shelf did not change (first mount, other re-renders)", () => {
    expect(focusAfterShelfChange(null, null, true)).toBeNull();
    expect(focusAfterShelfChange("screens", "screens", true)).toBeNull();
  });

  it("never pulls focus out of a field the user is in", () => {
    expect(focusAfterShelfChange(null, "screens", false)).toBeNull();
    expect(focusAfterShelfChange("screens", null, false)).toBeNull();
  });
});
