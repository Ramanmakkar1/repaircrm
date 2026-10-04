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
import { readUiPrefs } from "@/lib/prefs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { CopyableId } from "@/components/ui/copyable-id";
import { ICONS } from "@/components/ui/icons";
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
import { MoreActions } from "@/components/tickets/more-actions";
import { PickupActions } from "@/components/tickets/pickup-actions";
import { RepairHeader } from "@/components/tickets/repair-header";
import { deviceName, dueWords, repairNextStep } from "@/components/tickets/repair-card-facts";
import { JobActionsProvider } from "@/components/tickets/job-actions";
import { JobHeader } from "@/components/tickets/job-header";
import { JobPrimaryAction } from "@/components/tickets/job-primary-action";
import { JobQuickActions } from "@/components/tickets/job-quick-actions";
import {
  JobBillLink,
  JobBlockTitle,
  JobDetailList,
  JobMoneyLinks,
  JobScreen,
  JobTabs,
} from "@/components/tickets/job-screen";
import {
  inProgressTarget,
  intakePhotoId,
  jobActions,
  jobTabHref,
  openPartCount,
  parseCompose,
  parseJobTab,
  phoneLinks,
  pickJobInvoice,
} from "@/components/tickets/job-screen-logic";
import { JobSummary } from "@/components/tickets/job-summary";
import { StatusSteps } from "@/components/tickets/status-steps";
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
    title: ticket ? `Repair #${ticket.number} · Repairs helper` : "Repair · Repairs helper",
  };
}

