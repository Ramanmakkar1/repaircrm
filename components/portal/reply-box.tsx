"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";

import { BIG_BUTTON } from "@/components/public/sizes";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { replyToTicketAction } from "@/app/portal/tickets/[id]/actions";

/**
 * "Message the shop" on the customer's own repair page.
 *
 * The reply is cleared and the page refreshed on success rather than optimistically
 * appended: the conversation above is the shop's record, and it should always
 * be showing what the server actually stored.
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
    <form ref={formRef} action={submit} className="flex flex-col gap-3 px-4 py-5 sm:px-6">
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      <Label htmlFor={`reply-${ticketId}`} className="text-[15px]">
        Message the shop
      </Label>
      <Textarea
        id={`reply-${ticketId}`}
        name="body"
        required
        rows={3}
        maxLength={4000}
        onChange={() => setSent(false)}
        placeholder="Ask a question, or tell the shop something they should know."
        className="rounded-xl px-4 py-3 text-base"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
          {sent ? (
            <>
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Sent. The shop sees it on your repair.
            </>
          ) : (
            "The shop sees this on your repair straight away."
          )}
        </p>
        <Button type="submit" size="lg" disabled={busy} className={BIG_BUTTON}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          {busy ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
