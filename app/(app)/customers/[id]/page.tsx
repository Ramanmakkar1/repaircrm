import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
// Pencil / ScrollText have no concept in components/ui/icons.ts; everything
// else on this screen comes from the shared map.
import { Pencil, ScrollText } from "lucide-react";

import {
  CommunicationsCard,
  EstimatesCard,
  InvoicesCard,
  PaymentsCard,
  TicketsCard,
} from "@/components/customers/activity-cards";
import { AssetsCard } from "@/components/customers/assets-card";
import { ContactsCard } from "@/components/customers/contacts-card";
import { CardOnFileCard } from "@/components/billing/card-on-file-card";
import { CreditDialog } from "@/components/credits/credit-dialog";
import { CustomerActionsMenu } from "@/components/customers/customer-actions-menu";
import { isPlaceholderName, primaryPhone } from "@/components/customers/customer-facts";
import { CustomerField } from "@/components/customers/customer-field";
import { CustomerHeader, PinnedAction } from "@/components/customers/customer-header";
import {
  CUSTOMER_SECTIONS_ID,
  customerSummary,
  customerTabHref,
  customerTabs,
  messageOptions,
  resolveCustomerTab,
} from "@/components/customers/customer-screen";
import { CustomerInvoices } from "@/components/customers/document-rows";
import { FlashToast } from "@/components/customers/flash-toast";
import {
  deleteBlockedReason,
  formatDate,
  fullName,
  initials,
} from "@/components/customers/format";
import { InfoCard } from "@/components/customers/info-card";
import { MessageMenu } from "@/components/customers/message-menu";
import { NotesCard } from "@/components/customers/notes-card";
import { RevealSections } from "@/components/customers/reveal-sections";
import { CustomerRepairs } from "@/components/customers/repair-rows";
import { SummaryStrip } from "@/components/customers/summary-strip";
import { WarrantiesCard } from "@/components/customers/warranties-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CopyableId } from "@/components/ui/copyable-id";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { IconVisual, InitialsVisual } from "@/components/ui/record-card";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";
import { readUiPrefs } from "@/lib/prefs";
import { customerWarranties } from "@/lib/warranty";
import { cardExpired, cardOnFile, paymentsLive } from "@/lib/payments";
import {
  removeCardAction,
  startSaveCardAction,
} from "@/app/(app)/customers/card-actions";

/** Ticket statuses that mean "no longer on the bench". */
const CLOSED_TICKET_STATUSES = [
  "Resolved",
  "Closed",
  "Completed",
  "Cancelled",
  "Picked Up",
];

/** Invoice statuses that can still carry a balance the customer owes. */
const OWING_INVOICE_STATUSES: Prisma.EnumInvoiceStatusFilter["in"] = [
  "SENT",
  "PARTIAL",
];

const RECENT = 8;

/** The most open repairs the Easy Repairs section lists; anything past that is one tap on "See all". */
const OPEN_REPAIRS_SHOWN = 30;

/** What one repair row on the Easy customer screen needs. */
const REPAIR_ROW_SELECT = {
  id: true,
  number: true,
  subject: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  asset: { select: { type: true, make: true, model: true } },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { id } = await params;

  const customer = await db.customer.findFirst({
    where: { id, shopId },
    select: { firstName: true, lastName: true, businessName: true },
  });

  return {
    title: customer
      ? `${fullName(customer)} · Repairs helper`
      : "Customer · Repairs helper",
  };
}

