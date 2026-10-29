"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ACTIONS } from "@/components/ui/icons";
import { markPickedUpAction } from "@/app/(app)/tickets/actions";

/**
 * "Hand over now": the next step on a bill that was paid in full at the
 * counter, while the repair's device is still in the shop. One tap closes the
 * repair the same way its own Hand over does (markPickedUpAction) and goes back
 * to it. Paid in full already, so there is no money to warn about.
 */
export function HandOverNowButton({
  ticketId,
  ticketNumber,
  className,
  size = "lg",
}: {
  ticketId: string;
  ticketNumber: number;
  className?: string;
  size?: "sm" | "lg";
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const handOver = () =>
    startTransition(async () => {
      const result = await markPickedUpAction(ticketId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`#${ticketNumber} handed over and closed.`);
      router.push(`/tickets/${ticketId}`);
    });

  return (
    <Button
      type="button"
      size={size}
      className={cn(size === "lg" && "h-14 w-full px-6 text-lg [&_svg]:size-5", className)}
      disabled={pending}
      onClick={handOver}
    >
      <ACTIONS.receive aria-hidden />
      {pending ? "Closing…" : `Hand over now · #${ticketNumber}`}
    </Button>
  );
}
