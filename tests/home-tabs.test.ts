import { describe, expect, it } from "vitest";
import { asHomeTab, HOME_TAB_KEYS } from "@/components/counter/home-tab-cookie";

describe("Home tab memory", () => {
  it("accepts only the three real tabs", () => {
    for (const key of HOME_TAB_KEYS) expect(asHomeTab(key)).toBe(key);
  });

  it("ignores anything else so a bad link or cookie opens the default tab", () => {
    expect(asHomeTab("settings")).toBeUndefined();
    expect(asHomeTab("")).toBeUndefined();
    expect(asHomeTab(undefined)).toBeUndefined();
    expect(asHomeTab(null)).toBeUndefined();
    expect(asHomeTab("COUNTER")).toBeUndefined();
  });
});
