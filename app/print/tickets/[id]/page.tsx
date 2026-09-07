import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadPrintShop } from "@/components/billing/print-queries";
import { ticketSheetProps } from "@/components/billing/print-mappers";
import { TicketSheet } from "@/components/billing/print-ticket-sheet";

export const metadata: Metadata = { title: "Work order · RepairFlow" };

/**
 * The printable work order for one ticket.
 *
 * Lives under /print (outside the (app) route group) for the same reason the
 * invoice and estimate sheets do: paper wants a bare page, not the app shell
 * hidden behind print CSS. The shared print layout runs `requireUser()`, so
 * this is exactly as protected as the rest of the app, and the query is scoped
 * by `shopId` so a guessed id from another tenant 404s rather than printing
 * somebody else's customer, device and passcode.
 *
 * The sheet's props are derived by `ticketSheetProps`, which the batch page at
 * /print/tickets also calls — the stack off the printer cannot disagree with
 * the single sheet.
 */
export default async function TicketPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [ticket, shop] = await Promise.all([
    db.ticket.findFirst({
      where: { id, shopId },
      include: {
        customer: true,
        asset: true,
        assignedTo: { select: { name: true } },
        charges: { orderBy: { createdAt: "asc" } },
      },
    }),
    loadPrintShop(shopId),
  ]);
  if (!ticket || !shop) notFound();

  return <TicketSheet {...ticketSheetProps(ticket, shop)} />;
}
