import { describe, expect, it } from "vitest";
import { invoicePaymentKey } from "@/lib/payments/invoice-key";

describe("payment retries after repayment and another refund", () => {
  it("reuses the key for an unchanged retry", async () => {
    expect(await invoicePaymentKey("invoice-1-terminal-2000", 1, 1)).toBe(await invoicePaymentKey("invoice-1-terminal-2000", 1, 1));
  });

  it("does not replay the old payment when the same balance reopens", async () => {
    expect(await invoicePaymentKey("invoice-1-terminal-2000", 2, 2)).not.toBe(await invoicePaymentKey("invoice-1-terminal-2000", 1, 1));
  });

  it("keeps different payment methods and balances separate", async () => {
    const original = await invoicePaymentKey("invoice-1-terminal-2000", 1, 1);
    expect(await invoicePaymentKey("invoice-1-card-on-file-2000", 1, 1)).not.toBe(original);
    expect(await invoicePaymentKey("invoice-1-terminal-1000", 1, 1)).not.toBe(original);
  });

  it("fits Square's 64-character limit even with a long identifier", async () => {
    const key = await invoicePaymentKey(`invoice-${"very-long-id".repeat(50)}-2000`, 12345, 12345);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
