"use server";

import { redirect } from "next/navigation";

import { createInvoiceCheckout, paymentsLive } from "@/lib/payments";
import {
  createSquareInvoicePaymentLink,
  squareConnectionStatus,
} from "@/lib/payments/square";
import { getPortalSession } from "@/lib/portal-session";

/**
 * "Pay online" — the portal's one money-moving action.
 *
 * It opens a Stripe-hosted page and sends the customer there. It does not
 * record anything: the invoice moves only when Stripe's webhook confirms the
 * charge (app/api/webhooks/stripe). Everything this action does is reversible
 * by closing a tab.
 *
 * TENANT RULE, as everywhere in the portal: the invoice id arrives from a form
 * and is only ever a FILTER. The cookie's `{ customerId, shopId }` pair decides
 * whose invoice may be paid, so a swapped id finds nothing.
 */
export async function startInvoiceCheckoutAction(
  formData: FormData,
): Promise<void> {
  const invoiceId = String(formData.get("invoiceId") ?? "").trim();
  const session = await getPortalSession();

  if (!session || !invoiceId) redirect("/portal");

  const square = await squareConnectionStatus(session.shopId);
  const result = paymentsLive()
    ? await createInvoiceCheckout(invoiceId, {
        shopId: session.shopId,
        customerId: session.customerId,
      })
    : square.connected
      ? await createSquareInvoicePaymentLink({
          shopId: session.shopId,
          customerId: session.customerId,
          invoiceId,
        })
      : { ok: false as const, reason: "Online payments are not configured." };

  // `redirect` throws, so both branches stay outside any try/catch.
  if (!result.ok) {
    redirect(
      `/portal/invoices/${invoiceId}?payerror=${encodeURIComponent(result.reason)}`,
    );
  }

  // Absolute, external, and off to Stripe. Without JavaScript this is a 303,
  // which is exactly right for a POST: the browser follows it with a GET.
  redirect(result.url);
}
