/**
 * Which ONE big black button a billing document's header shows, by status.
 *
 * Easy mode gives every detail screen a single obvious next step, the way the
 * register does. Everything else stays one tap away in the "More" menu, so no
 * action is lost; this only decides which one earns the front.
 *
 * Pure on purpose: the pages already know whether a payment can be taken, so
 * this takes plain booleans and never reads the clock, the database or a role.
 * A permission is never decided here; it only chooses between actions the page
 * has already decided are allowed.
 */

export type InvoicePrimary = "send" | "pay" | "print" | "none";

/**
 * - Draft: Send. A bill nobody has seen yet goes out first, even though a
 *   payment could technically be taken against it.
 * - Sent or part-paid with money owing: Take payment.
 * - Nothing owing (paid in full): Print the receipt.
 * - Void: nothing; the page offers no money action on a voided bill.
 */
export function invoicePrimaryAction(input: {
  status: string;
  voided: boolean;
  canTakePayment: boolean;
}): InvoicePrimary {
  if (input.voided || input.status === "VOID") return "none";
  if (input.status === "DRAFT") return "send";
  if (input.canTakePayment) return "pay";
  return "print";
}

export type EstimatePrimary = "send" | "approve" | "convert" | "invoice" | "none";

/**
 * - Draft: Send. Nobody has seen it yet.
 * - Sent: Approve ("Customer said yes"). Once a quote is out, the next thing
 *   that happens at the counter is the customer agreeing; Send again is a tile.
 * - Approved: Convert to invoice, when the quote has lines to convert (with
 *   none, Send so they can see what changed).
 * - Converted: Open the invoice it became, when there is one.
 * - Declined: Approve ("They said yes after all"): the change of mind is the
 *   only next step; Edit sits beside it as a tile.
 */
export function estimatePrimaryAction(input: {
  status: string;
  canConvert: boolean;
  hasInvoice: boolean;
}): EstimatePrimary {
  switch (input.status) {
    case "DRAFT":
      return "send";
    case "SENT":
    case "DECLINED":
      return "approve";
    case "APPROVED":
      return input.canConvert ? "convert" : "send";
    case "CONVERTED":
      return input.hasInvoice ? "invoice" : "none";
    default:
      return "none";
  }
}
