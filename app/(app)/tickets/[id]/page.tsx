import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Printer } from "lucide-react";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseChecklist } from "@/lib/checklist";
import { formatHm, labourAmountCents, readLabourSettings, roundSecondsUp } from "@/lib/labour";
import { activeLocations } from "@/lib/location";
import { formatCents } from "@/lib/money";
import { customerWarranties } from "@/lib/warranty";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
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
import { PriorityBadge } from "@/components/tickets/priority-badge";
import { StatusProgress } from "@/components/tickets/status-progress";
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
  problemTypes,
  RESOLVED_STATUS,
  STALENESS_CLASS,
  STALENESS_LABEL,
  stalenessLevel,
  ticketStatuses,
} from "@/components/tickets/ticket-meta";

export const dynamic = "force-dynamic";

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
      diagnosticNotes: true,
      customFields: true,
      assignedToId: true,
      assetId: true,
      checklist: true,
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
  const overdue =
    ticket.dueDate !== null &&
    ticket.dueDate.getTime() < now &&
    ticket.status !== RESOLVED_STATUS;
  const checklist = parseChecklist(ticket.checklist);

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
    <div className="flex flex-col gap-5">
      <Link
        href="/tickets"
        className="flex w-fit items-center gap-1.5 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All tickets
      </Link>

      {/* ------------------------------------------------------------ header */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xl font-bold leading-none tabular-nums tracking-tight text-foreground">
                  #{ticket.number}
                </span>
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                {ticket.isWarranty ? (
                  warrantyClaim ? (
                    <Link
                      href={`/invoices/${warrantyClaim.invoice.id}`}
                      className="rounded-full bg-status-ready-bg px-2.5 py-1 text-[12.5px] font-bold text-status-ready-fg hover:underline"
                      title={`${warrantyClaim.description} · invoice #${warrantyClaim.invoice.number}`}
                    >
                      Warranty · #{warrantyClaim.invoice.number}
                    </Link>
                  ) : (
                    <span className="rounded-full bg-status-ready-bg px-2.5 py-1 text-[12.5px] font-bold text-status-ready-fg">
                      Warranty
                    </span>
                  )
                ) : null}
                <span
                  title={STALENESS_LABEL[level]}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
                    STALENESS_CLASS[level],
                  )}
                >
                  {STALENESS_LABEL[level]}
                </span>
              </div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
                {ticket.subject}
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/print/tickets/${ticket.id}`}>
                  <Printer /> Work Order
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
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Fact label="Customer">
              <Link
                href={`/customers/${ticket.customer.id}`}
                className="text-accent hover:underline"
              >
                {customerLabel(ticket.customer)}
              </Link>
            </Fact>
            <Fact label="Device">
              {ticket.asset ? assetLabel(ticket.asset) : "—"}
            </Fact>
            <Fact label="Problem">{ticket.problemType}</Fact>
            <Fact label="Tech">
              {ticket.assignedTo?.name ?? (
                <span className="text-faint-foreground">Unassigned</span>
              )}
            </Fact>
            <Fact label="Created">
              {format(ticket.createdAt, "MMM d, yyyy")}
            </Fact>
            <Fact label="Due">
              {ticket.dueDate ? (
                <span className={overdue ? "font-medium text-status-overdue" : ""}>
                  {format(ticket.dueDate, "MMM d, yyyy")}
                  {overdue ? " · overdue" : ""}
                </span>
              ) : (
                "—"
              )}
            </Fact>
          </dl>
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- progress */}
      <Card>
        <CardContent className="px-5 py-6">
          <StatusProgress statuses={statuses} current={ticket.status} />
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
            <CardContent className="flex flex-col gap-4 text-sm">
              <Fact label="Email">
                {ticket.customer.email ? (
                  <a
                    href={`mailto:${ticket.customer.email}`}
                    className="text-accent hover:underline"
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
              <Fact label="Location">
                {locations.length > 1 ? (
                  <TicketLocation
                    ticketId={ticket.id}
                    locationId={ticket.locationId}
                    locations={locations}
                  />
                ) : (
                  (ticket.location?.name ?? "—")
                )}
              </Fact>
              {ticket.resolvedAt ? (
                <Fact label="Resolved">
                  {format(ticket.resolvedAt, "MMM d, yyyy h:mm a")}
                </Fact>
              ) : null}
              {ticket.diagnosticNotes ? (
                <div className="border-t border-border pt-4">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Diagnostic notes
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed text-foreground">
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
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-[14.5px] font-semibold text-foreground">{children}</dd>
    </div>
  );
}
