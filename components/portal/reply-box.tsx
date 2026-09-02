"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { replyToTicketAction } from "@/app/portal/tickets/[id]/actions";

/**
 * "Send a message" on the customer's own repair page.
 *
 * The reply is cleared and the page refreshed on success rather than optimistically
 * appended: the timeline above is the shop's record of the conversation, and it
 * should always be showing what the server actually stored.
 */
export function ReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    const result = await replyToTicketAction(ticketId, formData);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      setSent(false);
      return;
    }
    setError(null);
    setSent(true);
    formRef.current?.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-3 px-5 py-5 sm:px-6">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <Textarea
        name="body"
        required
        rows={4}
        maxLength={4000}
        onChange={() => setSent(false)}
        placeholder="Ask a question, or tell the shop something they should know."
        className="text-[15px]"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          {sent
            ? "Sent — the shop will see it on your repair."
            : "The shop sees this on the repair straight away."}
        </span>
        <Button type="submit" disabled={busy}>
          <Send />
          {busy ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
