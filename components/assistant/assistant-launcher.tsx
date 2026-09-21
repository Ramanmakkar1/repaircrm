"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Loader2,
  Mic,
  Send,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  confirmRemoveProductAction,
  runAssistantAction,
  type AssistantOutcome,
} from "@/app/(app)/assistant/actions";
import { useDictation } from "@/components/voice/use-dictation";

/**
 * The inventory assistant — a floating button that opens a command bar.
 *
 * Type or speak a command in any language; the server interprets it into ONE
 * known inventory action and reports back (lib/ai/assistant.ts). It can only
 * add, find or remove stock — anything else comes back as a polite refusal, so
 * nobody can steer it into writing code or leaving the shop's inventory.
 *
 * A removal never happens on the first pass: it comes back as a `confirm`, and
 * only the explicit "Confirm remove" tap runs it.
 */
export function AssistantLauncher({ cloud = false, enabled = true, owner = false }: { cloud?: boolean; enabled?: boolean; owner?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [outcome, setOutcome] = React.useState<AssistantOutcome | null>(null);

  const run = React.useCallback(
    (text: string) => {
      const command = text.trim();
      if (!command || !enabled) return;
      startTransition(async () => {
        try {
        const result = await runAssistantAction(command);
        setOutcome(result);
        if (result.kind === "done") {
          setInput("");
          router.refresh(); // the catalogue behind the dialog just changed
        }
        } catch {
          setOutcome({ kind: "error", message: "The assistant couldn't finish that request. Your text is still here; try again." });
        }
      });
    },
    [router, enabled],
  );

  const dictation = useDictation(
    (transcript) => {
      setInput(transcript);
      setOutcome({ kind: "info", message: "Check what I heard, then press Send." });
    },
    (message) => setOutcome({ kind: "error", message }),
    { cloud },
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    run(input);
  }

  function confirmRemove(productId: string) {
    startTransition(async () => {
      const result = await confirmRemoveProductAction(productId);
      setOutcome(result);
      if (result.kind === "done") router.refresh();
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      dictation.cancel();
      setInput("");
      setOutcome(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask assistant — speak or type"
        className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Mic className="size-4" aria-hidden />
        <span className="hidden sm:inline">Ask assistant</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden />
              Assistant
            </DialogTitle>
            <DialogDescription>
              Speak or type to find repairs, check stock, add products, or update quantities and prices.
            </DialogDescription>
          </DialogHeader>

          {!enabled ? <div role="status" className="rounded-md border p-3 text-sm">
            <p className="font-medium">AI is not connected yet</p>
            <p className="mt-1 text-muted-foreground">{owner ? "Connect an AI provider to use shop commands." : "Ask your shop owner to connect an AI provider."}</p>
            {owner ? <Link className="mt-2 inline-block underline" href="/settings/assistant">View assistant setup</Link> : null}
          </div> : null}

          <form onSubmit={submit} className="flex items-center gap-2">
            <Input
              value={input}
              aria-label="Message to the assistant"
              maxLength={500}
              onChange={(event) => setInput(event.target.value)}
              autoFocus
              placeholder="e.g. add 10 iPhone 6 screens"
              disabled={pending}
            />
              <Button
                type="button"
                variant="soft"
                size="icon"
                aria-label={dictation.state === "listening" ? "Stop listening" : "Speak a command"}
                aria-pressed={dictation.state === "listening"}
                disabled={!enabled || !dictation.supported || pending || dictation.state === "transcribing"}
                title={!dictation.supported ? "Voice is unavailable in this browser. You can type instead." : "Speak, review, then send"}
                onClick={dictation.state === "listening" ? dictation.stop : dictation.start}
                className={cn(
                  dictation.state === "listening" && "ring-2 ring-inset ring-accent/50",
                )}
              >
                {dictation.state === "transcribing" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : dictation.state === "listening" ? (
                  <Square className="size-4" aria-hidden />
                ) : (
                  <Mic className="size-4" aria-hidden />
                )}
              </Button>
            <Button
              type="submit"
              size="icon"
              aria-label="Send"
              disabled={!enabled || pending || dictation.state !== "idle" || input.trim() === ""}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground" role="status">{dictation.state === "listening" ? "Listening… press Stop when finished." : dictation.state === "transcribing" ? "Transcribing your recording…" : !dictation.supported ? "Voice is unavailable here. Type your request above." : "Microphone starts only when you press it. Review the transcript before sending."}</p>
          {enabled ? <div className="flex flex-wrap gap-2">{["What's ready for pickup?", "What's running low?", "Find iPhone screens"].map(text => <Button key={text} type="button" variant="outline" size="sm" disabled={pending} onClick={() => setInput(text)}>{text}</Button>)}</div> : null}

          {outcome ? (
            <OutcomeView
              outcome={outcome}
              pending={pending}
              onConfirmRemove={confirmRemove}
              onCancel={() => setOutcome(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function OutcomeView({
  outcome,
  pending,
  onConfirmRemove,
  onCancel,
}: {
  outcome: AssistantOutcome;
  pending: boolean;
  onConfirmRemove: (productId: string) => void;
  onCancel: () => void;
}) {
  if (outcome.kind === "confirm") {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-status-in-progress/30 bg-status-in-progress-bg px-3.5 py-3">
        <p className="flex items-start gap-2 text-[13.5px] text-status-in-progress-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{outcome.message}</span>
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => onConfirmRemove(outcome.remove.productId)}
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Confirm remove
          </Button>
        </div>
      </div>
    );
  }

  const cls =
    outcome.kind === "done"
      ? "border-status-resolved/30 bg-status-resolved-bg text-status-resolved-fg"
      : outcome.kind === "error"
        ? "border-destructive/30 bg-destructive-soft text-destructive"
        : "border-border bg-surface-hover/60 text-foreground";

  const Icon =
    outcome.kind === "done" ? Check : outcome.kind === "error" ? AlertCircle : Sparkles;

  return (
    <div
      role={outcome.kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-[13.5px]",
        cls,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="whitespace-pre-line leading-snug">{outcome.message}</span>
    </div>
  );
}
