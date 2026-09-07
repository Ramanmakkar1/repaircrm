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
import { CustomerField } from "@/components/customers/customer-field";
import { FlashToast } from "@/components/customers/flash-toast";
import {
  deleteBlockedReason,
  formatDate,
  fullName,
  initials,
} from "@/components/customers/format";
import { InfoCard } from "@/components/customers/info-card";
import { NotesCard } from "@/components/customers/notes-card";
import { WarrantiesCard } from "@/components/customers/warranties-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CopyableId } from "@/components/ui/copyable-id";
import { ICONS } from "@/components/ui/icons";
import { ObjectHeader } from "@/components/ui/object-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents, invoiceTotals } from "@/lib/money";
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
      ? `${fullName(customer)} · RepairFlow`
      : "Customer · RepairFlow",
  };
}

export default async function CustomerHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ flash?: string }>;
}) {
  const { shopId, role } = await requireUser();
  const [{ id }, { flash }] = await Promise.all([params, searchParams]);

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
    db.ticket.findMany({
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
    }),
    db.invoice.findMany({
      where: { shopId, customerId: id },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: {
        id: true,
        number: true,
        status: true,
        taxRateBps: true,
        createdAt: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
      },
    }),
    db.estimate.findMany({
      where: { shopId, customerId: id },
      orderBy: { createdAt: "desc" },
      take: RECENT,
      select: {
        id: true,
        number: true,
        status: true,
        taxRateBps: true,
        createdAt: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      },
    }),
    // Payment carries shopId; scoping through the invoice keeps it to this customer.
    db.payment.findMany({
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
    }),
    db.communicationLog.findMany({
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
    }),
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
    db.communicationLog.count({ where: { shopId, customerId: id } }),
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
    customerWarranties(shopId, id),
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

              It also costs the old `phone ?? mobile` fallback: the cell now
              writes `phone`, so it has to show `phone`. A mobile-only customer
              reads as "—" here and keeps their number in Details, one column
              lower. Showing `mobile` under a control that writes `phone` would
              have been the worse trade.
            */
            label: "Phone",
            value: (
              <CustomerField
                customerId={customer.id}
                field="phone"
                label="Phone"
                value={customer.phone ?? ""}
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
            {role === "OWNER" || role === "FRONT_DESK" ? (
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
            ) : null}
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
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
