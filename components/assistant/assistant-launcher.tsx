"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Loader2,
  Mic,
  AudioLines,
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
import { RepairPilotMark } from "@/components/brand/repairpilot";

/**
 * One persistent assistant in the authenticated app shell. The floating mic
 * starts dictation in one tap; the keyboard opens the same assistant for typing.
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
  const [continuation, setContinuation] = React.useState<string | null>(null);
  const voiceButtonRef = React.useRef<HTMLButtonElement>(null);
  const launchButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const openedWithVoice = React.useRef(false);

  const run = React.useCallback(
    (text: string) => {
      const answer = text.trim();
      const command = continuation
        ? `${continuation}\nThe user answered the clarification with: ${answer}`
        : answer;
      if (!command || !enabled) return;
      startTransition(async () => {
        try {
        const result = await runAssistantAction(command);
        setOutcome(result);
        if (result.kind === "done") {
          setInput("");
          setContinuation(null);
          router.refresh(); // the catalogue behind the dialog just changed
        } else if (result.kind === "info" && result.continuation) {
          setInput("");
          setContinuation(result.continuation);
        } else {
          setContinuation(null);
        }
        } catch {
          setOutcome({ kind: "error", message: "The assistant couldn't finish that request. Your text is still here; try again." });
        }
      });
    },
    [router, enabled, continuation],
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
      setContinuation(null);
    }
  }

  function launch(event: React.MouseEvent<HTMLButtonElement>, voice: boolean) {
    launchButtonRef.current = event.currentTarget;
    openedWithVoice.current = voice && enabled && dictation.supported;
    setOpen(true);
    if (openedWithVoice.current) dictation.start();
  }

  return (
    <>
      <div
        role="group"
        aria-label="Shop assistant"
        className="rf-assistant-dock fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex w-[calc(100%-2rem)] max-w-[460px] items-center gap-2 rounded-full bg-surface p-2 sm:p-2.5 print:hidden"
      >
        <button
          type="button"
          onClick={(event) => launch(event, false)}
          aria-label="Type to assistant"
          title="Type to assistant"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rf-assistant-prompt flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full pl-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
        >
          <RepairPilotMark className="size-10 shrink-0 rounded-full sm:size-11" />
          <span className="truncate text-sm font-medium sm:text-lg">Ask RepairPilot<span className="hidden min-[400px]:inline"> anything</span></span>
        </button>
        <button
          type="button"
          onClick={(event) => launch(event, true)}
          aria-label="Speak to assistant"
          title="Speak to assistant from any screen"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rf-assistant-talk flex h-12 shrink-0 items-center gap-2 rounded-full px-4 text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-5"
        >
          <AudioLines className="size-5" aria-hidden />
          <span className="text-base font-medium sm:text-lg">Talk</span>
        </button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-md"
          onOpenAutoFocus={(event) => {
            if (openedWithVoice.current) {
              event.preventDefault();
              voiceButtonRef.current?.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launchButtonRef.current?.focus();
          }}
        >
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
              placeholder={continuation ? "Answer the assistant…" : "e.g. add 10 iPhone 6 screens"}
              disabled={pending}
            />
              <Button
                ref={voiceButtonRef}
                type="button"
                variant={dictation.state === "listening" ? "destructive" : "soft"}
                size={dictation.state === "listening" ? "sm" : "icon"}
                aria-label={dictation.state === "listening" ? "Stop listening" : "Speak a command"}
                aria-pressed={dictation.state === "listening"}
                disabled={!enabled || !dictation.supported || pending || dictation.state === "transcribing"}
                title={!dictation.supported ? "Voice is unavailable in this browser. You can type instead." : "Speak, review, then send"}
                onClick={dictation.state === "listening" ? dictation.stop : dictation.start}
                className={cn(
                  dictation.state === "listening" && "min-w-[5.25rem] shadow-sm",
                )}
              >
                {dictation.state === "transcribing" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : dictation.state === "listening" ? (
                  <>
                    <Square className="size-3.5 fill-current" aria-hidden />
                    <span>Stop</span>
                  </>
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

          <p className="text-xs text-muted-foreground" role="status">{dictation.state === "listening" ? "Listening… I’ll stop when you pause." : dictation.state === "transcribing" ? "Transcribing your recording…" : !dictation.supported ? "Voice is unavailable here. Type your request above." : "Microphone starts only when you press it. Review the transcript before sending."}</p>
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
