import { describe, expect, it } from "vitest";

import {
  cartItemCount,
  customerChipInfo,
  drawerChipInfo,
  itemsLabel,
  moreTenders,
  repairLineLabel,
  TERMINAL_BOTTOM_GAP,
  terminalHeight,
} from "@/components/pos/terminal-logic";

/**
 * The small decisions behind the one-screen register: its height, the drawer
 * chip's words, the customer chip, the "More" pay menu and the cart's counts.
 * All pure, so they are checked here without a browser.
 */

describe("terminalHeight", () => {
  it("fills the page area, less the page's top padding and a small gap at the bottom", () => {
    // 1024x768 tablet: header 65px leaves a 703px page area, 20px top padding.
    expect(terminalHeight(703, 20)).toBe(703 - 20 - TERMINAL_BOTTOM_GAP);
    expect(terminalHeight(703, 20)).toBe(671);
  });

  it("follows a taller header or a notch, because it measures instead of assuming", () => {
    expect(terminalHeight(679, 20)).toBe(647);
  });

  it("rounds to whole pixels and never goes negative", () => {
    expect(terminalHeight(703.4, 20.2, 12)).toBe(671);
    expect(terminalHeight(10, 20)).toBe(0);
  });
});

describe("drawerChipInfo", () => {
  it("says Drawer closed, in words, when no till is open", () => {
    const info = drawerChipInfo(null);
    expect(info.label).toBe("Drawer closed");
    expect(info.tone).toBe("neutral");
    expect(info.detail).toMatch(/Open it with the float/);
  });

  it("says Drawer open with who opened it, when and with what float", () => {
    const info = drawerChipInfo({
      id: "d1",
      openedAtLabel: "9:14 AM",
      openedByName: "Ada Lovelace",
      openingCents: 15000,
    });
    expect(info.label).toBe("Drawer open");
    expect(info.tone).toBe("success");
    expect(info.detail).toBe("Since 9:14 AM · $150.00 float · Ada Lovelace");
  });
});

describe("customerChipInfo", () => {
  it("is Walk-in when nobody is attached", () => {
    expect(customerChipInfo(null)).toEqual({ name: "Walk-in", walkIn: true, facts: [] });
  });

  it("shows the name, store credit and tax exemption in words", () => {
    const info = customerChipInfo({
      id: "c1",
      label: "Rivera Landscaping LLC — Tomas Rivera",
      creditBalanceCents: 7500,
      taxRateBps: 0,
      taxExempt: true,
    });
    expect(info.walkIn).toBe(false);
    expect(info.name).toBe("Rivera Landscaping LLC — Tomas Rivera");
    expect(info.facts).toEqual(["$75.00 credit", "Tax exempt"]);
  });

  it("lists no facts for an ordinary customer", () => {
    const info = customerChipInfo({
      id: "c2",
      label: "Sofia Kaur",
      creditBalanceCents: 0,
      taxRateBps: 825,
      taxExempt: false,
    });
    expect(info.facts).toEqual([]);
  });
});

describe("moreTenders", () => {
  it("offers Cash + card, Check, Other and Store credit, in that order", () => {
    expect(moreTenders(0).map((option) => option.method)).toEqual(["SPLIT", "CHECK", "OTHER", "CREDIT"]);
  });

  it("switches Store credit off, and says why, until the customer has credit", () => {
    const credit = moreTenders(0).find((option) => option.method === "CREDIT");
    expect(credit?.disabled).toBe(true);
    expect(credit?.label).toBe("Store credit");
    expect(credit?.hint).toMatch(/store credit/i);
  });

  it("turns Store credit on, with the amount available, when there is credit", () => {
    const options = moreTenders(2500);
    const credit = options.find((option) => option.method === "CREDIT");
    expect(credit?.disabled).toBe(false);
    expect(credit?.label).toBe("Store credit · $25.00 available");
    expect(credit?.hint).toBeNull();
    expect(options.filter((option) => option.disabled)).toHaveLength(0);
  });
});

describe("cart counts and labels", () => {
  it("counts things, not lines: a quantity of 3 is 3", () => {
    expect(cartItemCount([])).toBe(0);
    expect(cartItemCount([{ quantity: 1 }, { quantity: 3 }])).toBe(4);
  });

  it("drops the 'Ticket #N —' prefix on a repair line, because the repair has its own header", () => {
    expect(repairLineLabel({ name: "Ticket #1014 — Digitizer labour", ticketNumber: 1014 })).toBe("Digitizer labour");
  });

  it("leaves any other line name alone", () => {
    expect(repairLineLabel({ name: "Tempered Glass Protector", ticketNumber: null })).toBe("Tempered Glass Protector");
    expect(repairLineLabel({ name: "Ticket #7 — Fan", ticketNumber: 9 })).toBe("Ticket #7 — Fan");
  });

  it("pluralises the count under a shelf picture", () => {
    expect(itemsLabel(1)).toBe("1 item");
    expect(itemsLabel(2)).toBe("2 items");
    expect(itemsLabel(12)).toBe("12 items");
  });
});
