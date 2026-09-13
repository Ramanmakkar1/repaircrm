import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseChecklist } from "@/lib/checklist";
import { formatHm, labourAmountCents, readLabourSettings, roundSecondsUp } from "@/lib/labour";
import { activeLocations } from "@/lib/location";
import { calcTotals, formatCents } from "@/lib/money";
import { customerWarranties } from "@/lib/warranty";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { CopyableId } from "@/components/ui/copyable-id";
import { ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { SummarizeTicketButton } from "@/components/ai/summarize-dialog";
import {
  AttachmentsCard,
  type AttachmentRow,
} from "@/components/tickets/attachments-card";
import { ChargesCard } from "@/components/tickets/charges-card";
import { ChecklistCard } from "@/components/tickets/checklist-card";
import { TicketLocation } from "@/components/tickets/ticket-location";
import { CustomFieldsCard } from "@/components/tickets/custom-fields-card";
import { DepositCard, type DepositRow } from "@/components/tickets/deposit-card";
import { PartsCard, type PartOrderRow } from "@/components/tickets/parts-card";
import { isTerminalPartStatus } from "@/components/tickets/part-meta";
import { PickupActions } from "@/components/tickets/pickup-actions";
import {
  TicketAssignee,
  TicketDueDate,
  TicketPriority,
  TicketProblemType,
} from "@/components/tickets/ticket-fields";
import {
  LiveStatusBadge,
  LiveStatusProgress,
  TicketStatusScope,
} from "@/components/tickets/ticket-status";
import {
  DeleteTicketDialog,
  EditTicketDialog,
  MakeInvoiceButton,
} from "@/components/tickets/ticket-actions";
import { Timeline } from "@/components/tickets/timeline";
import { TimerCard, type TimeEntryRow } from "@/components/tickets/timer-card";
import { UpdateComposer } from "@/components/tickets/update-composer";
import {
  assetLabel,
  customerLabel,
  isReadyForPickup,
  isResolved,
  problemTypes,
  relativeShort,
  STALENESS_CLASS,
  STALENESS_LABEL,
  stalenessLevel,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;

  const ticket = await db.ticket.findFirst({
    where: { id, shopId },
    select: { number: true },
  });

  return {
    title: ticket ? `Ticket #${ticket.number} · RepairPilot` : "Ticket · RepairPilot",
  };
}

/** Deposit tenders wear the same names they do on an invoice. */
const DEPOSIT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHECK: "Check",
  CREDIT: "Store credit",
  OTHER: "Other",
};

