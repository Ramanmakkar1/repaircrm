import { describe, expect, it } from "vitest";

import {
  DEFAULT_CARD_MACHINE,
  readCardMachine,
  resolveCardFlow,
} from "@/lib/payments/card-machine";

describe("readCardMachine", () => {
  it("reads an unset or malformed setting as automatic", () => {
    for (const settings of [null, undefined, "x", [], {}, { cardMachine: 7 }, { cardMachine: [] }]) {
      expect(readCardMachine(settings)).toEqual(DEFAULT_CARD_MACHINE);
    }
  });

  it("keeps a stored choice and drops an unknown provider", () => {
    expect(readCardMachine({ cardMachine: { mode: "manual", provider: "square" } })).toEqual({
      mode: "manual",
      provider: "square",
    });
    expect(readCardMachine({ cardMachine: { mode: "auto", provider: "clover" } })).toEqual({
      mode: "auto",
      provider: null,
    });
    // An unrecognised mode must not strand a shop on a screen that needs hardware.
    expect(readCardMachine({ cardMachine: { mode: "AUTO!" } }).mode).toBe("auto");
  });
});

describe("resolveCardFlow", () => {
  const none = { stripe: false, square: false };
  const both = { stripe: true, square: true };

  it("is manual whenever the owner chose manual, whatever is paired", () => {
    expect(resolveCardFlow({ mode: "manual", provider: "stripe" }, both)).toBe("manual");
  });

  it("falls back to manual when automatic has no machine to send to", () => {
    expect(resolveCardFlow({ mode: "auto", provider: null }, none)).toBe("manual");
    expect(resolveCardFlow({ mode: "auto", provider: "stripe" }, none)).toBe("manual");
  });

  it("goes straight to the only machine paired", () => {
    expect(resolveCardFlow(DEFAULT_CARD_MACHINE, { stripe: true, square: false })).toBe("stripe");
    expect(resolveCardFlow(DEFAULT_CARD_MACHINE, { stripe: false, square: true })).toBe("square");
  });

  it("asks when both are paired and nothing is preferred", () => {
    expect(resolveCardFlow(DEFAULT_CARD_MACHINE, both)).toBe("choose");
    expect(resolveCardFlow({ mode: "auto", provider: "square" }, both)).toBe("square");
  });

  it("ignores a preference for a machine that was unpaired since", () => {
    expect(resolveCardFlow({ mode: "auto", provider: "square" }, { stripe: true, square: false })).toBe(
      "stripe",
    );
  });
});
