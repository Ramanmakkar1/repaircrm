"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import { textCheckInReceiptAction } from "@/app/(app)/tickets/actions";

/**
 * Right after check-in, the three things the counter does next, so the person
 * at the desk is not left looking at a repair screen wondering:
 *
 *   Print claim stub     the work order, whose tear-off stub the customer keeps
 *   Text a receipt       only when the customer said yes to texts
 *   Check in another     back to an empty check-in
 *
 * Shown once (`?checkedIn=1`); "Done" drops it.
 */
export function CheckedInHandoff({
  ticketId,
  ticketNumber,
  customerName,
  canText,
  doneHref,
}: {
  ticketId: string;
  ticketNumber: number;
  customerName: string;
  /** The customer said yes to texts and has a mobile. */
  canText: boolean;
  /** The repair without the hand-off. */
  doneHref: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [texted, setTexted] = React.useState(false);

  const text = () =>
    startTransition(async () => {
      const result = await textCheckInReceiptAction(ticketId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTexted(true);
      if (result.notice) toast.warning(result.notice);
      else toast.success(result.done ?? "Receipt texted.");
    });

  return (
    <section
      aria-labelledby="checked-in-title"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5 print:hidden"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden className="mt-0.5 size-6 shrink-0 text-status-resolved-fg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="checked-in-title" className="text-lg font-semibold">
            #{ticketNumber} is checked in
          </h2>
          <p className="text-base text-muted-foreground">
            Give {customerName} the claim stub{canText ? " or text them a receipt" : ""}.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {/* Outline, all three: the repair's own big button stays the one primary on screen. */}
        <Button asChild variant="outline" className="h-12 text-base">
          <Link href={`/print/tickets/${ticketId}`}>
            <Printer aria-hidden />
            Print claim stub
          </Link>
        </Button>
        {canText ? (
          <Button type="button" variant="outline" className="h-12 text-base" disabled={pending || texted} onClick={text}>
            <MessageCircle aria-hidden />
            {texted ? "Receipt texted" : pending ? "Texting…" : "Text a receipt"}
          </Button>
        ) : null}
        <Button asChild variant="outline" className="h-12 text-base">
          <Link href="/tickets/new">
            <ACTIONS.add aria-hidden />
            Check in another
          </Link>
        </Button>
      </div>
      <Link
        href={doneHref}
        data-touch-control
        className="inline-flex min-h-12 w-fit items-center text-base font-medium text-accent-soft-foreground hover:underline"
      >
        Done, show the repair
      </Link>
    </section>
  );
}
