"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { draftTicketReplyAction } from "@/app/(app)/tickets/ai-actions";
import { DRAFT_TONE_LABEL, DRAFT_TONES, type DraftTone } from "@/lib/ai/types";
import { AiButton } from "./ai-button";

/**
 * The draft-reply strip that sits above the composer textarea.
 *
 * It hands the text back through `onDraft` instead of writing anywhere itself:
 * the composer owns the textarea's state, and a draft has to land in a field a
 * human can still edit. Nothing here can post an update.
 *
 * The draft REPLACES the textarea contents rather than appending, which is why
 * `onDraft` is only called after a confirm when there is already text — losing
 * a half-typed note to a mis-click is how a feature like this gets switched off
 * and never used again.
 */
export function DraftReplyControls({
  ticketId,
  hasExistingText,
  onDraft,
}: {
  ticketId: string;
  hasExistingText: boolean;
  onDraft: (text: string) => void;
}) {
  const [tone, setTone] = React.useState<DraftTone>("update");
  const [pending, startTransition] = React.useTransition();

  function run() {
    if (
      hasExistingText &&
      !window.confirm("Replace what you've already written with a fresh draft?")
    ) {
      return;
    }

    startTransition(async () => {
      const result = await draftTicketReplyAction(ticketId, tone);
      if (result.ok) {
        onDraft(result.text);
        toast.success("Draft ready — read it before you send it");
      } else {
        toast.error(result.reason);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-accent/25 bg-accent-soft/50 px-3 py-2.5">
      <Select
        value={tone}
        onValueChange={(value) => setTone(value as DraftTone)}
      >
        <SelectTrigger
          aria-label="What kind of update to draft"
          className="h-9 w-auto min-w-[11rem] bg-surface"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DRAFT_TONES.map((option) => (
            <SelectItem key={option} value={option}>
              {DRAFT_TONE_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AiButton pending={pending} onClick={run}>
        {pending ? "Drafting…" : "Draft reply"}
      </AiButton>

      <p className="text-xs leading-snug text-muted-foreground">
        Written from this ticket&rsquo;s notes. Always read it before it goes out.
      </p>
    </div>
  );
}
