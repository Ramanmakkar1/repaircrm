import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatDate, formatDateTime } from "@/components/billing/format";
import { addressLines, loadPrintShop } from "@/components/billing/print-queries";
import { TicketSheet } from "@/components/billing/print-ticket-sheet";
import { PrintToolbar } from "@/components/billing/print-toolbar";
import { requireUser } from "@/lib/auth";
import { BULK_LIMIT } from "@/lib/bulk";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Work orders · RepairFlow" };

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/**
 * A stack of work orders, one selection, one trip to the printer.
 *
 * This is what the tickets list's bulk "Print work orders" points at. Printing
 * a morning's intake one ticket at a time is eight tabs and eight print
 * dialogs; the batch is the reason the bulk action is worth having at all.
 *
 * THE IDS ARE IN THE URL AND THAT IS FINE. They are guesses until proven
 * otherwise: the query below is scoped by the session's `shopId`, so ids
 * belonging to another tenant simply do not come back, exactly as on
 * /print/tickets/[id]. What the caller controls is which of THEIR OWN tickets
 * to print. The list is capped at `BULK_LIMIT` so a hand-typed URL cannot ask
 * the database for the whole shop.
 *
 * Ordered by ticket number rather than by the order the boxes were ticked —
 * the stack coming off the printer should be sorted the way the shop files it.
 */
export default async function TicketBatchPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { shopId } = await requireUser();
  const { ids: rawIds } = await searchParams;

  const ids = parseIds(rawIds);
  if (ids.length === 0) notFound();

  const [tickets, shop] = await Promise.all([
    db.ticket.findMany({
      where: { id: { in: ids }, shopId },
      orderBy: { number: "asc" },
      include: {
        customer: true,
        asset: true,
        assignedTo: { select: { name: true } },
        charges: { orderBy: { createdAt: "asc" } },
      },
    }),
    loadPrintShop(shopId),
  ]);
  if (tickets.length === 0 || !shop) notFound();

  return (
    <>
      <style>{BATCH_CSS}</style>

      {/* One toolbar for the run — each sheet's own is suppressed below. */}
      <PrintToolbar
        backHref="/tickets"
        backLabel="Back to tickets"
        title={`${tickets.length} work order${tickets.length === 1 ? "" : "s"}`}
      />

      {tickets.map((ticket) => {
        const customerName =
          ticket.customer.businessName ||
          `${ticket.customer.firstName} ${ticket.customer.lastName}`;

        return (
          <div key={ticket.id} className="rf-batch-item">
            <TicketSheet
              chrome={false}
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
                {
                  label: "Technician",
                  value: ticket.assignedTo?.name ?? "Unassigned",
                },
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
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

/** `?ids=a,b,c`, de-duplicated and bounded. Anything malformed is dropped. */
function parseIds(raw: string | string[] | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = new Set<string>();
  for (const part of joined.split(",")) {
    const id = part.trim();
    if (id && id.length <= 64) ids.add(id);
  }
  return [...ids].slice(0, BULK_LIMIT);
}

/**
 * Scoped to this route rather than added to the shared stylesheet, the way the
 * label sheet does it — the single-document print views must not inherit a
 * page break they have no use for.
 */
const BATCH_CSS = `
@media print {
  .rf-batch-item { break-after: page; page-break-after: always; }
  .rf-batch-item:last-child { break-after: auto; page-break-after: auto; }
}
`;
