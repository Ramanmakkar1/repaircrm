import * as React from "react";
import Link from "next/link";
import { Phone } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { MetaChip } from "@/components/ui/record-card";
import { DeviceVisual } from "@/components/dashboard/device-visual";
import { formatCents } from "@/lib/money";
import { telHref } from "@/components/customers/customer-facts";
import { PickupCardActions } from "./pickup-card-actions";
import { deviceName, pickIntakePhotoId, repairSubtitle } from "./repair-card-facts";
import { customerLabel } from "./ticket-meta";
import { pickupPlan, readySince, type PickupCardData, type PickupMoney } from "./pickup-card-facts";

/**
 * One repair waiting on the shelf, as a card bigger and more useful than the
 * ordinary repair card: this is the moment a customer is standing at the counter.
 *
 *   [ picture ]  #1015 · Daniel Brooks
 *                Latitude 5420 - fan roars, throttling under load
 *   (Ready since Tuesday)                      (512) 555-0123
 *   ┌──────────────────────────────────────────────┐
 *   │ Balance due                         $120.00  │
 *   │ Invoice #1014 · $170.00 total                │
 *   └──────────────────────────────────────────────┘
 *   [            Take payment             ]
 *   [ Open repair ] [ Hand over anyway ]
 *
 * The top of the card opens the repair (the title link is stretched over it).
 * The phone number is a SIBLING control raised above that link, never an anchor
 * inside it, so tapping it dials and tapping the picture opens the repair. The
 * money block and the buttons sit outside the link altogether: a thumb that
 * lands a little off a payment button must not open another page.
 *
 * States are words first ("Balance due", "Paid in full", "Paid, but 2 charges
 * not billed yet", "No invoice yet"); the tint only backs the word up, and there
 * is no coloured stripe down any edge.
 */
export function PickupCard({
  card,
  now,
  className,
}: {
  card: PickupCardData;
  /** One request-time clock, so every card in a render agrees on "now". */
  now: number;
  className?: string;
}) {
  const device = deviceName(card.asset);
  const customer = customerLabel(card.customer);
  const since = readySince(card.readySince, now);
  const plan = pickupPlan(card.money, card.unbilledCharges > 0);

  return (
    <article
      aria-label={`Repair #${card.number} for ${customer}`}
      className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-surface", className)}
    >
      <div className="relative flex flex-col gap-2 p-4 pb-3 transition-colors hover:bg-surface-hover/60 sm:p-5 sm:pb-3">
        <div className="flex items-start gap-4">
          <DeviceVisual
            label={device ?? card.subject}
            type={card.asset?.type ?? ""}
            photoId={pickIntakePhotoId(card.attachments)}
            className="size-24 sm:size-28"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h2 className="text-xl font-semibold leading-tight">
              <Link
                href={`/tickets/${card.id}`}
                className="line-clamp-2 break-words rounded-md after:absolute after:inset-0 after:rounded-t-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {`#${card.number} · ${customer}`}
              </Link>
            </h2>
            <p className="line-clamp-2 break-words text-[15px] leading-snug text-muted-foreground">
              {repairSubtitle(card.subject, device)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
          <MetaChip icon={ICONS.dueDate} tone={since.long ? "alert" : "neutral"}>
            {since.label}
          </MetaChip>
          {card.phone ? (
            <a
              href={telHref(card.phone)}
              data-touch-control
              className="relative z-10 inline-flex min-h-12 max-w-full items-center gap-2 rounded-lg pl-1 pr-2 text-base font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Phone aria-hidden className="size-4 shrink-0" />
              <span className="rf-num truncate">{card.phone}</span>
              <span className="sr-only">Call {customer}</span>
            </a>
          ) : null}
        </div>
      </div>

      <div className="mx-4 sm:mx-5">
        <MoneyBlock money={card.money} />
      </div>

      <div className="p-4 pt-3 sm:p-5 sm:pt-3">
        <PickupCardActions
          ticketId={card.id}
          number={card.number}
          customerName={customer}
          money={card.money}
          plan={plan}
          unbilledCharges={card.unbilledCharges}
        />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

const MONEY_LOOK: Record<PickupMoney["kind"], { box: string; Icon: React.ComponentType<{ className?: string }> }> = {
  due: { box: "bg-status-in-progress-bg text-status-in-progress-fg", Icon: ACTIONS.pay },
  paid: { box: "bg-status-resolved-bg text-status-resolved-fg", Icon: ACTIONS.approve },
  // Settled but not finished: the attention tint and the invoice icon, never the green tick.
  unbilled: { box: "bg-status-in-progress-bg text-status-in-progress-fg", Icon: ICONS.invoice },
  none: { box: "bg-surface-hover text-foreground", Icon: ICONS.invoice },
};

/** What the customer owes, in words: the amount only when there is one. */
function MoneyBlock({ money }: { money: PickupMoney }) {
  const { box, Icon } = MONEY_LOOK[money.kind];
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl px-4 py-3", box)}>
      <div className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden className="size-6 shrink-0" />
        <div className="min-w-0">
          <p className="text-balance text-lg font-semibold leading-tight">{money.label}</p>
          <p className="break-words text-sm leading-snug">{money.detail}</p>
        </div>
      </div>
      {money.kind === "due" ? (
        <p className="rf-num shrink-0 text-2xl font-bold tabular-nums leading-none sm:text-3xl">
          {formatCents(money.dueCents)}
        </p>
      ) : null}
    </div>
  );
}
