import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CUSTOMER_SECTIONS_ID } from "@/components/customers/customer-screen";
import { RevealSections, revealSections } from "@/components/customers/reveal-sections";

function env(over: Partial<Parameters<typeof revealSections>[0]> = {}) {
  const scrollIntoView = vi.fn();
  const args = { hash: `#${CUSTOMER_SECTIONS_ID}`, target: { scrollIntoView }, ...over };
  return { args, scrollIntoView };
}

describe("revealSections", () => {
  it("scrolls the tab row to the top of the screen when the address ends in #sections", () => {
    const { args, scrollIntoView } = env();
    expect(revealSections(args)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("does nothing on a plain visit (arriving from the customer list must not jump down the page)", () => {
    const { args, scrollIntoView } = env({ hash: "" });
    expect(revealSections(args)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("leaves other hashes to the browser, such as #messages from the Message tile", () => {
    const { args, scrollIntoView } = env({ hash: "#messages" });
    expect(revealSections(args)).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when the page has no tab row to scroll to", () => {
    expect(revealSections({ hash: `#${CUSTOMER_SECTIONS_ID}`, target: null })).toBe(false);
  });
});

describe("RevealSections", () => {
  it("draws nothing", () => {
    expect(renderToStaticMarkup(React.createElement(RevealSections))).toBe("");
  });
});
