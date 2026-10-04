import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { invoiceTiles } from "@/components/billing/bill-display";
import { invoicePrimaryAction } from "@/components/billing/primary-action";
import { TILE_CLASS } from "@/components/billing/tile-style";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/invoices" }));

const { PaymentDialog } = await import("@/components/billing/payment-dialog");

const html = (node: ReactNode) => renderToStaticMarkup(node as never);

/**
 * A draft's big button is Send, so Take payment (a deposit, or a cash sale rung
 * up before the bill goes out) has to be one of the tiles beside it. It was
 * lost from Easy mode once; these pin it back.
 */
describe("a draft invoice can still take a payment in Easy mode", () => {
  const draft = (canTakePayment: boolean) => {
    const primary = invoicePrimaryAction({ status: "DRAFT", voided: false, canTakePayment });
    return { primary, tiles: invoiceTiles({ primary, voided: false, receiptable: false, canTakePayment }) };
  };

  it("keeps Send as the big button and puts Take payment first among the tiles", () => {
    const { primary, tiles } = draft(true);
    expect(primary).toBe("send");
    expect(tiles).toEqual(["pay", "edit", "print", "copy", "more"]);
  });

  it("offers no payment tile when nothing can be paid (a nil draft)", () => {
    const { tiles } = draft(false);
    expect(tiles).toEqual(["edit", "print", "copy", "more"]);
    expect(tiles).not.toContain("pay");
  });

  it("never doubles the big button: a bill that owes money has Take payment big, not as a tile", () => {
    for (const status of ["SENT", "PARTIAL", "OVERDUE"]) {
      const primary = invoicePrimaryAction({ status, voided: false, canTakePayment: true });
      expect(primary).toBe("pay");
      expect(invoiceTiles({ primary, voided: false, receiptable: false, canTakePayment: true })).not.toContain("pay");
    }
  });

  it("a voided bill never offers a payment", () => {
    expect(invoiceTiles({ primary: "none", voided: true, receiptable: false, canTakePayment: true })).toEqual(["print", "more"]);
  });

  it("a paid bill never offers one either", () => {
    expect(invoiceTiles({ primary: "print", voided: false, receiptable: true, canTakePayment: false })).not.toContain("pay");
  });
});

describe("PaymentDialog trigger", () => {
  const props = {
    action: vi.fn(),
    invoiceId: "inv_5",
    balanceCents: 45000,
    customerCreditCents: 0,
    customerName: "Okonkwo Dental Group",
  };

  it("as a tile it is a 64px icon-over-word button with the words Take payment", () => {
    const out = html(createElement(PaymentDialog, { ...props, appearance: "tile", size: "lg" }));
    expect(out).toContain("Take payment");
    expect(out).toContain(TILE_CLASS.split(" ")[0]);
    expect(out).toContain("min-h-16");
    expect(out).toContain('aria-haspopup="dialog"');
  });

  it("without an appearance it is the usual filled button, so the header and the big button are unchanged", () => {
    const out = html(createElement(PaymentDialog, { ...props, size: "sm" }));
    expect(out).toContain("Take payment");
    expect(out).toContain('data-slot="button"');
    expect(out).not.toContain("min-h-16");
  });
});
