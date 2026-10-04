/**
 * A stable request key for one payment operation on an invoice's append-only
 * ledger. A repayment and another refund can reopen the same amount, so the
 * amount alone cannot distinguish the new payment from an old completed one.
 * SHA-256 also keeps long invoice IDs within Square's 64-character key limit.
 */
export async function invoicePaymentKey(
  operation: string,
  paymentCount: number,
  refundCount: number,
): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([operation, paymentCount, refundCount]));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
