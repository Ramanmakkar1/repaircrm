import { describe, expect, it } from "vitest";

import { estimatePrimaryAction, invoicePrimaryAction } from "@/components/billing/primary-action";

/** Which ONE big black button an invoice or estimate header shows, by status. */
describe("invoicePrimaryAction", () => {
  const pick = (status: string, canTakePayment: boolean, voided = false) => invoicePrimaryAction({ status, canTakePayment, voided });

  it("a draft goes out first, even though a payment could be taken against it", () => {
    expect(pick("DRAFT", true)).toBe("send");
  });

  it("a sent or part-paid bill with money owing takes payment", () => {
    expect(pick("SENT", true)).toBe("pay");
    expect(pick("PARTIAL", true)).toBe("pay");
  });

  it("a bill with nothing owing prints the receipt", () => {
    expect(pick("PAID", false)).toBe("print");
  });

  it("a part-refunded bill that owes money again goes back to taking payment", () => {
    expect(pick("PARTIAL", true)).toBe("pay");
  });

  it("a void bill offers no money action at all", () => {
    expect(pick("VOID", false, true)).toBe("none");
    expect(pick("VOID", true)).toBe("none");
  });
});

describe("estimatePrimaryAction", () => {
  const pick = (status: string, canConvert = true, hasInvoice = false) => estimatePrimaryAction({ status, canConvert, hasInvoice });

  it("a draft is sent; once it is out, the next step is the customer saying yes", () => {
    expect(pick("DRAFT")).toBe("send");
    // Send again is a tile; the big button is what happens at the counter next.
    expect(pick("SENT")).toBe("approve");
  });

  it("an approved quote converts to an invoice, or is sent if it has no lines to convert", () => {
    expect(pick("APPROVED")).toBe("convert");
    expect(pick("APPROVED", false)).toBe("send");
  });

  it("a converted quote opens the invoice it became", () => {
    expect(pick("CONVERTED", false, true)).toBe("invoice");
    expect(pick("CONVERTED", false, false)).toBe("none");
  });

  it("a declined quote offers the change of mind (approve); Edit is a tile beside it", () => {
    expect(pick("DECLINED")).toBe("approve");
  });
});