/** The one big black button at the top of a repair. */
const BIG_BUTTON = "h-12 px-6 text-base [&_svg]:size-5";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { shopId, userId, role } = await requireUser();
  const [{ id }, query, prefs] = await Promise.all([params, searchParams, readUiPrefs()]);

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
      // The documents made from this repair, newest first: the Money section
      // links to them and the big button opens the unpaid one.
      invoices: {
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, status: true },
      },
      estimates: {
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, status: true },
      },
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
  const device = deviceName(ticket.asset);

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

  // The device has gone home: there is nothing left to hand over, so the next
  // step on this screen is billing.
  const handedOver = ticket.pickedUpAt !== null;
  const nothingToBill = uninvoicedCount === 0 && unbilledTime.length === 0;
  const nextStep = repairNextStep({ pickedUp: handedOver, nothingToBill });
  const invoiceProps = {
    ticketId: ticket.id,
    chargeCount: uninvoicedCount,
    unbilledTimeCount: unbilledTime.length,
    unbilledTimeLabel: formatHm(unbilledTimeSeconds),
    unbilledTimeValue: formatCents(unbilledTimeCents),
  };

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

  // -------------------------------------------------------------------------
  // The pieces both layouts are made of.
  //
  // Full mode lays them out the way the page always has (header, tracker, two
  // columns). Easy mode puts the very same elements, with the very same props,
  // on tabs. Building each once is what guarantees that a card moved onto a tab
  // still does exactly what it did in a column.
  // -------------------------------------------------------------------------
  const easy = prefs.simple;
  const problemTypeList = problemTypes(shop?.settings);
  const techOptions = techs.map((tech) => ({ value: tech.id, label: tech.name }));
  const customerName = customerLabel(ticket.customer);
  const dash = <span className="text-faint-foreground">—</span>;

  const warrantyPill = ticket.isWarranty ? (
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
  ) : null;

  const assigneeControl = (
    <TicketAssignee
      ticketId={ticket.id}
      value={ticket.assignedToId ?? ""}
      currentLabel={ticket.assignedTo?.name ?? null}
      techs={techOptions}
    />
  );

  // The overdue chip, then the plain date — and a day is one tap away instead
  // of a round trip through the edit form. `now` is the page's single
  // request-time clock, handed down so the chip means the same thing after
  // hydration as it did on the server.
  const dueControl = (
    <TicketDueDate
      ticketId={ticket.id}
      value={ticket.dueDate ? format(ticket.dueDate, "yyyy-MM-dd") : ""}
      resolved={isResolved(ticket.status)}
      nowMs={now}
      // Easy mode shows the due time in two places (the header chip and this field);
      // both measure from the exact time, as the repair list does.
      exactDue={easy ? (ticket.dueDate?.toISOString() ?? null) : undefined}
    />
  );

  // Which branch the device is physically at is a fact people change from this
  // screen, and duplicating it into the body just to host the control would put
  // the same fact in two places.
  const locationControl =
    locations.length > 1 ? (
      <TicketLocation
        ticketId={ticket.id}
        locationId={ticket.locationId}
        locations={locations}
      />
    ) : (
      (ticket.location?.name ?? dash)
    );

  const lastTouched = (
    <span
      title={STALENESS_LABEL[level]}
      className={cn(
        "rf-num text-sm",
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
  );

  const deviceValue = ticket.asset ? (
    <span title={assetLabel(ticket.asset)}>{assetLabel(ticket.asset)}</span>
  ) : (
    dash
  );

  const timelineEntries = ticket.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    isPublic: comment.isPublic,
    subject: comment.subject,
    updateType: comment.updateType,
    channel: comment.channel,
    createdAt: comment.createdAt,
    authorName: comment.author?.name ?? null,
  }));

  const chargesCard = (
    <ChargesCard
      ticketId={ticket.id}
      charges={ticket.charges}
      products={products}
      taxRateBps={shop?.taxRateBps ?? 0}
      warranty={ticket.isWarranty}
      easy={easy}
    />
  );

  const checklistCard = (
    <ChecklistCard
      ticketId={ticket.id}
      items={checklist}
      templateId={ticket.checklistTemplateId}
      templates={checklistTemplates}
    />
  );

  const partsCard = (
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
  );

  const timelineCard = (
    <Timeline now={now} statuses={statuses} entries={timelineEntries} easy={easy} />
  );

  const customFieldsCard = (
    <CustomFieldsCard
      ticketId={ticket.id}
      fields={readCustomFields(ticket.customFields)}
    />
  );

  const timerCard = (
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
  );

  const depositCard =
    role === "OWNER" || role === "FRONT_DESK" ? (
      <DepositCard
        ticketId={ticket.id}
        ticketNumber={ticket.number}
        customerName={customerName}
        deposits={deposits}
        isOwner={role === "OWNER"}
      />
    ) : null;

  const attachmentsCard = (
    <AttachmentsCard
      ticketId={ticket.id}
      attachments={attachments}
      currentUserId={userId}
      isOwner={role === "OWNER"}
      easy={easy}
    />
  );

  /** Print, summarize, invoice, edit, delete: everything that is not the next step. */
  const moreActions = (showInvoice: boolean) => (
    <MoreActions>
      <Button asChild variant="outline">
        <Link href={`/print/tickets/${ticket.id}`}>
          <ICONS.print />
          Print work order
        </Link>
      </Button>
      <SummarizeTicketButton ticketId={ticket.id} />
      {showInvoice ? (
        <MakeInvoiceButton {...invoiceProps} trigger={{ variant: "outline", size: "default" }} />
      ) : null}
      <EditTicketDialog
        ticketId={ticket.id}
        trigger={{ variant: "outline", size: "default" }}
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
        problemTypes={problemTypeList}
        techs={techOptions}
        assets={customerAssets.map((asset) => ({
          value: asset.id,
          label: assetLabel(asset),
        }))}
      />
      {role === "OWNER" ? (
        <DeleteTicketDialog
          ticketId={ticket.id}
          ticketNumber={ticket.number}
          labelled
        />
      ) : null}
    </MoreActions>
  );

  // ===========================================================================
  // EASY MODE — a repair job screen, like a POS: who and what, where it stands,
  // one big next step, quick actions, and one section at a time.
  // ===========================================================================
  if (easy) {
    const tab = parseJobTab(query.tab);
    const compose = parseCompose(query.compose);
    const invoice = pickJobInvoice(ticket.invoices);
    const inProgress = inProgressTarget(statuses, ticket.status);
    // When the big button already is "Make invoice", the menu does not offer it a second time.
    const showsInvoiceButton =
      jobActions({ status: ticket.status, pickedUp: handedOver, unbilled: !nothingToBill, invoice }).primary ===
      "invoice";
    const firstName = ticket.customer.firstName.trim() || customerName;
    const dialLinks = phoneLinks(ticket.customer.mobile ?? ticket.customer.phone);
    const primaryProps = {
      pickedUp: handedOver,
      unbilled: !nothingToBill,
      customerName: firstName,
      invoice,
      invoiceProps,
      inProgress,
    };

    return (
      <TicketStatusScope status={ticket.status}>
        <JobActionsProvider
          ticketId={ticket.id}
          status={ticket.status}
          statuses={statuses}
          pickedUp={handedOver}
          customerName={firstName}
          customerEmail={ticket.customer.email}
          cannedResponses={cannedResponses}
        >
          <JobScreen
            header={
              <JobHeader
                back={{ label: "Repairs", href: "/tickets" }}
                number={ticket.number}
                title={device ?? ticket.subject}
                subject={device ? ticket.subject : null}
                deviceType={ticket.asset?.type}
                photoId={intakePhotoId(ticket.attachments)}
                status={
                  <>
                    <LiveStatusBadge status={ticket.status} className="py-1 text-[13px]" />
                    {handedOver ? (
                      <PickupActions ticketId={ticket.id} isReady={isReadyForPickup(ticket.status)} pickedUp />
                    ) : null}
                  </>
                }
                due={dueWords(ticket.dueDate, isResolved(ticket.status), now)}
                priority={ticket.priority}
                customer={{
                  id: ticket.customer.id,
                  name: customerName,
                  phone: ticket.customer.mobile ?? ticket.customer.phone,
                }}
                extras={warrantyPill}
                more={moreActions(!showsInvoiceButton)}
              />
            }
            steps={<StatusSteps statuses={statuses} />}
            side={
              <>
                <JobPrimaryAction {...primaryProps} placement="side" />
                <JobSummary
                  facts={[
                    { label: "Device", value: deviceValue, wide: true },
                    { label: "Assigned to", value: assigneeControl },
                    { label: "Due", value: dueControl },
                    { label: "Location", value: locationControl },
                    { label: "Last touched", value: lastTouched },
                  ]}
                />
                <JobQuickActions
                  ticketId={ticket.id}
                  products={products.map((product) => ({
                    id: product.id,
                    name: product.name,
                    costCents: role === "OWNER" ? product.costCents : null,
                    vendorId: product.vendorId,
                  }))}
                  vendors={vendors}
                  invoice={invoice}
                  invoiceProps={invoiceProps}
                />
              </>
            }
            main={
              <>
                <JobTabs
                  ticketId={ticket.id}
                  active={tab}
                  counts={{
                    openParts: openPartCount(ticket.partOrders),
                    comments: ticket.comments.length,
                    attachments: ticket.attachments.length,
                    charges: ticket.charges.length,
                  }}
                />

                {tab === "work" ? (
                  <>
                    <JobBillLink
                      href={jobTabHref(ticket.id, "money")}
                      lines={ticket.charges.length}
                      total={ticket.charges.length > 0 ? formatCents(chargeTotals.totalCents) : null}
                    />
                    {partsCard}
                    {checklistCard}
                    {timerCard}
                  </>
                ) : null}

                {tab === "updates" ? (
                  <>
                    <UpdateComposer
                      key={compose ?? "none"}
                      easy
                      ticketId={ticket.id}
                      currentStatus={ticket.status}
                      statuses={statuses}
                      cannedResponses={cannedResponses}
                      customerEmail={ticket.customer.email}
                      initialPublic={compose === "message"}
                      autoFocus={compose !== null}
                    />
                    {timelineCard}
                  </>
                ) : null}

                {tab === "photos" ? attachmentsCard : null}

                {tab === "customer" ? (
                  <>
                    <JobDetailList
                      rows={[
                        {
                          label: "Customer",
                          value: (
                            <Link
                              href={`/customers/${ticket.customer.id}`}
                              className="font-semibold text-accent-soft-foreground hover:underline"
                            >
                              {customerName}
                            </Link>
                          ),
                        },
                        {
                          label: "Phone",
                          value: dialLinks ? (
                            <a href={dialLinks.tel} className="text-accent-soft-foreground hover:underline">
                              {dialLinks.display}
                            </a>
                          ) : (
                            <span className="text-faint-foreground">None on file</span>
                          ),
                        },
                        {
                          label: "Email",
                          value: ticket.customer.email ? (
                            <a
                              href={`mailto:${ticket.customer.email}`}
                              className="text-accent-soft-foreground hover:underline"
                            >
                              {ticket.customer.email}
                            </a>
                          ) : (
                            <span className="text-faint-foreground">None on file</span>
                          ),
                        },
                        { label: "Device", value: deviceValue },
                        {
                          label: "Problem type",
                          value: (
                            <TicketProblemType
                              ticketId={ticket.id}
                              value={ticket.problemType}
                              problemTypes={problemTypeList}
                            />
                          ),
                        },
                        {
                          label: "Priority",
                          value: <TicketPriority ticketId={ticket.id} value={ticket.priority} />,
                        },
                        { label: "Assigned to", value: assigneeControl },
                        { label: "Due", value: dueControl },
                        { label: "Location", value: locationControl },
                        { label: "Opened", value: format(ticket.createdAt, "MMM d, yyyy") },
                        ...(ticket.resolvedAt
                          ? [{ label: "Resolved", value: format(ticket.resolvedAt, "MMM d, yyyy h:mm a") }]
                          : []),
                        ...(ticket.pickedUpAt
                          ? [{ label: "Picked up", value: format(ticket.pickedUpAt, "MMM d, yyyy h:mm a") }]
                          : []),
                        ...(warrantyPill ? [{ label: "Warranty", value: warrantyPill }] : []),
                        {
                          label: "Repair number",
                          value: <CopyableId value={`#${ticket.number}`} label="repair number" />,
                        },
                      ]}
                    />
                    {ticket.diagnosticNotes ? (
                      <section className="flex flex-col gap-2">
                        <JobBlockTitle>Diagnostic notes</JobBlockTitle>
                        <p className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-base leading-relaxed text-foreground">
                          {ticket.diagnosticNotes}
                        </p>
                      </section>
                    ) : null}
                    {customFieldsCard}
                  </>
                ) : null}

                {tab === "money" ? (
                  <>
                    <JobMoneyLinks
                      invoices={ticket.invoices}
                      estimates={ticket.estimates}
                    />
                    {chargesCard}
                    {depositCard}
                  </>
                ) : null}
              </>
            }
            pinned={<JobPrimaryAction {...primaryProps} placement="pinned" />}
          />
        </JobActionsProvider>
      </TicketStatusScope>
    );
  }

  // ===========================================================================
  // FULL MODE — the dense back-office layout, exactly as it has always been.
  // ===========================================================================
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
        {/*
          One big title, the status beside it, the customer one tap away, and
          ONE black button: the next step for this repair. Everything else
          (print, summarize, invoice, edit, delete) sits behind "More".

          The next step follows the repair: while the device is still here it is
          the notice / hand-over, which is the first thing this page has always
          offered; once it has gone it is the invoice, if there is anything left
          to bill.
        */}
        <RepairHeader
          back={{ label: "Repairs", href: "/tickets" }}
          number={ticket.number}
          title={device ?? ticket.subject}
          subject={device ? ticket.subject : null}
          status={
            <>
              <LiveStatusBadge status={ticket.status} className="py-1 text-[13px]" />
              {handedOver ? (
                <PickupActions
                  ticketId={ticket.id}
                  isReady={isReadyForPickup(ticket.status)}
                  pickedUp
                />
              ) : null}
            </>
          }
          customer={{
            id: ticket.customer.id,
            name: customerName,
            phone: ticket.customer.mobile ?? ticket.customer.phone,
          }}
          details={
            <>
              {/* Status keeps the update composer — a status change is paired
                  with the note that explains it. Priority has no such pairing:
                  it is one value, and this is where it is read. */}
              <TicketPriority ticketId={ticket.id} value={ticket.priority} />
              {warrantyPill}
              {/* The problem type is editable where it already sat. */}
              <TicketProblemType
                ticketId={ticket.id}
                value={ticket.problemType}
                problemTypes={problemTypeList}
              />
              <span>Opened {format(ticket.createdAt, "MMM d, yyyy")}</span>
              {/* The number is already in the title; the copy button is for the desk,
                  not the phone, where a second 48px row for it is not worth the room. */}
              <span className="hidden sm:inline-flex">
                <CopyableId value={`#${ticket.number}`} label="repair number" />
              </span>
            </>
          }
          primary={
            nextStep === "pickup" ? (
              <PickupActions
                ticketId={ticket.id}
                isReady={isReadyForPickup(ticket.status)}
                pickedUp={false}
                prominent
              />
            ) : nextStep === "invoice" ? (
              <MakeInvoiceButton {...invoiceProps} trigger={{ size: "lg", className: BIG_BUTTON }} />
            ) : null
          }
          more={moreActions(nextStep !== "invoice")}
          facts={[
            { label: "Device", value: deviceValue },
            { label: "Assigned to", value: assigneeControl },
            { label: "Due", value: dueControl },
            { label: "Location", value: locationControl },
            { label: "Last touched", value: lastTouched },
            // No charges yet, no total: "$0.00" would be the loudest fact on
            // the screen about the emptiest thing on it.
            ...(ticket.charges.length > 0
              ? [
                  {
                    label: "Total",
                    value: (
                      <span className="rf-num font-semibold">
                        {formatCents(chargeTotals.totalCents)}
                      </span>
                    ),
                  },
                ]
              : []),
          ]}
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

            {chargesCard}

            {checklistCard}

            {partsCard}

            {timelineCard}
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
                    <p className="mb-1.5 text-sm text-muted-foreground">
                      Diagnostic notes
                    </p>
                    <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                      {ticket.diagnosticNotes}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {customFieldsCard}

            {timerCard}

            {depositCard}

            {attachmentsCard}
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
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd title={title} className="truncate text-base text-foreground">
        {children}
      </dd>
    </div>
  );
}
