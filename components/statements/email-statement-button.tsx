"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { emailStatementAction } from "@/app/(app)/customers/[id]/statement/actions";
import { Button } from "@/components/ui/button";

/**
 * Sends the statement the operator is currently looking at — the same `from`/
 * `to` the page rendered, so what lands in the customer's inbox always matches
 * what was on screen when the button was pressed.
 */
export function EmailStatementButton({
  customerId,
  from,
  to,
  disabledReason,
}: {
  customerId: string;
  from: string;
  to: string;
  /** e.g. "No email address on file" — shown as the button's tooltip. */
  disabledReason?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (disabledReason) {
    return (
      <Button variant="outline" disabled title={disabledReason}>
        <Mail />
        Email statement
      </Button>
    );
  }

  async function send() {
    setBusy(true);
    const result = await emailStatementAction({ customerId, from, to });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
    // The send wrote an outbox row; the customer hub's timeline should show it.
    router.refresh();
  }

  return (
    <Button variant="outline" disabled={busy} onClick={send}>
      {busy ? <Loader2 className="animate-spin" /> : <Mail />}
      Email statement
    </Button>
  );
}
