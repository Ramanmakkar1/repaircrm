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

export type EstimatePrimary = "send" | "convert" | "invoice" | "none";

/**
 * - Draft or sent: Send (or send again).
 * - Approved: Convert to invoice, when the quote has lines to convert.
 * - Converted: Open the invoice it became, when there is one.
 * - Declined: nothing is obviously next; the menu has Approve and Edit.
 */
export function estimatePrimaryAction(input: {
  status: string;
  canConvert: boolean;
  hasInvoice: boolean;
}): EstimatePrimary {
  switch (input.status) {
    case "DRAFT":
    case "SENT":
      return "send";
    case "APPROVED":
      return input.canConvert ? "convert" : "send";
    case "CONVERTED":
      return input.hasInvoice ? "invoice" : "none";
    default:
      return "none";
  }
}
