import Image from "next/image";
import Link from "next/link";
import { FileText, MapPin, Phone, Plus, Receipt } from "lucide-react";

import { BIG_BUTTON, HUGE_BUTTON } from "@/components/public/sizes";
import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { IconVisual, MetaChip, PhotoVisual, RecordCard, RecordGrid } from "@/components/ui/record-card";
import { refundAwareTotals } from "@/components/billing/refund-math";
import { db } from "@/lib/db";
import { calcTotals, formatCents } from "@/lib/money";
import { requestNow } from "@/lib/now";
import {
  dayWords,
  deviceName,
  devicePicture,
  dueWords,
  estimateWords,
  invoiceWords,
  repairWords,
  telHref,
  whenWords,
  type PublicShop,
} from "@/lib/portal-display";
import { requirePortalCustomer } from "@/lib/portal-session";
import { PortalShell } from "../_components/shell";
import { loadPortalShop } from "../_components/shop";

export const metadata = { title: "Your repairs · Repairs helper" };

/**
 * The customer's home: the ONE thing that matters now on top (ready to
 * collect, an estimate to answer, a bill to pay), then their repairs, quotes
 * and bills as picture cards with plain status words.
 *
 * EVERY query below filters on BOTH `customerId` and `shopId` from the portal
 * cookie. Not one of them takes an id from the URL (there is no URL to take one
 * from), so this page structurally cannot show another customer's work.
 *
 * `select` is used rather than `include` throughout, so internal fields
 * (diagnostic notes, device passwords, private comments, who it is assigned to)
 * never even enter the render, let alone the RSC payload.
 */
