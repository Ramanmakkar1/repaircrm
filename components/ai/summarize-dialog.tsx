"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { summarizeTicketAction } from "@/app/(app)/tickets/ai-actions";
import { AiButton } from "./ai-button";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string }
  | { status: "error"; reason: string };

/**
 * "Catch me up" for a ticket somebody else has been working.
 *
 * The summary is NOT stored. It is generated on open, read, and dropped when
 * the dialog closes — a cached summary of a ticket that has since moved on is
 * worse than no summary, and a stored one would quietly become a second,
 * unreviewed account of the job sitting next to the timeline.
 */
export function SummarizeTicketButton({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<State>({ status: "idle" });
  const [copied, setCopied] = React.useState(false);

  const run = React.useCallback(async () => {
    setState({ status: "loading" });
    const result = await summarizeTicketAction(ticketId);
    setState(
      result.ok
        ? { status: "done", text: result.text }
        : { status: "error", reason: result.reason },
    );
  }, [ticketId]);

  // Generating belongs to the open/close event, not to an effect watching
  // `open` — an effect would also re-fire on unrelated re-renders and bill a
  // second generation for a dialog that never closed.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    setCopied(false);
    if (next) {
      void run();
    } else {
      setState({ status: "idle" });
    }
  }

  async function copy() {
    if (state.status !== "done") return;
    try {
      await navigator.clipboard.writeText(state.text);
      setCopied(true);
    } catch {
      // Clipboard access is blocked outside secure contexts; selecting the text
      // by hand still works, so say that rather than failing silently.
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <AiButton>Summarize</AiButton>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ticket summary</DialogTitle>
          <DialogDescription>
            Generated just now from this ticket&rsquo;s history. Internal only,
            and not saved anywhere.
          </DialogDescription>
        </DialogHeader>

        {state.status === "loading" ? (
          <div className="flex flex-col gap-2.5" aria-live="polite">
            <span className="sr-only">Reading the ticket…</span>
            <Skeleton className="h-4 w-[92%]" />
            <Skeleton className="h-4 w-[78%]" />
            <Skeleton className="h-4 w-[85%]" />
            <Skeleton className="h-4 w-[64%]" />
          </div>
        ) : null}

        {state.status === "error" ? (
          <p
            role="alert"
            className="rounded-md bg-destructive-soft px-3.5 py-2.5 text-[13.5px] text-destructive"
          >
            {state.reason}
          </p>
        ) : null}

        {state.status === "done" ? (
          <SummaryBullets text={state.text} />
        ) : null}

        <DialogFooter>
          {state.status === "error" ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void run()}>
              <ACTIONS.retry className="size-4" />
              Try again
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={state.status !== "done"}
            onClick={() => void copy()}
          >
            {copied ? <Check className="size-4" /> : <ACTIONS.copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Models are inconsistent about their bullet character even when told. Strip
 * whichever one turned up and render a real list, so the summary looks the same
 * every time regardless of which driver produced it.
 */
function SummaryBullets({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return (
      <p className="text-[14.5px] leading-relaxed text-foreground">{text}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {lines.map((line, index) => (
        <li
          key={index}
          className="flex gap-2.5 text-[14.5px] leading-snug text-foreground"
        >
          <span
            aria-hidden
            className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-accent"
          />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}
