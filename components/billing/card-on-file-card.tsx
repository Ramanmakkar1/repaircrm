"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconChip } from "@/components/ui/chip";
import { ACTIONS, ICONS } from "@/components/ui/icons";

/** What the server tells the browser about a saved card. Never a card number. */
export type SavedCard = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  expired: boolean;
};

/**
 * "Payment methods" on the customer hub.
 *
 * WHAT THIS CARD IS FOR: letting a shop bill a managed-services customer
 * without chasing them for a card every month, and letting the front desk
 * settle a repair for a regular who is not standing there.
 *
 * WHAT IT IS NOT: a card form. "Save a card" hands the browser to Stripe's own
 * hosted page and what comes back is a brand and four digits. There is nowhere
 * in this app to type a card number, deliberately, and adding one would drag
 * the shop from PCI SAQ A into a full audit.
 *
 * The card appears a moment AFTER the redirect, because the webhook is what
 * writes it. Rather than showing "no card on file" to somebody who just saved
 * one, the just-saved state says so and refreshes itself.
 */
export function CardOnFileCard({
  customerId,
  customerName,
  card,
  paymentsConfigured,
  canManage,
  justSaved,
  saveAction,
  removeAction,
}: {
  customerId: string;
  customerName: string;
  card: SavedCard | null;
  /** False when this server has no Stripe key at all. */
  paymentsConfigured: boolean;
  /** Owner and front desk only — a technician has no business here. */
  canManage: boolean;
  /** True right after the Stripe redirect, while the webhook catches up. */
  justSaved: boolean;
  saveAction: (
    customerId: string,
  ) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  removeAction: (
    customerId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // The webhook usually lands within a second of the redirect. Three polite
  // refreshes cover a slow one without turning into a polling loop.
  const waiting = justSaved && !card;
  React.useEffect(() => {
    if (!waiting) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 3) clearInterval(timer);
    }, 1500);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const save = () => {
    startTransition(async () => {
      const result = await saveAction(customerId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // A full navigation, not a router push: the destination is Stripe.
      window.location.href = result.url;
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await removeAction(customerId);
      if (result.ok) toast.success("Card removed.");
      else toast.error(result.error);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3.5">
        <IconChip
          icon={ICONS.payment}
          className={
            card
              ? "bg-status-resolved-bg text-status-resolved-fg"
              : "bg-surface-hover text-muted-foreground"
          }
        />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>Payment methods</CardTitle>
          <CardDescription>
            {card
              ? `Invoices for ${customerName} can be charged without asking again.`
              : "A card kept at Stripe, so repeat invoices can be settled in one click."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!paymentsConfigured ? (
          <p className="rounded-md bg-surface-hover px-3.5 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
            Online payments aren&rsquo;t set up on this server yet, so there is
            nowhere to keep a card. Ask whoever runs RepairFlow to add a Stripe
            key, then connect the shop under Settings → Payments.
          </p>
        ) : card ? (
          <>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-hover px-4 py-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-bold capitalize text-foreground">
                  {card.brand} &middot;&middot;&middot;&middot;{card.last4}
                </span>
                <span
                  className={
                    card.expired
                      ? "text-[13px] font-semibold text-destructive"
                      : "text-[13px] text-muted-foreground"
                  }
                >
                  {card.expMonth
                    ? `Expires ${String(card.expMonth).padStart(2, "0")}/${String(
                        card.expYear,
                      ).slice(-2)}`
                    : "No expiry on file"}
                  {card.expired ? " — this card has expired" : ""}
                </span>
              </div>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={remove}
                  aria-label="Remove card"
                >
                  {pending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ACTIONS.delete />
                  )}
                </Button>
              ) : null}
            </div>

            {card.expired ? (
              <p className="flex items-start gap-2.5 rounded-md bg-destructive-soft px-3.5 py-2.5 text-[13.5px] font-medium text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  Any charge against this card will be declined. Ask the
                  customer for a new one.
                </span>
              </p>
            ) : null}

            {canManage ? (
              <Button variant="outline" disabled={pending} onClick={save}>
                <ACTIONS.add /> Replace with a different card
              </Button>
            ) : null}
          </>
        ) : waiting ? (
          <p className="flex items-center gap-2.5 rounded-md bg-surface-hover px-3.5 py-3 text-[13.5px] text-muted-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Saving the card — this will update in a moment.
          </p>
        ) : (
          <>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              No card on file. The customer enters it on Stripe&rsquo;s own
              page; RepairFlow only ever sees the brand and last four digits.
            </p>
            {canManage ? (
              <Button disabled={pending} onClick={save}>
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" /> Opening Stripe…
                  </>
                ) : (
                  <>
                    <ACTIONS.add /> Save a card
                  </>
                )}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