/** `customFields` is untyped JSON — coerce it to flat string pairs for display. */
function readCustomFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      raw === null || raw === undefined
        ? ""
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : String(raw);
  }
  return out;
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId, userId, role } = await requireUser();
  const { id } = await params;

  // findFirst (not findUnique) so an id belonging to another shop 404s instead
  // of leaking a row — see the tenancy contract in lib/db.ts.
  const ticket = await db.ticket.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      number: true,
      subject: true,
      problemType: true,
      status: true,
      priority: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      pickedUpAt: true,
      diagnosticNotes: true,
      customFields: true,
      assignedToId: true,
      assetId: true,
      checklist: true,
      // Which saved checklist the steps came from. Carried down to the card so
      // that removing one can offer a faithful undo (provenance included)
      // rather than a re-attach that would come back unticked.
      checklistTemplateId: true,
      isWarranty: true,
      warrantyInvoiceLineId: true,
      locationId: true,
      location: { select: { name: true } },
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          email: true,
          phone: true,
          mobile: true,
        },
      },
      asset: {
        select: { id: true, type: true, make: true, model: true, serial: true },
      },
      assignedTo: { select: { id: true, name: true } },
      comments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          isPublic: true,
          subject: true,
          updateType: true,
          channel: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
      charges: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceCents: true,
          taxable: true,
          invoiceId: true,
          invoice: { select: { number: true } },
        },
      },
      partOrders: {
        // Newest first: the part somebody just ordered is the one being chased.
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          description: true,
          supplier: true,
          quantity: true,
          costCents: true,
          status: true,
          expectedAt: true,
          orderedAt: true,
          receivedAt: true,
          notes: true,
          vendorId: true,
          product: { select: { name: true } },
          purchaseOrder: { select: { id: true, number: true } },
        },
      },
      timeEntries: {
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          userId: true,
          startedAt: true,
          endedAt: true,
          seconds: true,
          note: true,
          billable: true,
          invoiceId: true,
          user: { select: { name: true } },
        },
      },
      deposits: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amountCents: true,
          method: true,
          reference: true,
          createdAt: true,
          refundedAt: true,
          appliedInvoiceId: true,
          takenBy: { select: { name: true } },
          appliedInvoice: { select: { number: true } },
        },
      },
      attachments: {
        // Newest first: the photo somebody just took is the one being looked for.
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          uploadedById: true,
          uploadedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!ticket) notFound();

  const [
    shop,
    techs,
    products,
    cannedResponses,
    customerAssets,
    locations,
    checklistTemplates,
    warranties,
    vendors,
  ] = await Promise.all([
    db.shop.findUnique({
      where: { id: shopId },
      select: { settings: true, taxRateBps: true },
    }),
    db.user.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.product.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        priceCents: true,
        taxable: true,
        costCents: true,
        vendorId: true,
      },
    }),
    db.cannedResponse.findMany({
      where: { shopId },
      orderBy: { title: "asc" },
      select: { id: true, title: true, body: true },
    }),
    db.asset.findMany({
      where: { shopId, customerId: ticket.customer.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, make: true, model: true, serial: true },
    }),
    activeLocations(shopId),
    db.checklistTemplate.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    customerWarranties(shopId, ticket.customer.id, { activeOnly: true }),
    // Suppliers a part can be ordered from, for the part dialog and the
    // "Add to PO" menu.
    db.vendor.findMany({
      where: { shopId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Single request-time clock, so every row in this render is measured against
  // the same instant. eslint-disable: react-hooks/purity targets Client
  // Components; this is a Server Component that renders once per request.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const statuses = ticketStatuses(shop?.settings);
  const level = stalenessLevel(ticket.updatedAt, ticket.status, now);
  const uninvoicedCount = ticket.charges.filter((c) => c.invoiceId === null).length;
  const checklist = parseChecklist(ticket.checklist);

  // The headline figure. Exactly the number the charges card foots to — the
  // header never runs its own arithmetic on money, it just shows the total
  // that is already the ticket's own.
  const chargeTotals = calcTotals(ticket.charges, shop?.taxRateBps ?? 0);

  // The claimed purchase, so the badge can link straight at the invoice it
  // was sold on. Looked up through the invoice, which carries the shopId.
  const warrantyClaim = ticket.warrantyInvoiceLineId
    ? await db.invoiceLine.findFirst({
        where: {
          id: ticket.warrantyInvoiceLineId,
          invoice: { shopId, customerId: ticket.customer.id },
        },
        select: {
          description: true,
          warrantyDays: true,
          invoice: { select: { id: true, number: true, createdAt: true } },
        },
      })
    : null;

  // The labour rate and rounding increment the shop set (Settings → Shop →
  // Labour). Each row carries what it would bill as, so the card never has to
  // reimplement the rounding the invoice will actually use.
  const labour = readLabourSettings(shop?.settings);

  const timeEntries: TimeEntryRow[] = ticket.timeEntries.map((entry) => ({
    id: entry.id,
    userName: entry.user.name,
    startedAtISO: entry.startedAt.toISOString(),
    startedAtLabel: format(entry.startedAt, "MMM d, h:mm a"),
    seconds: entry.seconds,
    running: entry.endedAt === null,
    note: entry.note,
    billable: entry.billable,
    invoiceId: entry.invoiceId,
    amountCents: labourAmountCents(entry.seconds ?? 0, labour),
    billableSeconds: roundSecondsUp(entry.seconds ?? 0, labour.roundingMinutes),
  }));

  // What "Bill time" would sweep onto an invoice right now: stopped, billable,
  // not already billed.
  const unbilledTime = timeEntries.filter(
    (entry) => entry.billable && !entry.invoiceId && !entry.running,
  );
  const unbilledTimeSeconds = unbilledTime.reduce(
    (sum, entry) => sum + entry.billableSeconds,
    0,
  );
  const unbilledTimeCents = unbilledTime.reduce(
    (sum, entry) => sum + entry.amountCents,
    0,
  );

  const deposits: DepositRow[] = ticket.deposits.map((deposit) => ({
    id: deposit.id,
    amountCents: deposit.amountCents,
    methodLabel: DEPOSIT_METHOD_LABELS[deposit.method] ?? deposit.method,
    reference: deposit.reference,
    takenByName: deposit.takenBy?.name ?? null,
    createdAtLabel: format(deposit.createdAt, "MMM d, h:mm a"),
    appliedInvoiceNumber: deposit.appliedInvoice?.number ?? null,
    appliedInvoiceId: deposit.appliedInvoiceId,
    refunded: deposit.refundedAt !== null,
  }));

  const myRunningEntry =
    ticket.timeEntries.find((e) => e.endedAt === null && e.userId === userId) ??
    null;

  const completedSeconds = ticket.timeEntries.reduce(
    (sum, entry) => sum + (entry.seconds ?? 0),
    0,
  );

  // Part orders are flattened here — formatted dates and the overdue verdict
  // are computed against the SAME request-time `now` as everything else on the
  // page, so the client card never has to reach for its own clock.
  const partOrders: PartOrderRow[] = ticket.partOrders.map((part) => ({
    id: part.id,
    description: part.description,
    supplier: part.supplier,
    quantity: part.quantity,
    // Cost is what the shop pays a supplier. Techs see the parts list; only the
    // owner sees the margin behind it, matching how inventory handles cost.
    costCents: role === "OWNER" ? part.costCents : null,
    status: part.status,
    expectedLabel: part.expectedAt ? format(part.expectedAt, "MMM d") : null,
    // Only an unfulfilled part can be late: a received one arrived, whenever
    // that was, and a canceled one is never coming.
    expectedOverdue:
      part.expectedAt !== null &&
      part.expectedAt.getTime() < now &&
      !isTerminalPartStatus(part.status),
    stampLabel: part.receivedAt
      ? `Received ${format(part.receivedAt, "MMM d")}`
      : part.orderedAt
        ? `Ordered ${format(part.orderedAt, "MMM d")}`
        : null,
    notes: part.notes,
    vendorId: part.vendorId,
    poNumber: part.purchaseOrder?.number ?? null,
    poId: part.purchaseOrder?.id ?? null,
    productName: part.product?.name ?? null,
  }));

  const attachments: AttachmentRow[] = ticket.attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAtLabel: format(attachment.createdAt, "MMM d"),
    uploaderName: attachment.uploadedBy?.name ?? null,
    uploadedById: attachment.uploadedById,
  }));

  return (
    /*
      The scope carries ONE fact — the ticket's status — from the controls that
      change it (the update composer, the pickup buttons) to the two places
      that show it (the header badge, the pipeline tracker), so a status move
      lands on screen with the press instead of a round trip later. See
      components/tickets/ticket-status.tsx; everything below still receives the
      server's truth as a prop, and the scope only ever paints ahead of it
      while a write is actually in flight.
    */
    <TicketStatusScope status={ticket.status}>
      {/* gap-6 between page sections, gap-5 inside the two card stacks below —
          the same rhythm the customer and lead hubs use. */}
      <div className="flex flex-col gap-6">
        {/* ------------------------------------------------------------ header */}
        <ObjectHeader
          back={{ label: "Tickets", href: "/tickets" }}
          /*
            No charges yet, no headline. A ticket that has not been worked has
            nothing to say in the money slot, and rendering "$0.00" at 26px made
            the emptiest fact on the screen the loudest thing on it — on the
            intake screen a tech opens most often. With the slot empty the
            primitive promotes the subject, which is the answer to "what is this
            ticket?" anyway. The number reappears the moment a charge is added.
          */
          value={
            ticket.charges.length > 0
              ? formatCents(chargeTotals.totalCents)
              : undefined
          }
          title={ticket.subject}
          /*
            The problem type is editable where it already sat, rather than being
            promoted into the metadata strip to host a control. Six columns is
            the strip's ceiling and it is already at six — and moving the fact
            would have left the subtitle reading "opened Sep 4" on its own, which
            answers a question nobody asks.
          */
          subtitle={
            <span className="inline-flex flex-wrap items-baseline gap-x-1">
              <TicketProblemType
                ticketId={ticket.id}
                value={ticket.problemType}
                problemTypes={problemTypes(shop?.settings)}
              />
              <span>· opened {format(ticket.createdAt, "MMM d, yyyy")}</span>
            </span>
          }
          status={
            <>
              <LiveStatusBadge status={ticket.status} />
              {/* Status keeps the update composer — a status change is paired
                  with the note that explains it. Priority has no such pairing:
                  it is one value, and this is where it is read. */}
              <TicketPriority ticketId={ticket.id} value={ticket.priority} />
              {ticket.isWarranty ? (
                warrantyClaim ? (
                  <Link
                    href={`/invoices/${warrantyClaim.invoice.id}`}
                    title={`${warrantyClaim.description} · invoice #${warrantyClaim.invoice.number}`}
                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <StatusPill
                      tone="ready"
                      dot={false}
                      label={`Warranty · #${warrantyClaim.invoice.number}`}
                      className="hover:underline"
                    />
                  </Link>
                ) : (
                  <StatusPill tone="ready" dot={false} label="Warranty" />
                )
              ) : null}
            </>
          }
          id={<CopyableId value={`#${ticket.number}`} label="ticket number" />}
          meta={[
            {
              label: "Customer",
              value: (
                <Link
                  href={`/customers/${ticket.customer.id}`}
                  title={customerLabel(ticket.customer)}
                  className="font-medium text-accent-soft-foreground hover:underline"
                >
                  {customerLabel(ticket.customer)}
                </Link>
              ),
            },
            {
              label: "Device",
              value: ticket.asset ? (
                <span title={assetLabel(ticket.asset)}>
                  {assetLabel(ticket.asset)}
                </span>
              ) : (
                <span className="text-faint-foreground">—</span>
              ),
            },
            {
              label: "Assigned",
              value: (
                <TicketAssignee
                  ticketId={ticket.id}
                  value={ticket.assignedToId ?? ""}
                  currentLabel={ticket.assignedTo?.name ?? null}
                  techs={techs.map((tech) => ({
                    value: tech.id,
                    label: tech.name,
                  }))}
                />
              ),
            },
            {
              label: "Due",
              // Reads exactly as it did — the overdue chip, then the plain date
              // — but a day is now one click away instead of a round trip
              // through the edit form. `now` is the page's single request-time
              // clock, handed down so the chip means the same thing after
              // hydration as it did on the server.
              value: (
                <TicketDueDate
                  ticketId={ticket.id}
                  value={ticket.dueDate ? format(ticket.dueDate, "yyyy-MM-dd") : ""}
                  resolved={isResolved(ticket.status)}
                  nowMs={now}
                />
              ),
            },
            {
              label: "Location",
              value:
                locations.length > 1 ? (
                  // Which branch the device is physically at is a fact people
                  // change from this screen, and duplicating it into the body
                  // just to host the control would put the same fact in two
                  // places.
                  <TicketLocation
                    ticketId={ticket.id}
                    locationId={ticket.locationId}
                    locations={locations}
                  />
                ) : (
                  (ticket.location?.name ?? (
                    <span className="text-faint-foreground">—</span>
                  ))
                ),
            },
            {
              label: "Last touched",
              value: (
                <span
                  title={STALENESS_LABEL[level]}
                  className={cn(
                    "rf-num text-[12.5px]",
                    level === "none" || level === "fresh"
                      ? "text-muted-foreground"
                      : cn(
                          "inline-block rounded-sm px-1.5 py-0.5 font-semibold",
                          STALENESS_CLASS[level],
                        ),
                  )}
                >
                  {relativeShort(ticket.updatedAt, now)}
                </span>
              ),
            },
          ]}
          actions={
            /*
              LOCAL WORKAROUND, and the only one on these three screens.

              `ObjectHeader` pins its actions slot with `shrink-0`, so a row of
              six buttons keeps its full max-content width, refuses to wrap, and
              pushes the whole page into a horizontal scroll on a phone. The
              width cap below is what forces the wrap: `max-width` clamps an
              element's max-content contribution, so the header's slot stops
              asking for more room than the screen has. The subtracted figures
              are the app shell's own — 240px rail (md and up) plus the main and
              card padding.

              The real repair is one line in `components/ui/object-header.tsx`
              (`shrink-0` → `min-w-0`), which is off limits here; delete this
              wrapper the day that lands.
            */
            <div className="flex flex-wrap items-center gap-2">
              {/* First in the row on purpose: this is the button the counter
                  reaches for more than any other. */}
              <PickupActions
                ticketId={ticket.id}
                isReady={isReadyForPickup(ticket.status)}
                pickedUp={ticket.pickedUpAt !== null}
              />
              <Button asChild variant="outline" size="sm">
                <Link href={`/print/tickets/${ticket.id}`}>
                  <ICONS.print />
                  Work Order
                </Link>
              </Button>
              <SummarizeTicketButton ticketId={ticket.id} />
              <MakeInvoiceButton
                ticketId={ticket.id}
                chargeCount={uninvoicedCount}
                unbilledTimeCount={unbilledTime.length}
                unbilledTimeLabel={formatHm(unbilledTimeSeconds)}
                unbilledTimeValue={formatCents(unbilledTimeCents)}
              />
              <EditTicketDialog
                ticketId={ticket.id}
                values={{
                  subject: ticket.subject,
                  problemType: ticket.problemType,
                  priority: ticket.priority,
                  assignedToId: ticket.assignedToId,
                  assetId: ticket.assetId,
                  dueDate: ticket.dueDate
                    ? format(ticket.dueDate, "yyyy-MM-dd")
                    : "",
                  diagnosticNotes: ticket.diagnosticNotes ?? "",
                  warrantyInvoiceLineId: ticket.warrantyInvoiceLineId,
                }}
                warranties={warranties.map((row) => ({
                  value: row.id,
                  label: row.description,
                  hint: `Invoice #${row.invoiceNumber} · expires ${format(row.expiresAt, "MMM d, yyyy")}`,
                }))}
                problemTypes={problemTypes(shop?.settings)}
                techs={techs.map((t) => ({ value: t.id, label: t.name }))}
                assets={customerAssets.map((asset) => ({
                  value: asset.id,
                  label: assetLabel(asset),
                }))}
              />
              {role === "OWNER" ? (
                <DeleteTicketDialog
                  ticketId={ticket.id}
                  ticketNumber={ticket.number}
                />
              ) : null}
            </div>
          }
        />

        {/* ---------------------------------------------------------- progress */}
        <Card>
          <CardContent className="px-5 py-6">
            <LiveStatusProgress statuses={statuses} current={ticket.status} />
          </CardContent>
        </Card>

        {/* ------------------------------------------------------------- body */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <UpdateComposer
              ticketId={ticket.id}
              currentStatus={ticket.status}
              statuses={statuses}
              cannedResponses={cannedResponses}
              customerEmail={ticket.customer.email}
            />

            <ChargesCard
              ticketId={ticket.id}
              charges={ticket.charges}
              products={products}
              taxRateBps={shop?.taxRateBps ?? 0}
              warranty={ticket.isWarranty}
            />

            <ChecklistCard
              ticketId={ticket.id}
              items={checklist}
              templateId={ticket.checklistTemplateId}
              templates={checklistTemplates}
            />

            <PartsCard
              ticketId={ticket.id}
              ticketStatus={ticket.status}
              parts={partOrders}
              products={products.map((product) => ({
                id: product.id,
                name: product.name,
                costCents: role === "OWNER" ? product.costCents : null,
                vendorId: product.vendorId,
              }))}
              vendors={vendors}
              canPurchase={role === "OWNER"}
            />

            <Timeline
              now={now}
              statuses={statuses}
              entries={ticket.comments.map((comment) => ({
                id: comment.id,
                body: comment.body,
                isPublic: comment.isPublic,
                subject: comment.subject,
                updateType: comment.updateType,
                channel: comment.channel,
                createdAt: comment.createdAt,
                authorName: comment.author?.name ?? null,
              }))}
            />
          </div>

          <aside className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5 text-sm">
                <Fact label="Email" title={ticket.customer.email ?? undefined}>
                  {ticket.customer.email ? (
                    <a
                      href={`mailto:${ticket.customer.email}`}
                      className="text-accent-soft-foreground hover:underline"
                    >
                      {ticket.customer.email}
                    </a>
                  ) : (
                    <span className="text-faint-foreground">None on file</span>
                  )}
                </Fact>
                <Fact label="Phone">
                  {ticket.customer.mobile ?? ticket.customer.phone ?? (
                    <span className="text-faint-foreground">None on file</span>
                  )}
                </Fact>
                {ticket.resolvedAt ? (
                  <Fact label="Resolved">
                    {format(ticket.resolvedAt, "MMM d, yyyy h:mm a")}
                  </Fact>
                ) : null}
                {ticket.diagnosticNotes ? (
                  <div className="border-t border-border pt-3.5">
                    <p className="mb-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint-foreground">
                      Diagnostic notes
                    </p>
                    <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-foreground">
                      {ticket.diagnosticNotes}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <CustomFieldsCard
              ticketId={ticket.id}
              fields={readCustomFields(ticket.customFields)}
            />

            <TimerCard
              ticketId={ticket.id}
              entries={timeEntries}
              completedSeconds={completedSeconds}
              myRunningEntry={
                myRunningEntry
                  ? (timeEntries.find((e) => e.id === myRunningEntry.id) ?? null)
                  : null
              }
            />

            {role === "OWNER" || role === "FRONT_DESK" ? (
              <DepositCard
                ticketId={ticket.id}
                ticketNumber={ticket.number}
                customerName={customerLabel(ticket.customer)}
                deposits={deposits}
                isOwner={role === "OWNER"}
              />
            ) : null}

            <AttachmentsCard
              ticketId={ticket.id}
              attachments={attachments}
              currentUserId={userId}
              isOwner={role === "OWNER"}
            />
          </aside>
        </div>
      </div>
    </TicketStatusScope>
  );
}

/**
 * A key/value line in the sidebar's Details card.
 *
 * Wears the same label as the header's metadata columns — 11.5px, medium,
 * faint — so the two read as the same kind of fact rather than two competing
 * typographies. The facts that belong to the object itself (customer, device,
 * tech, due, location, staleness) live in the header strip; what is left here
 * is the contact detail you dial while the ticket is open.
 */
function Fact({
  label,
  title,
  children,
}: {
  label: string;
  /** The untruncated value, for the facts long enough to lose their tail. */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint-foreground">
        {label}
      </dt>
      <dd title={title} className="truncate text-[13.5px] text-foreground">
        {children}
      </dd>
    </div>
  );
}
