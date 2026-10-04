import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { estimateTokenPath, portalUrl } from "@/lib/comms";
import {
  defaultEstimateMessage,
  defaultEstimateSubject,
} from "@/lib/comms/documents";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import { readUiPrefs } from "@/lib/prefs";
import { taxLabel } from "@/lib/tax";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { CopyableId } from "@/components/ui/copyable-id";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ActionForm } from "@/components/billing/action-form";
import {
  docTabs,
  estimateActivity,
  estimatePrimaryLabel,
  estimateTiles,
  parseDocTab,
  quoteBlock,
} from "@/components/billing/bill-display";
import { BillSummary, PinnedAction, QuoteHero } from "@/components/billing/bill-hero";
import {
  ActivityList,
  EmptyLines,
  FactList,
  LineList,
  Section,
  TotalsBlock,
  type TotalRow,
} from "@/components/billing/bill-lines";
import { EstimateActionMenu } from "@/components/billing/estimate-action-menu";
import { estimatePrimaryAction } from "@/components/billing/primary-action";
import { CopyLinkTile } from "@/components/billing/quick-tiles";
import { TILE_CLASS } from "@/components/billing/tile-style";
import { primaryPhone, telHref } from "@/components/customers/customer-facts";
import { messageOutcome } from "@/components/billing/bill-display";
import { shopNow, shopWall } from "@/components/billing/shop-clock";
import { safeTimeZone } from "@/lib/dashboard/logic";
import { formatDate } from "@/components/billing/format";
import { SendDocumentDialog } from "@/components/billing/send-dialog";
import { ShareRow } from "@/components/billing/send-links";
import { relativeTime, type SendDocument } from "@/components/billing/send-types";
import { SignatureDialog } from "@/components/billing/signature-dialog";
import {
  EstimateStatusBadge,
  InvoiceStatusBadge,
} from "@/components/billing/status-badge";
import {
  approveEstimateAction,
  approveWithSignatureAction,
  convertEstimateAction,
  declineEstimateAction,
  previewEstimateSendAction,
  sendEstimateAction,
} from "../actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;
  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    select: { number: true },
  });
  return {
    title: estimate
      ? `Estimate #${estimate.number} · Repairs helper`
      : "Estimate · Repairs helper",
  };
}

