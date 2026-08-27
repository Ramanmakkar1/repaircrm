import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/components/billing/format";
import { addressLines, loadPrintShop } from "@/components/billing/print-queries";
import { TicketSheet } from "@/components/billing/print-ticket-sheet";

export const metadata: Metadata = { title: "Work order · RepairFlow" };

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/**
 * The printable work order for one ticket.
 *
 * Lives under /print (outside the (app) route group) for the same reason the
 * invoice and estimate sheets do: paper wants a bare page, not the app shell
 * hidden behind print CSS. The shared print layout runs `requireUser()`, so
 * this is exactly as protected as the rest of the app, and the query is scoped
 * by `shopId` so a guessed id from another tenant 404s rather than printing
 * somebody else's customer, device and passcode.
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

  const customerName =
    ticket.customer.businessName ||
    `${ticket.customer.firstName} ${ticket.customer.lastName}`;

  return (
    <TicketSheet
      number={ticket.number}
      shop={{ name: shop.name, lines: addressLines(shop) }}
      shopPhone={shop.phone}
      logoUrl={shop.logoUrl}
      customer={{
        name: customerName,
        lines: addressLines(ticket.customer),
      }}
      meta={[
        { label: "Ticket #", value: String(ticket.number) },
        { label: "Opened", value: formatDate(ticket.createdAt) },
        { label: "Status", value: ticket.status },
        {
          label: "Priority",
          value: PRIORITY_LABELS[ticket.priority] ?? ticket.priority,
        },
        { label: "Technician", value: ticket.assignedTo?.name ?? "Unassigned" },
        {
          label: "Promised",
          value: ticket.dueDate ? formatDate(ticket.dueDate) : "—",
        },
      ]}
      subject={ticket.subject}
      problemType={ticket.problemType}
      device={
        ticket.asset
          ? {
              type: ticket.asset.type,
              make: ticket.asset.make,
              model: ticket.asset.model,
              serial: ticket.asset.serial,
              password: ticket.asset.password,
              notes: ticket.asset.notes,
            }
          : null
      }
      diagnosis={ticket.diagnosticNotes}
      charges={ticket.charges.map((charge) => ({
        id: charge.id,
        description: charge.description,
        quantity: charge.quantity,
        unitPriceCents: charge.unitPriceCents,
        taxable: charge.taxable,
      }))}
      taxRateBps={shop.taxRateBps}
      intakeSignature={ticket.intakeSignatureDataUrl}
      intakeSignedCaption={
        ticket.intakeSignedAt
          ? `Authorised at intake · ${formatDateTime(ticket.intakeSignedAt)}`
          : "Customer authorisation (intake)"
      }
      resolved={ticket.status === "Resolved"}
      backHref={`/tickets/${ticket.id}`}
      backLabel={`Back to ticket #${ticket.number}`}
      terms="Charges shown are work recorded to date and are not a final invoice. Devices not collected within 30 days of completion may incur storage fees. Please present the claim check below when collecting."
    />
  );
}