export default async function CustomerHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string; tab?: string }>;
}) {
  const { shopId, role } = await requireUser();
  const [{ id }, { flash, tab: tabParam }, prefs] = await Promise.all([params, searchParams, readUiPrefs()]);
  // Easy mode (the default): a POS-style screen. A big header with one action,
  // a summary in words, then one section at a time (?tab=). Full keeps the
  // dense two-column layout.
  const easy = prefs.simple;
  const tab = resolveCustomerTab(tabParam, flash);
  // Easy loads only the section on screen; Full shows everything, so it loads all.
  const needs = {
    tickets: !easy,
    repairs: easy && tab === "repairs",
    invoices: !easy || tab === "invoices",
    details: !easy || tab === "details",
  };
  const now = new Date();

  // findFirst (not findUnique) so an id from another shop 404s instead of leaking.
  const customer = await db.customer.findFirst({
    where: { id, shopId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      businessName: true,
      email: true,
      phone: true,
      mobile: true,
      address1: true,
      address2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      notes: true,
      smsOptIn: true,
      emailOptIn: true,
      creditBalanceCents: true,
      referredBy: true,
      createdAt: true,
      taxExempt: true,
      taxRate: { select: { name: true, rateBps: true } },
      stripeCustomerId: true,
      stripePaymentMethodId: true,
      cardBrand: true,
      cardLast4: true,
      cardExpMonth: true,
      cardExpYear: true,
      contacts: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, email: true, phone: true, label: true },
      },
      assets: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          make: true,
          model: true,
          serial: true,
          password: true,
          notes: true,
        },
      },
      _count: { select: { tickets: true, invoices: true, estimates: true } },
    },
  });

  if (!customer) notFound();

  const [
    tickets,
    openRepairRows,
    earlierRepairRows,
    lastVisit,
    invoices,
    estimates,
    payments,
    communications,
    openTicketCount,
    paymentTotals,
    owingInvoices,
    communicationCount,
    creditHistory,
    warranties,
  ] = await Promise.all([
    needs.tickets
      ? db.ticket.findMany({
          where: { shopId, customerId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: {
            id: true,
            number: true,
            subject: true,
            status: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // Easy Repairs section: everything on the bench, then the recent history.
    needs.repairs
      ? db.ticket.findMany({
          where: { shopId, customerId: id, status: { notIn: CLOSED_TICKET_STATUSES } },
          orderBy: { createdAt: "desc" },
          take: OPEN_REPAIRS_SHOWN,
          select: REPAIR_ROW_SELECT,
        })
      : Promise.resolve([]),
    needs.repairs
      ? db.ticket.findMany({
          where: { shopId, customerId: id, status: { in: CLOSED_TICKET_STATUSES } },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: REPAIR_ROW_SELECT,
        })
      : Promise.resolve([]),
    // "Last visit": the newest repair they brought in, as on the customer list.
    easy
      ? db.ticket.aggregate({ where: { shopId, customerId: id }, _max: { createdAt: true } })
      : Promise.resolve(null),
    needs.invoices
      ? db.invoice.findMany({
          where: { shopId, customerId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: {
            id: true,
            number: true,
            status: true,
            taxRateBps: true,
            createdAt: true,
            dueDate: true,
            paidAt: true,
            lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
            payments: { select: { amountCents: true } },
          },
        })
      : Promise.resolve([]),
    needs.invoices
      ? db.estimate.findMany({
          where: { shopId, customerId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: {
            id: true,
            number: true,
            status: true,
            taxRateBps: true,
            createdAt: true,
            expiresAt: true,
            approvedAt: true,
            lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
          },
        })
      : Promise.resolve([]),
    // Payment carries shopId; scoping through the invoice keeps it to this customer.
    needs.details
      ? db.payment.findMany({
          where: { shopId, invoice: { customerId: id } },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: {
            id: true,
            amountCents: true,
            method: true,
            reference: true,
            createdAt: true,
            invoice: { select: { id: true, number: true } },
          },
        })
      : Promise.resolve([]),
    needs.details
      ? db.communicationLog.findMany({
          where: { shopId, customerId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: {
            id: true,
            type: true,
            direction: true,
            to: true,
            subject: true,
            body: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    db.ticket.count({
      where: { shopId, customerId: id, status: { notIn: CLOSED_TICKET_STATUSES } },
    }),
    db.payment.aggregate({
      where: { shopId, invoice: { customerId: id } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    // Every owing invoice, not just the recent page — the stat must be the truth.
    db.invoice.findMany({
      where: { shopId, customerId: id, status: { in: OWING_INVOICE_STATUSES } },
      select: {
        taxRateBps: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
      },
    }),
    needs.details ? db.communicationLog.count({ where: { shopId, customerId: id } }) : Promise.resolve(0),
    // The store-credit audit trail, for the credit dialog. Only techs never see
    // the dialog, so their request never runs this query.
    role === "OWNER" || role === "FRONT_DESK"
      ? db.creditAdjustment.findMany({
          where: { shopId, customerId: id },
          orderBy: { createdAt: "desc" },
          take: RECENT,
          select: {
            id: true,
            deltaCents: true,
            reason: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    // Live cover first, then lapsed — "is this still covered?" is the question
    // being asked at the counter.
    needs.details ? customerWarranties(shopId, id) : Promise.resolve([]),
  ]);

  const unpaidBalanceCents = owingInvoices.reduce((sum, invoice) => {
    const { balanceCents } = invoiceTotals(
      invoice.lines,
      invoice.taxRateBps,
      invoice.payments,
    );
    return sum + Math.max(0, balanceCents);
  }, 0);

  const name = fullName(customer);
  const blockedReason = deleteBlockedReason(customer._count);

  // Only the four display fields ever cross to the browser — never the payment
  // method id, which is a handle to a real card at Stripe.
  const saved = cardOnFile(customer);
  const savedCard = saved
    ? { ...saved, expired: cardExpired(saved) }
    : null;

  // The number the header shows and edits as "their phone" (the mobile when
  // there is one, otherwise the office phone): see primaryPhone.
  const phone = primaryPhone(customer);

  const creditDialog =
    role === "OWNER" || role === "FRONT_DESK" ? (
      <CreditDialog
        customerId={customer.id}
        customerName={name}
        balanceCents={customer.creditBalanceCents}
        history={creditHistory.map((entry) => ({
          id: entry.id,
          deltaCents: entry.deltaCents,
          reason: entry.reason,
          userName: entry.user?.name ?? null,
          createdAt: entry.createdAt.toISOString(),
        }))}
      />
    ) : null;

  if (easy) {
    const title = name || customer.businessName || "Unnamed customer";
    const business = name && customer.businessName ? customer.businessName : null;
    const canMessage = messageOptions({ customerId: customer.id, phone: phone.value || null, email: customer.email });
    const sections = {
      repairs: customer._count.tickets,
      invoices: customer._count.invoices,
      devices: customer.assets.length,
    };

    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5">
        <FlashToast flash={flash} tab={tab === "repairs" ? undefined : tab} />

        {/*
          A POS-style customer screen. Top to bottom: who they are and how to
          reach them, ONE black action ("New repair", this customer already
          chosen) beside four quick tiles, a summary in words, then the
          sections as big tabs (?tab=). Nothing from the old page is gone: the
          rest of the actions are under "More", and every card now lives in a
          section (Details holds contact, notes, contacts, card on file,
          warranties, payments and messages).
        */}
        <CustomerHeader
          visual={
            isPlaceholderName(title) ? (
              <IconVisual icon={ICONS.customer} className="size-16 sm:size-20" />
            ) : (
              <InitialsVisual name={title} className="size-16 text-2xl sm:size-20 sm:text-3xl" />
            )
          }
          name={title}
          business={business}
          phone={phone.value || null}
          email={customer.email?.trim() || null}
          detailsHref={customerTabHref(customer.id, "details")}
          newRepairHref={`/tickets/new?customerId=${customer.id}`}
          newInvoiceHref={`/invoices/new?customerId=${customer.id}`}
          bookHref="/appointments"
          messageMenu={<MessageMenu options={canMessage} />}
          moreMenu={
            <CustomerActionsMenu
              easy
              tile
              customerId={customer.id}
              customerName={title}
              canDelete={role === "OWNER"}
              blockedReason={blockedReason}
            />
          }
        />

        <SummaryStrip
          items={customerSummary({
            openRepairs: openTicketCount,
            totalRepairs: customer._count.tickets,
            owedCents: unpaidBalanceCents,
            creditCents: customer.creditBalanceCents,
            lastVisit: lastVisit?._max.createdAt ?? null,
            customerSince: customer.createdAt,
            now,
          })}
          creditAction={creditDialog}
        />

        {/*
          The scroll target of every tab (each tab links to #sections): the new
          list comes up under the top of the screen instead of staying below a
          header and summary that already fill a phone.
        */}
        <div id={CUSTOMER_SECTIONS_ID} className="scroll-mt-2">
          <FilterTabs
            aria-label="Customer sections"
            // On a phone all four names must be on screen (Details holds the contact
            // fields), so the counts drop out there and the tabs share the row.
            className="max-sm:[&>a>span]:hidden max-sm:[&>a]:flex-1 max-sm:[&>a]:justify-center max-sm:[&>a]:px-2"
            tabs={customerTabs({ customerId: customer.id, active: tab, counts: sections })}
          />
        </div>
        <RevealSections />

        {tab === "repairs" ? (
          <CustomerRepairs
            customerId={customer.id}
            firstName={isPlaceholderName(title) ? "" : customer.firstName.trim()}
            open={openRepairRows}
            earlier={earlierRepairRows}
            total={customer._count.tickets}
            now={now.getTime()}
          />
        ) : null}

        {tab === "invoices" ? (
          <CustomerInvoices
            customerId={customer.id}
            invoices={invoices}
            invoiceTotal={customer._count.invoices}
            estimates={estimates}
            estimateTotal={customer._count.estimates}
            now={now.getTime()}
          />
        ) : null}

        {tab === "devices" ? <AssetsCard easy customerId={customer.id} assets={customer.assets} /> : null}

        {tab === "details" ? (
          <div className="flex flex-col gap-5">
            {/* The short cards sit side by side; the tables below need the full width. */}
            <div className="grid items-start gap-5 lg:grid-cols-2">
              <InfoCard customer={customer} easy totalPaidCents={paymentTotals._sum.amountCents ?? 0} />
              <div className="flex min-w-0 flex-col gap-5">
                <NotesCard customerId={customer.id} notes={customer.notes} />
                <ContactsCard customerId={customer.id} contacts={customer.contacts} />
                <CardOnFileCard
                  customerId={customer.id}
                  customerName={title}
                  card={savedCard}
                  paymentsConfigured={paymentsLive()}
                  canManage={role === "OWNER" || role === "FRONT_DESK"}
                  justSaved={flash === "card-saved"}
                  saveAction={startSaveCardAction}
                  removeAction={removeCardAction}
                />
              </div>
            </div>
            <WarrantiesCard warranties={warranties} />
            <PaymentsCard payments={payments} total={paymentTotals._count._all} />
            {/* The Message tile's "Past messages" lands here. */}
            <div id="messages" className="min-w-0 scroll-mt-4">
              <CommunicationsCard entries={communications} total={communicationCount} />
            </div>
          </div>
        ) : null}

        <PinnedAction href={`/tickets/new?customerId=${customer.id}`}>New repair</PinnedAction>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <FlashToast flash={flash} />

      {/*
        The same object header every detail screen in the app opens with. What
        the customer owes is the headline, because it is the one number that
        changes what you say when you pick up the phone; the five-tile stats
        strip that used to sit under the hero is gone — its numbers are the
        headline, four of these columns, and the counts already carried by each
        section card's own header.
      */}
      <ObjectHeader
        back={{ label: "Customers", href: "/customers" }}
        value={formatCents(unpaidBalanceCents)}
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar className="size-6 shrink-0">
              <AvatarFallback className="text-[10px] font-semibold">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{name}</span>
          </span>
        }
        subtitle={customer.businessName ?? undefined}
        status={
          unpaidBalanceCents > 0 ? (
            <StatusPill tone="danger" label="Balance due" />
          ) : (
            <StatusPill tone="neutral" label="Nothing outstanding" />
          )
        }
        id={<CopyableId value={customer.id} label="customer id" />}
        meta={[
          {
            /*
              Editable in place, which costs the `tel:`/`mailto:` links these
              two cells used to be — a link inside `InlineEdit`'s read button
              would be invalid markup and an ambiguous click. Both are still
              dialable in the Details card below, which is where somebody
              reaching for the phone already looks.

              The cell shows and writes the SAME column, so what is read is
              what is edited: `mobile` when there is one (the counter form saves
              the main number there) or when neither number is set, otherwise
              `phone`. A customer with only one number never reads "—".
            */
            label: phone.label,
            value: (
              <CustomerField
                customerId={customer.id}
                field={phone.field}
                label={phone.label}
                value={phone.value}
                className="whitespace-normal"
              />
            ),
          },
          {
            label: "Email",
            value: (
              <CustomerField
                customerId={customer.id}
                field="email"
                label="Email"
                value={customer.email ?? ""}
                className="whitespace-normal"
              />
            ),
          },
          {
            label: "Open tickets",
            value: (
              <span className="rf-num">
                {openTicketCount} of {customer._count.tickets}
              </span>
            ),
          },
          {
            label: "Lifetime",
            value: (
              <span className="rf-num">
                {formatCents(paymentTotals._sum.amountCents ?? 0)}
              </span>
            ),
          },
          {
            label: "Store credit",
            value: (
              <span
                className={cn(
                  "rf-num",
                  customer.creditBalanceCents > 0
                    ? "font-medium text-status-resolved-fg"
                    : "text-muted-foreground",
                )}
              >
                {formatCents(customer.creditBalanceCents)}
              </span>
            ),
          },
          { label: "Customer since", value: formatDate(customer.createdAt) },
        ]}
        actions={
          // The width cap is the same local workaround the ticket page
          // carries, and for the same reason: `ObjectHeader` pins its actions
          // slot with `shrink-0`, so seven buttons would scroll the page
          // sideways on a phone instead of wrapping.
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" asChild>
              <Link href={`/tickets/new?customerId=${customer.id}`}>
                <ICONS.ticket />
                New Ticket
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/invoices/new?customerId=${customer.id}`}>
                <ICONS.invoice />
                New Invoice
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/estimates/new?customerId=${customer.id}`}>
                <ICONS.estimate />
                New Estimate
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/customers/${customer.id}/statement`}>
                <ScrollText />
                Statement
              </Link>
            </Button>
            {creditDialog}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            <CustomerActionsMenu
              customerId={customer.id}
              customerName={name}
              canDelete={role === "OWNER"}
              blockedReason={blockedReason}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <InfoCard customer={customer} />
          <NotesCard customerId={customer.id} notes={customer.notes} />
          <CardOnFileCard
            customerId={customer.id}
            customerName={name}
            card={savedCard}
            paymentsConfigured={paymentsLive()}
            canManage={role === "OWNER" || role === "FRONT_DESK"}
            justSaved={flash === "card-saved"}
            saveAction={startSaveCardAction}
            removeAction={removeCardAction}
          />
          <ContactsCard customerId={customer.id} contacts={customer.contacts} />
          <AssetsCard customerId={customer.id} assets={customer.assets} />
        </div>

        <div className="flex flex-col gap-5">
          <TicketsCard
            customerId={customer.id}
            tickets={tickets}
            total={customer._count.tickets}
          />
          <InvoicesCard
            customerId={customer.id}
            invoices={invoices}
            total={customer._count.invoices}
          />
          <EstimatesCard
            customerId={customer.id}
            estimates={estimates}
            total={customer._count.estimates}
          />
          <WarrantiesCard warranties={warranties} />
          <PaymentsCard payments={payments} total={paymentTotals._count._all} />
          <CommunicationsCard entries={communications} total={communicationCount} />
        </div>
      </div>
    </div>
  );
}