export default async function EstimateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { shopId } = await requireUser();
  const [{ id }, prefs, query] = await Promise.all([params, readUiPrefs(), searchParams]);
  // Easy mode (the default): one big action chosen by status, the rest under "More".
  const easy = prefs.simple;

  const estimate = await db.estimate.findFirst({
    where: { id, shopId },
    include: {
      customer: true,
      taxRate: { select: { name: true } },
      shop: { select: { name: true, timezone: true } },
      ticket: { select: { id: true, number: true, subject: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      invoices: {
        orderBy: { number: "asc" },
        select: { id: true, number: true, status: true, createdAt: true },
      },
    },
  });
  if (!estimate) notFound();

  const totals = calcTotals(estimate.lines, estimate.taxRateBps);
  const customerName =
    estimate.customer.businessName ||
    `${estimate.customer.firstName} ${estimate.customer.lastName}`;

  const converted = estimate.status === "CONVERTED";
  const canEdit = !converted;
  const canApprove = ["DRAFT", "SENT", "DECLINED"].includes(estimate.status);
  const canDecline = ["DRAFT", "SENT", "APPROVED"].includes(estimate.status);
  const canConvert =
    ["DRAFT", "SENT", "APPROVED"].includes(estimate.status) &&
    estimate.lines.length > 0;

  // The shop's clock: the expiry is a calendar day, read against the shop's
  // own "now", and every instant below prints in the shop's zone.
  const zone = safeTimeZone(estimate.shop.timezone);
  const wallNow = shopNow(requestNow(), zone);
  const expired =
    estimate.expiresAt !== null &&
    estimate.expiresAt.getTime() < wallNow &&
    (estimate.status === "DRAFT" || estimate.status === "SENT");

  // ---------------------------------------------------------------- sending
  // CommunicationLog can link to a ticket or an invoice, but the schema has no
  // estimateId column — so "when did we last send this estimate?" is answered
  // by scanning the customer's recent outbound rows for this estimate's number.
  // Matched in JS with a word boundary rather than a SQL `contains`, which
  // would happily count "Estimate #70" as a send of estimate #7.
  const recentSends = await db.communicationLog.findMany({
    where: { shopId, customerId: estimate.customerId, direction: "OUT" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      createdAt: true,
      type: true,
      direction: true,
      to: true,
      status: true,
      subject: true,
      body: true,
    },
  });

  const numberPattern = new RegExp(`Estimate #${estimate.number}\\b`);
  const lastSent = recentSends.find(
    (row) =>
      numberPattern.test(row.subject ?? "") || numberPattern.test(row.body),
  );

  const lastSentChannel = lastSent?.type === "SMS" ? "SMS" : "email";
  const lastSentHint = lastSent
    ? lastSent.status === "sent" || lastSent.status === "logged"
      ? `Last sent ${relativeTime(
          lastSent.createdAt.toISOString(),
        )} by ${lastSentChannel}`
      : `Last ${lastSentChannel} attempt ${relativeTime(
          lastSent.createdAt.toISOString(),
        )} — ${lastSent.status}`
    : null;

  const sendDoc: SendDocument = {
    id: estimate.id,
    kind: "estimate",
    label: `Estimate #${estimate.number}`,
    customerName,
    defaultSubject: defaultEstimateSubject(estimate.number, estimate.shop.name),
    defaultMessage: defaultEstimateMessage(estimate.number, totals.totalCents),
    email: estimate.customer.email,
    emailOptIn: estimate.customer.emailOptIn,
    mobile: estimate.customer.mobile,
    smsOptIn: estimate.customer.smsOptIn,
    alreadySent: estimate.status !== "DRAFT",
    lastSentHint,
  };

  // Same frictionless link the email and the SMS carry — it lands the customer
  // on the approve/decline buttons without a sign-in in the way.
  const viewUrl = portalUrl(estimateTokenPath(estimate.publicToken));

  /*
   * An estimate has exactly one number worth putting at the top: what the job
   * is quoted at. Unlike an invoice there is no balance — nothing is owed
   * until the work is approved and billed — so the total takes the headline
   * slot and the strip underneath carries who, when and until when.
   */
  const headlineHint = converted
    ? "Estimated total — already converted to an invoice"
    : expired
      ? "Estimated total — this quote has expired"
      : "Estimated total";

  const fullHeader = (
    <ObjectHeader
      back={{ label: "Estimates", href: "/estimates" }}
      value={formatCents(totals.totalCents)}
      /* Same de-duplication as the invoice: the number is the id, so the
         title slot carries who the quote is for. */
      title={
        <Link
          href={`/customers/${estimate.customer.id}`}
          className="hover:underline"
        >
          {customerName}
        </Link>
      }
      subtitle={headlineHint}
      status={<EstimateStatusBadge status={estimate.status} size="md" />}
      id={
        <CopyableId
          value={`Estimate #${estimate.number}`}
          label="estimate number"
        />
      }
      meta={[
        { label: "Tax", value: formatCents(totals.taxCents) },
        { label: "Quoted", value: formatDate(estimate.createdAt, zone) },
        {
          label: "Expires",
          value: (
            <span className={cn(expired && "text-status-overdue-fg")}>
              {estimate.expiresAt ? formatDate(estimate.expiresAt) : "No expiry"}
            </span>
          ),
        },
        {
          label: "Approved",
          value: estimate.approvedAt ? formatDate(estimate.approvedAt, zone) : "—",
        },
        {
          label: "Repair",
          value: estimate.ticket ? (
            <Link
              href={`/tickets/${estimate.ticket.id}`}
              className="font-medium text-accent-soft-foreground hover:underline"
            >
              #{estimate.ticket.number}
            </Link>
          ) : (
            "—"
          ),
        },
      ]}
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/print/estimates/${estimate.id}`} target="_blank">
              <ACTIONS.print /> Print
            </Link>
          </Button>

          {canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/estimates/${estimate.id}/edit`}>
                <ACTIONS.edit /> Edit
              </Link>
            </Button>
          ) : null}

          {canApprove ? (
            <>
              <ActionForm
                action={approveEstimateAction}
                fields={{ id: estimate.id }}
                variant="outline"
                size="sm"
                pendingLabel="Approving…"
              >
                <ACTIONS.approve /> Approve
              </ActionForm>
              <SignatureDialog
                action={approveWithSignatureAction}
                documentId={estimate.id}
                title="Approve with signature"
                description={`Have ${customerName} sign to authorise the work on estimate #${estimate.number}.`}
                triggerLabel="Approve + sign"
                triggerSize="sm"
              />
            </>
          ) : null}

          {canDecline ? (
            <ActionForm
              action={declineEstimateAction}
              fields={{ id: estimate.id }}
              variant="outline"
              size="sm"
              pendingLabel="Saving…"
            >
              <ACTIONS.decline /> Decline
            </ActionForm>
          ) : null}

          {canConvert ? (
            <ActionForm
              action={convertEstimateAction}
              fields={{ id: estimate.id }}
              variant="outline"
              size="sm"
              pendingLabel="Converting…"
            >
              <ACTIONS.convert /> Convert to invoice
            </ActionForm>
          ) : null}

          {/* A converted estimate is frozen — the invoice is the record of
              what was agreed, so re-sending the quote would confuse the
              customer about which document is live. */}
          {!converted ? (
            <SendDocumentDialog
              doc={sendDoc}
              previewAction={previewEstimateSendAction}
              sendAction={sendEstimateAction}
              size="sm"
            />
          ) : null}
        </>
      }
    />
  );

  // ============================================================== Easy: the quote
  // The same POS-style screen as the invoice: the quote behind four big tabs on
  // the left, the till on the right (who, the quoted total, the one big button
  // for this state, a few tiles). Each action is the one the Full layout has.
  if (easy) {
    // Calendar rules ("Expires Oct 10", "Approved Sep 29") read the shop's wall clock.
    const now = wallNow;
    const tab = parseDocTab(query.tab);
    const basePath = `/estimates/${estimate.id}`;
    const printHref = `/print/estimates/${estimate.id}`;

    const primary = estimatePrimaryAction({
      status: estimate.status,
      canConvert,
      hasInvoice: estimate.invoices.length > 0,
    });
    const firstInvoice = estimate.invoices[0];
    const alreadySent = estimate.status !== "DRAFT";
    const primaryLabel = estimatePrimaryLabel(primary, {
      alreadySent,
      invoiceNumber: firstInvoice?.number ?? null,
      declined: estimate.status === "DECLINED",
    });
    // A send that did not reach them is a warning with a way to fix it, not a
    // grey footnote under the tiles.
    const sendTrouble = lastSent ? messageOutcome(lastSent.status) : null;
    const troubled = Boolean(sendTrouble?.alert);
    // The hint sits under the tiles, once, instead of inside each send button.
    const quietDoc: SendDocument = { ...sendDoc, lastSentHint: null };
    const phone = primaryPhone(estimate.customer).value || null;

    const block = quoteBlock(
      {
        status: estimate.status,
        totalCents: totals.totalCents,
        expiresAt: estimate.expiresAt,
        approvedAt: shopWall(estimate.approvedAt, zone),
        expired,
      },
      now,
    );

    /** The one big button. Built per call so the phone's pinned copy is its own. */
    const bigAction = (): React.ReactNode => {
      if (primary === "send") {
        return (
          <SendDocumentDialog
            doc={quietDoc}
            previewAction={previewEstimateSendAction}
            sendAction={sendEstimateAction}
            size="lg"
            appearance="big"
          />
        );
      }
      if (primary === "approve") {
        return (
          <ActionForm
            action={approveEstimateAction}
            fields={{ id: estimate.id }}
            size="lg"
            pendingLabel="Saving…"
            className="w-full"
            buttonClassName="h-14 w-full px-6 text-lg [&_svg]:size-5"
          >
            <ACTIONS.approve /> {primaryLabel}
          </ActionForm>
        );
      }
      if (primary === "convert") {
        return (
          <ActionForm
            action={convertEstimateAction}
            fields={{ id: estimate.id }}
            size="lg"
            pendingLabel="Converting…"
            className="w-full"
            buttonClassName="h-14 w-full px-6 text-lg [&_svg]:size-5"
          >
            <ACTIONS.convert /> {primaryLabel}
          </ActionForm>
        );
      }
      if (primary === "invoice" && firstInvoice) {
        return (
          <Button asChild className="h-14 w-full px-6 text-lg [&_svg]:size-5">
            <Link href={`/invoices/${firstInvoice.id}`}>
              <ICONS.invoice /> {primaryLabel}
            </Link>
          </Button>
        );
      }
      return null;
    };

    const tileKeys = estimateTiles({ primary, status: estimate.status });
    const tiles = tileKeys.map((tile) => {
      switch (tile) {
        case "send":
          // Two tiles of the one send dialog: "Send again" and "Message".
          return (
            <SendDocumentDialog
              key="send"
              doc={quietDoc}
              previewAction={previewEstimateSendAction}
              sendAction={sendEstimateAction}
              size="lg"
              appearance="tiles"
            />
          );
        case "print":
          return (
            <Link key="print" href={printHref} target="_blank" data-touch-control className={TILE_CLASS}>
              <ACTIONS.print aria-hidden />
              Print
            </Link>
          );
        case "copy":
          return <CopyLinkTile key="copy" url={viewUrl} />;
        case "sign":
          // Approve with the customer's signature, on this screen.
          return canApprove ? (
            <SignatureDialog
              key="sign"
              action={approveWithSignatureAction}
              documentId={estimate.id}
              title="Approve with signature"
              description={`Have ${customerName} sign to agree to the work on estimate #${estimate.number}.`}
              triggerLabel="Sign on screen"
              triggerClassName={TILE_CLASS}
            />
          ) : null;
        case "edit":
          return canEdit ? (
            <Link key="edit" href={`${basePath}/edit`} data-touch-control className={TILE_CLASS}>
              <ACTIONS.edit aria-hidden />
              Edit
            </Link>
          ) : null;
        case "more":
          return (
            <Fragment key="more">
              <EstimateActionMenu
                tile
                estimateId={estimate.id}
                estimateNumber={estimate.number}
                customerName={customerName}
                printHref={printHref}
                editHref={canEdit ? `${basePath}/edit` : null}
                approve={canApprove && primary !== "approve" ? { action: approveEstimateAction } : null}
                approveWithSignature={canApprove ? { action: approveWithSignatureAction } : null}
                decline={canDecline ? { action: declineEstimateAction } : null}
                convert={canConvert && primary !== "convert" ? { action: convertEstimateAction } : null}
              />
            </Fragment>
          );
        default:
          return null;
      }
    });

    // ------------------------------------------------------------- Quote tab
    const totalRows: TotalRow[] = [
      { label: "Subtotal", value: formatCents(totals.subtotalCents) },
      {
        label: taxLabel(estimate.taxRate?.name, estimate.taxRateBps),
        value: formatCents(totals.taxCents),
      },
      {
        label: "Estimated total",
        value: formatCents(totals.totalCents),
        size: "large",
        divider: true,
      },
    ];

    const quotePanel = (
      <>
        <Section title="Items">
          {estimate.lines.length === 0 ? (
            // A quote with nothing on it is unfinished: the way out is the edit screen.
            <EmptyLines
              icon="estimate"
              title="Nothing quoted yet"
              hint="Add the parts and labour this job needs and the customer gets a number to approve."
              action={
                canEdit ? (
                  <Button asChild className="h-12 px-6 text-base">
                    <Link href={`${basePath}/edit`}>
                      <ACTIONS.add /> Add line items
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <LineList lines={estimate.lines} />
          )}
        </Section>

        {estimate.lines.length > 0 ? <TotalsBlock rows={totalRows} /> : null}

        {/* What this quote turned into. A quote can be billed more than once (a
            deposit, then the balance), so the question is which invoice, in
            what state. */}
        {estimate.invoices.length > 0 ? (
          <Section title="Invoices raised">
            <ul className="flex flex-col gap-2">
              {estimate.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    data-touch-control
                    className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-lg font-semibold text-foreground">Invoice #{invoice.number}</span>
                      <InvoiceStatusBadge status={invoice.status} size="md" />
                    </span>
                    <span className="text-base font-semibold text-accent-soft-foreground">View</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {estimate.notes ? (
          <Section title="Notes">
            <p className="whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-base leading-relaxed text-muted-foreground">
              {estimate.notes}
            </p>
          </Section>
        ) : null}
      </>
    );

    // ----------------------------------------------------------- Customer tab
    // Whole 48px rows to tap, and a tel: link of digits only.
    const ROW_LINK =
      "flex min-h-12 items-center rounded-lg text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    const telLink = (value: string) => (
      <a href={telHref(value)} data-touch-control className={cn(ROW_LINK, "rf-num")}>
        {value}
      </a>
    );
    const customerPanel = (
      <>
        <Section title="Customer">
          <FactList
            facts={[
              {
                label: "Name",
                value: (
                  <Link href={`/customers/${estimate.customer.id}`} data-touch-control className={ROW_LINK}>
                    {customerName}
                  </Link>
                ),
              },
              ...(estimate.customer.mobile ? [{ label: "Mobile", value: telLink(estimate.customer.mobile) }] : []),
              ...(estimate.customer.phone ? [{ label: "Phone", value: telLink(estimate.customer.phone) }] : []),
              {
                label: "Email",
                value: estimate.customer.email ? (
                  <a href={`mailto:${estimate.customer.email}`} data-touch-control className={cn(ROW_LINK, "break-all")}>
                    {estimate.customer.email}
                  </a>
                ) : (
                  <span className="text-faint-foreground">None on file</span>
                ),
              },
            ]}
          />
        </Section>

        <Section title="This estimate">
          <FactList
            facts={[
              { label: "Quoted", value: formatDate(estimate.createdAt, zone) },
              {
                label: "Expires",
                value: (
                  <span className={cn(expired && "font-semibold text-status-overdue-fg")}>
                    {estimate.expiresAt ? formatDate(estimate.expiresAt) : "No expiry"}
                    {expired ? " (expired)" : ""}
                  </span>
                ),
              },
              {
                label: "Approved",
                value: estimate.approvedAt ? formatDate(estimate.approvedAt, zone) : "—",
              },
              { label: "Tax rate", value: taxLabel(estimate.taxRate?.name, estimate.taxRateBps) },
              {
                label: "Repair",
                value: estimate.ticket ? (
                  <Link href={`/tickets/${estimate.ticket.id}`} data-touch-control className={ROW_LINK}>
                    #{estimate.ticket.number}
                    {estimate.ticket.subject ? ` · ${estimate.ticket.subject}` : ""}
                  </Link>
                ) : (
                  "—"
                ),
              },
            ]}
          />
        </Section>
      </>
    );

    // ----------------------------------------------------------- Activity tab
    const activityPanel = (
      <Section title="Activity">
        <ActivityList
          zone={zone}
          items={estimateActivity({
            createdAt: estimate.createdAt,
            approvedAt: estimate.approvedAt,
            messages: recentSends
              .filter(
                (row) => numberPattern.test(row.subject ?? "") || numberPattern.test(row.body),
              )
              .map((row) => ({
                id: row.id,
                createdAt: row.createdAt,
                type: row.type,
                direction: row.direction,
                to: row.to,
                subject: row.subject,
                status: row.status,
              })),
            invoices: estimate.invoices,
          })}
        />
      </Section>
    );

    // -------------------------------------------------------------- Share tab
    const sharePanel = (
      <>
        <Section title="Customer links">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            <p className="text-base leading-snug text-muted-foreground">
              The approval link never expires and opens their page, where they can approve or decline,
              with no sign-in. There is no payment link on an estimate: nothing is owed until the work
              is approved and billed.
            </p>
            {/* No payment link on an estimate. */}
            <ShareRow large viewUrl={viewUrl} viewLabel="Copy approval link" />
          </div>
        </Section>

        <Section title="Approval signature">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
            {estimate.approvalSignatureDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={estimate.approvalSignatureDataUrl}
                alt={`Approval signature of ${customerName}`}
                className="h-28 w-full rounded-xl border border-border bg-white object-contain p-2"
              />
            ) : (
              <p className="text-base text-muted-foreground">
                Not signed yet.{canApprove ? " Use Sign on screen (or More, then Approve + sign) to collect one." : ""}
              </p>
            )}
          </div>
        </Section>
      </>
    );

    const panel =
      tab === "customer"
        ? customerPanel
        : tab === "activity"
          ? activityPanel
          : tab === "share"
            ? sharePanel
            : quotePanel;
    const pinned = bigAction();

    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {/* One Back in Easy mode: the shell's. */}
        {troubled && lastSent ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-status-overdue/50 bg-status-overdue-bg p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-base leading-snug text-status-overdue-fg">
              <span className="font-semibold">
                The last {lastSent.type === "SMS" ? "text" : "email"} did not reach {customerName}
              </span>{" "}
              ({sendTrouble?.text.toLowerCase()}, {relativeTime(lastSent.createdAt.toISOString())}). Check their{" "}
              {lastSent.type === "SMS" ? "mobile number" : "email address"}, then send it again.
            </p>
            <Button asChild variant="outline" className="h-12 shrink-0 px-5 text-base">
              <Link href={`/customers/${estimate.customer.id}/edit`}>
                <ACTIONS.edit /> Fix their details
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/* The summary is first in the page (and on a phone) and sits in the right
              column from lg up, so the order a finger or a screen reader meets
              things in is the order they are read. */}
          <BillSummary
            className="lg:col-start-2 lg:row-start-1"
            title={`Estimate #${estimate.number}`}
            status={<EstimateStatusBadge status={estimate.status} size="md" />}
            customer={{
              name: customerName,
              href: `/customers/${estimate.customer.id}`,
              phone,
            }}
            hero={<QuoteHero block={block} expired={expired} />}
            primary={bigAction()}
            tiles={tiles}
            tileCount={tileKeys.length}
            hint={troubled ? null : lastSentHint}
          />

          <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
            <FilterTabs aria-label="Estimate sections" tabs={docTabs(basePath, tab, "Quote")} />
            {panel}
          </div>
        </div>

        {pinned ? <PinnedAction>{pinned}</PinnedAction> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {fullHeader}

      {/* -------------------------------------------------------------- body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* ------------------------------------------------------ line items */}
          <Card>
            <CardHeader icon={ICONS.checklist} title="Line items" />

            <CardContent className="px-0 py-0">
              {estimate.lines.length === 0 ? (
                // A quote with nothing on it is unfinished, not empty — so the
                // way out is the edit screen, not a shrug in the table body.
                <EmptyState
                  icon={ICONS.estimate}
                  title="Nothing quoted yet"
                  hint="Add the parts and labour this job needs and the customer gets a number to approve."
                  action={
                    canEdit ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/estimates/${estimate.id}/edit`}>
                          <ACTIONS.add /> Add line items
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th>Description</Th>
                      <Th className="w-[70px] text-right">Qty</Th>
                      <Th className="w-[120px] text-right">Rate</Th>
                      <Th className="w-[70px] text-center">Tax</Th>
                      <Th className="w-[130px] text-right">Amount</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {estimate.lines.map((line) => (
                      <Tr key={line.id}>
                        <Td className="whitespace-normal font-medium text-foreground">
                          {line.description}
                        </Td>
                        <Td className="text-right text-muted-foreground">
                          {line.quantity}
                        </Td>
                        <Td className="text-right text-muted-foreground">
                          {formatCents(line.unitPriceCents)}
                        </Td>
                        <Td className="text-center text-[13px] text-muted-foreground">
                          {line.taxable ? "Yes" : "No"}
                        </Td>
                        <Td className="text-right font-semibold text-foreground">
                          {formatCents(line.quantity * line.unitPriceCents)}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>

            {estimate.lines.length > 0 ? (
              <CardFooter className="justify-end bg-surface-hover py-4">
                <div className="flex w-full max-w-[280px] flex-col gap-2 text-[13.5px]">
                  <TotalsRow
                    label="Subtotal"
                    value={formatCents(totals.subtotalCents)}
                  />
                  <TotalsRow
                    label={taxLabel(estimate.taxRate?.name, estimate.taxRateBps)}
                    value={formatCents(totals.taxCents)}
                  />
                  <div className="flex items-baseline justify-between gap-3 border-t border-border-strong pt-3">
                    <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                      Estimated total
                    </span>
                    <span className="rf-num text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground">
                      {formatCents(totals.totalCents)}
                    </span>
                  </div>
                </div>
              </CardFooter>
            ) : null}
          </Card>

          {/* --------------------------------------------------------- billed */}
          {/* What this quote turned into. An embedded table rather than a row
              of chips: a quote can be billed more than once (a deposit, then
              the balance), and then the question is which invoice, in what
              state. */}
          {estimate.invoices.length > 0 ? (
            <Card>
              <CardHeader icon={ICONS.invoice} title="Invoices raised" />
              <CardContent className="px-0 py-0">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Invoice</Th>
                      <Th className="w-[140px]">Status</Th>
                      <Th className="w-[100px] text-right">Open</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {estimate.invoices.map((invoice) => (
                      <Tr key={invoice.id}>
                        <Td className="font-medium text-foreground">
                          #{invoice.number}
                        </Td>
                        <Td>
                          <InvoiceStatusBadge status={invoice.status} />
                        </Td>
                        <Td className="text-right">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-medium text-accent-soft-foreground hover:underline"
                          >
                            View
                          </Link>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {estimate.notes ? (
            <Card>
              <CardHeader icon={ICONS.message} title="Notes" />
              <CardContent>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted-foreground">
                  {estimate.notes}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* ------------------------------------------------------------ aside */}
        <aside className="flex flex-col gap-5">
          {/* No payment link on an estimate — nothing is owed until the work is
              approved and invoiced. */}
          <Card>
            <CardHeader icon={ACTIONS.copyLink} title="Customer links" />
            <CardContent>
              <ShareRow viewUrl={viewUrl} viewLabel="Copy approval link" />
            </CardContent>
          </Card>

          {/*
            Customer, quoted, expires, approved and the ticket are columns in
            the header's metadata strip now — one place per fact. What is left
            here is what the strip has no room for.
          */}
          <Card>
            <CardHeader icon={ICONS.estimate} title="Details" />
            <CardContent className="flex flex-col gap-3 text-[13.5px]">
              <Fact label="Email">
                {estimate.customer.email ? (
                  <a
                    href={`mailto:${estimate.customer.email}`}
                    className="text-accent hover:underline"
                  >
                    {estimate.customer.email}
                  </a>
                ) : (
                  <span className="text-faint-foreground">None on file</span>
                )}
              </Fact>
              <Fact label="Tax rate">
                {taxLabel(estimate.taxRate?.name, estimate.taxRateBps)}
              </Fact>
              {estimate.ticket?.subject ? (
                <Fact label="Repair">{estimate.ticket.subject}</Fact>
              ) : null}
            </CardContent>
          </Card>

          {estimate.approvalSignatureDataUrl ? (
            <Card>
              <CardHeader icon={ICONS.signature} title="Approval signature" />
              <CardContent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={estimate.approvalSignatureDataUrl}
                  alt={`Approval signature of ${customerName}`}
                  className="h-24 w-full rounded-md border border-border bg-white object-contain p-2"
                />
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="rf-num font-semibold text-foreground">{value}</span>
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
      <span className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-faint-foreground">
        {label}
      </span>
      <span className="truncate text-[13.5px] text-foreground">{children}</span>
    </div>
  );
}