export default async function PortalHomePage() {
  const customer = await requirePortalCustomer("/portal/home");
  const scope = { customerId: customer.id, shopId: customer.shopId };

  const [shop, tickets, estimates, invoices] = await Promise.all([
    loadPortalShop(customer.shopId),
    db.ticket.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        number: true,
        problemType: true,
        status: true,
        updatedAt: true,
        // Kind, make and model only: the unlock code and serial stay on the bench.
        asset: { select: { type: true, make: true, model: true } },
        comments: {
          where: { isPublic: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, body: true, createdAt: true },
        },
      },
    }),
    db.estimate.findMany({
      // DRAFT IS NOT THE CUSTOMER'S BUSINESS: a price the shop is still
      // working out has not been sent, and until Send is pressed the customer
      // must not see that it exists.
      where: { ...scope, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        taxRateBps: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
      },
    }),
    db.invoice.findMany({
      // Same rule as the estimates above: an unsent bill is not a bill yet.
      where: { ...scope, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        dueDate: true,
        taxRateBps: true,
        lines: { select: { quantity: true, unitPriceCents: true, taxable: true } },
        payments: { select: { amountCents: true } },
        refunds: { select: { amountCents: true, status: true } },
      },
    }),
  ]);

  const now = requestNow();
  const zone = shop.timezone;

  const repairs = tickets
    .map((ticket) => {
      const device = deviceName(ticket.asset);
      return { ...ticket, device, words: repairWords(ticket.status, device) };
    })
    // Open repairs first (in the order the shop last touched them), finished ones after.
    .sort((a, b) => Number(a.words.stage === 3 || a.words.stage === null) - Number(b.words.stage === 3 || b.words.stage === null));

  const bills = invoices.map((invoice) => {
    const totals = refundAwareTotals(invoice.lines, invoice.taxRateBps, invoice.payments, invoice.refunds);
    const owed = invoice.status === "VOID" ? 0 : Math.max(totals.balanceCents, 0);
    return {
      ...invoice,
      totals,
      owed,
      words: invoiceWords({
        status: invoice.status,
        totalCents: totals.totalCents,
        paidCents: totals.netPaidCents,
        dueDate: invoice.dueDate,
        nowMs: now,
        zone,
      }),
    };
  });

  const quotes = estimates
    .map((estimate) => ({
      ...estimate,
      totalCents: calcTotals(estimate.lines, estimate.taxRateBps).totalCents,
      words: estimateWords(estimate.status),
    }))
    // The ones waiting for an answer first.
    .sort((a, b) => Number(b.status === "SENT") - Number(a.status === "SENT"));

  const outstanding = bills.reduce((sum, bill) => sum + bill.owed, 0);
  const fixing = repairs.filter((r) => r.words.stage === 0 || r.words.stage === 1).length;
  const ready = repairs.filter((r) => r.words.stage === 2);
  const waitingQuotes = quotes.filter((q) => q.status === "SENT");
  const unpaid = bills.filter((bill) => bill.owed > 0);

  return (
    <PortalShell shop={shop} customerName={`${customer.firstName} ${customer.lastName}`.trim()}>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Hi {customer.firstName}</h1>
          <p className="text-[15px] text-muted-foreground">
            {summaryLine({ fixing, ready: ready.length, waiting: waitingQuotes.length, outstanding })}
          </p>
        </div>

        <NowCard
          shop={shop}
          ready={ready[0]}
          quote={waitingQuotes[0]}
          answer={repairs.find((r) => r.words.needsYou && r.words.stage === 1)}
          bill={unpaid[0]}
          open={repairs.find((r) => r.words.stage === 0 || r.words.stage === 1)}
          nowMs={now}
        />

        {/* ------------------------------------------------------ repairs -- */}
        <section aria-labelledby="repairs-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="repairs-title" className="text-xl font-semibold">
              Your repairs <span className="text-muted-foreground">({repairs.length})</span>
            </h2>
            <Button asChild size="lg" variant="outline" className={BIG_BUTTON}>
              <Link href="/portal/tickets/new">
                <Plus aria-hidden />
                New repair request
              </Link>
            </Button>
          </div>
          {repairs.length === 0 ? (
            <Empty>
              A repair appears here the moment {shop.name} books your device in. Something broken? Start a repair request
              above and tell them what is wrong.
            </Empty>
          ) : (
            <RecordGrid>
              {repairs.map((repair) => {
                const update = repair.comments[0];
                return (
                  <li key={repair.id}>
                    <RecordCard
                      href={`/portal/tickets/${repair.id}`}
                      visual={<PhotoVisual src={devicePicture(repair.asset)} />}
                      title={repair.device ?? repair.problemType ?? `Repair #${repair.number}`}
                      subtitle={update ? update.body : repair.words.next}
                      // In the facts row, not the title row: a long status word must never squeeze the title to nothing on a 320px phone.
                      meta={
                        <>
                          <StatusPill size="md" tone={repair.words.tone} label={repair.words.label} />
                          <MetaChip>Repair #{repair.number}</MetaChip>
                          <MetaChip>Updated {whenWords(repair.updatedAt, now, zone)}</MetaChip>
                        </>
                      }
                    />
                  </li>
                );
              })}
            </RecordGrid>
          )}
        </section>

        {/* ---------------------------------------------------- estimates -- */}
        {quotes.length > 0 ? (
          <section aria-labelledby="quotes-title" className="flex flex-col gap-3">
            <h2 id="quotes-title" className="text-xl font-semibold">
              Estimates <span className="text-muted-foreground">({quotes.length})</span>
            </h2>
            <RecordGrid>
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <RecordCard
                    href={`/portal/estimates/${quote.id}`}
                    visual={<IconVisual icon={FileText} />}
                    title={`Estimate #${quote.number}`}
                    subtitle={quote.status === "SENT" ? "Tap to read it and say yes or no." : `Sent ${dayWords(quote.createdAt, now, zone)}`}
                    meta={
                      <>
                        <StatusPill size="md" tone={quote.words.tone} label={quote.words.label} />
                        <MetaChip>Total {formatCents(quote.totalCents)}</MetaChip>
                      </>
                    }
                  />
                </li>
              ))}
            </RecordGrid>
          </section>
        ) : null}

        {/* ----------------------------------------------------- invoices -- */}
        {bills.length > 0 ? (
          <section aria-labelledby="bills-title" className="flex flex-col gap-3">
            <h2 id="bills-title" className="text-xl font-semibold">
              Invoices <span className="text-muted-foreground">({bills.length})</span>
            </h2>
            <RecordGrid>
              {bills.map((bill) => (
                <li key={bill.id}>
                  <RecordCard
                    href={`/portal/invoices/${bill.id}`}
                    visual={<IconVisual icon={Receipt} />}
                    title={`Invoice #${bill.number}`}
                    subtitle={
                      bill.owed > 0
                        ? `${formatCents(bill.owed)} to pay`
                        : bill.status === "VOID"
                          ? "Cancelled, nothing to pay"
                          : "Paid in full, thank you"
                    }
                    meta={
                      <>
                        <StatusPill size="md" tone={bill.words.tone} label={bill.words.label} />
                        <MetaChip>Total {formatCents(bill.totals.totalCents)}</MetaChip>
                        <MetaChip>{dayWords(bill.createdAt, now, zone)}</MetaChip>
                      </>
                    }
                  />
                </li>
              ))}
            </RecordGrid>
          </section>
        ) : null}
      </div>
    </PortalShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-5 py-8 text-center text-[15px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

type Repair = {
  id: string;
  number: number;
  device: string | null;
  asset: { type: string; make: string | null; model: string | null } | null;
  words: ReturnType<typeof repairWords>;
};

/**
 * The one thing that matters now, with one black button. In order: a device
 * ready to collect, an estimate waiting for an answer, a question from the
 * shop, a bill to pay, a repair in progress; otherwise "all caught up".
 */
function NowCard({
  shop,
  ready,
  quote,
  answer,
  bill,
  open,
  nowMs,
}: {
  shop: PublicShop;
  ready?: Repair;
  quote?: { id: string; number: number; totalCents: number };
  answer?: Repair;
  bill?: { id: string; number: number; owed: number; dueDate: Date | null };
  open?: Repair;
  nowMs: number;
}) {
  if (ready) {
    return (
      <Hero
        picture={devicePicture(ready.asset)}
        kicker="Ready to collect"
        title={ready.words.headline}
        body={shop.hours.length > 0 ? `Opening hours: ${shop.hours.join(" · ")}` : ready.words.next}
      >
        {shop.mapUrl ? (
          <Button asChild size="lg" className={HUGE_BUTTON}>
            <a href={shop.mapUrl} target="_blank" rel="noreferrer">
              <MapPin aria-hidden />
              Get directions
            </a>
          </Button>
        ) : null}
        {shop.phone ? (
          <Button asChild size="lg" variant={shop.mapUrl ? "outline" : "default"} className={shop.mapUrl ? BIG_BUTTON : HUGE_BUTTON}>
            <a href={telHref(shop.phone)}>
              <Phone aria-hidden />
              Call {shop.phone}
            </a>
          </Button>
        ) : null}
        <Button asChild size="lg" variant="outline" className={BIG_BUTTON}>
          <Link href={`/portal/tickets/${ready.id}`}>Open repair #{ready.number}</Link>
        </Button>
      </Hero>
    );
  }
  if (quote) {
    return (
      <Hero picture="/images/home/price-tag.webp" kicker="Waiting for your answer" title={`Estimate: ${formatCents(quote.totalCents)}`} body="Read what the shop would do and say yes or no. Nothing starts until you approve.">
        <Button asChild size="lg" className={HUGE_BUTTON}>
          <Link href={`/portal/estimates/${quote.id}`}>Review estimate #{quote.number}</Link>
        </Button>
      </Hero>
    );
  }
  if (answer) {
    return (
      <Hero picture={devicePicture(answer.asset)} kicker="Waiting for your answer" title={answer.words.headline} body={answer.words.next}>
        <Button asChild size="lg" className={HUGE_BUTTON}>
          <Link href={`/portal/tickets/${answer.id}#message`}>Reply to the shop</Link>
        </Button>
      </Hero>
    );
  }
  if (bill) {
    const due = bill.dueDate ? dueWords(bill.dueDate, nowMs, shop.timezone).text : "";
    return (
      <Hero picture="/images/home/card-terminal.webp" kicker={due || "To pay"} title={`${formatCents(bill.owed)} to pay`} body={`Invoice #${bill.number} from ${shop.name}.`}>
        <Button asChild size="lg" className={HUGE_BUTTON}>
          <Link href={`/portal/invoices/${bill.id}`}>See the bill</Link>
        </Button>
      </Hero>
    );
  }
  if (open) {
    return (
      <Hero picture={devicePicture(open.asset)} kicker={open.words.label} title={open.words.headline} body={open.words.next}>
        <Button asChild size="lg" className={HUGE_BUTTON}>
          <Link href={`/portal/tickets/${open.id}`}>See how it is going</Link>
        </Button>
      </Hero>
    );
  }
  return (
    <Hero picture="/images/home/toolbox.webp" kicker="All caught up" title="Nothing needs you right now" body={`Something else broken? Tell ${shop.name} what is wrong and they will get back to you.`}>
      <Button asChild size="lg" className={HUGE_BUTTON}>
        <Link href="/portal/tickets/new">Start a repair request</Link>
      </Button>
    </Hero>
  );
}

function Hero({
  picture,
  kicker,
  title,
  body,
  children,
}: {
  picture: string;
  kicker: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={kicker} className="overflow-hidden rounded-2xl border border-border bg-surface sm:flex">
      <div className="relative aspect-[16/9] w-full shrink-0 bg-white sm:aspect-auto sm:w-56">
        <Image src={picture} alt="" fill sizes="(max-width: 640px) 100vw, 224px" className="object-contain p-4" priority />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{kicker}</p>
          <h2 className="text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{title}</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
        </div>
        <div className={cn("flex flex-col gap-2")}>{children}</div>
      </div>
    </section>
  );
}

/** One friendly sentence instead of a wall of stat tiles. */
function summaryLine({
  fixing,
  ready,
  waiting,
  outstanding,
}: {
  fixing: number;
  ready: number;
  waiting: number;
  outstanding: number;
}): string {
  const parts: string[] = [];
  if (ready > 0) parts.push(ready === 1 ? "1 repair ready to collect" : `${ready} repairs ready to collect`);
  if (fixing > 0) parts.push(fixing === 1 ? "1 repair being fixed" : `${fixing} repairs being fixed`);
  if (waiting > 0) parts.push(waiting === 1 ? "1 estimate waiting for your answer" : `${waiting} estimates waiting for your answer`);
  if (outstanding > 0) parts.push(`${formatCents(outstanding)} to pay`);

  if (parts.length === 0) return "You are all caught up. Nothing needs your attention.";
  if (parts.length === 1) return `${capital(parts[0])}.`;
  return `${capital(parts.slice(0, -1).join(", "))} and ${parts[parts.length - 1]}.`;
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
