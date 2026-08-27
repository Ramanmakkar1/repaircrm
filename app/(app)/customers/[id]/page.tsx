import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  FileText,
  Mail,
  Pencil,
  Phone,
  Receipt,
  ScrollText,
  Wrench,
} from "lucide-react";

import {
  CommunicationsCard,
  EstimatesCard,
  InvoicesCard,
  PaymentsCard,
  TicketsCard,
} from "@/components/customers/activity-cards";
import { AssetsCard } from "@/components/customers/assets-card";
import { ContactsCard } from "@/components/customers/contacts-card";
import { CreditDialog } from "@/components/credits/credit-dialog";
import { CustomerActionsMenu } from "@/components/customers/customer-actions-menu";
import { FlashToast } from "@/components/customers/flash-toast";
import {
  deleteBlockedReason,
  formatDate,
  fullName,
  initials,
} from "@/components/customers/format";
import { InfoCard } from "@/components/customers/info-card";
import { NotesCard } from "@/components/customers/notes-card";
import { StatsRow } from "@/components/customers/stats-row";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { invoiceTotals } from "@/lib/money";

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

  return (
    <div className="flex flex-col gap-6">
      <FlashToast flash={flash} />

      <div className="flex flex-col gap-4">
        <Link
          href="/customers"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Customers
        </Link>

        <div className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-16">
              <AvatarFallback className="text-xl font-bold">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {customer.businessName ? (
                  <Chip icon={Building2}>{customer.businessName}</Chip>
                ) : null}
                {(customer.phone ?? customer.mobile) ? (
                  <Chip icon={Phone}>{customer.phone ?? customer.mobile}</Chip>
                ) : null}
                {customer.email ? <Chip icon={Mail}>{customer.email}</Chip> : null}
                <Chip icon={CalendarDays}>
                  Since {formatDate(customer.createdAt)}
                </Chip>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={`/tickets/new?customerId=${customer.id}`}>
                <Wrench />
                New Ticket
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/invoices/new?customerId=${customer.id}`}>
                <Receipt />
                New Invoice
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/estimates/new?customerId=${customer.id}`}>
                <FileText />
                New Estimate
              </Link>
            </Button>
            <Button variant="outline" asChild>
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
              />
            ) : null}
            <Button variant="outline" asChild>
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
        </div>
      </div>

      <StatsRow
        ticketCount={customer._count.tickets}
        openTicketCount={openTicketCount}
        invoiceCount={customer._count.invoices}
        lifetimeRevenueCents={paymentTotals._sum.amountCents ?? 0}
        unpaidBalanceCents={unpaidBalanceCents}
        creditBalanceCents={customer.creditBalanceCents}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <InfoCard customer={customer} />
          <NotesCard customerId={customer.id} notes={customer.notes} />
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
          <PaymentsCard payments={payments} total={paymentTotals._count._all} />
          <CommunicationsCard entries={communications} total={communicationCount} />
        </div>
      </div>
    </div>
  );
}
