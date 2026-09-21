"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  AudioLines,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Mic,
  PackageSearch,
  PackagePlus,
  Square,
  TrendingUp,
  TriangleAlert,
  UserSearch,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  confirmAssistantAction,
  confirmRemoveProductAction,
  runAssistantAction,
  type AssistantOutcome,
} from "@/app/(app)/assistant/actions";
import { useDictation } from "@/components/voice/use-dictation";
import { RepairPilotMark } from "@/components/brand/repairpilot";

/**
 * One persistent assistant in the authenticated app shell. The dock's Talk
 * button starts dictation in one tap; the rest of the dock opens the same
 * conversation for typing.
 *
 * Type or speak in any language; the server interprets it into ONE known shop
 * action (lib/ai/assistant.ts) and reports back. Look-ups and "take me to…"
 * answer straight away with rows you can tap. Anything that changes a price, a
 * repair, the customer list or sends a message comes back as a `confirm` card
 * first — only the explicit tap runs it — and anything outside the shop comes
 * back as a polite refusal.
 *
 * The window is a conversation rather than a command line on purpose: a counter
 * person asks a follow-up ("and the black one?") far more naturally than they
 * re-type a whole command, and seeing their own words next to the answer is how
 * they catch a mishearing.
 */

type UserTurn = { id: number; from: "user"; text: string };
type AssistantTurn = { id: number; from: "assistant"; outcome: AssistantOutcome; settled?: boolean };
type Turn = UserTurn | AssistantTurn;
// Omit<> over a union collapses it to the shared keys, so spell both out.
type NewTurn = Omit<UserTurn, "id"> | Omit<AssistantTurn, "id">;

type Starter = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  say: string;
  /** Runs on tap. False = needs a name first, so it only fills the box. */
  run: boolean;
  tone: string;
  money?: boolean;
};

const STARTERS: Starter[] = [
  { icon: Wrench, title: "Ready for pickup", say: "What's ready for pickup?", run: true, tone: "text-status-ready-fg bg-status-ready-bg" },
  { icon: Clock, title: "Running late", say: "Which repairs are late?", run: true, tone: "text-status-overdue-fg bg-status-overdue-bg" },
  { icon: PackageSearch, title: "Low on stock", say: "What's running low?", run: true, tone: "text-status-waiting-fg bg-status-waiting-bg" },
  { icon: TrendingUp, title: "Today's numbers", say: "How did we do today?", run: true, tone: "text-status-resolved-fg bg-status-resolved-bg", money: true },
  { icon: CalendarDays, title: "Who's booked in", say: "Who's coming in today?", run: true, tone: "text-status-new-fg bg-status-new-bg" },
  { icon: UserSearch, title: "Find a customer", say: "Find customer ", run: false, tone: "text-status-in-progress-fg bg-status-in-progress-bg" },
  { icon: Wrench, title: "Check in a device", say: "Check in a device for ", run: false, tone: "text-status-new-fg bg-status-new-bg" },
  { icon: PackagePlus, title: "Add stock", say: "Add 10 ", run: false, tone: "text-status-waiting-fg bg-status-waiting-bg" },
];

const DOCK_KEY = "rf_assistant_dock";

export function AssistantLauncher({
  cloud = false,
  enabled = true,
  owner = false,
  name = "",
  showMoney = true,
}: {
  cloud?: boolean;
  enabled?: boolean;
  owner?: boolean;
  /** Whoever is signed in — the assistant greets them by first name. */
  name?: string;
  /** False for technicians, who don't see the shop's money anywhere else either. */
  showMoney?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [continuation, setContinuation] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const nextId = React.useRef(1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const voiceButtonRef = React.useRef<HTMLButtonElement>(null);
  const launchButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const openedWithVoice = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // A per-device convenience, so localStorage and not the prefs cookie: the
  // first paint is right either way (the dock is fixed and overlays content),
  // and a private window that refuses storage simply shows the full dock.
  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a browser-only value after mount
      setCollapsed(window.localStorage.getItem(DOCK_KEY) === "min");
    } catch {
      // Storage blocked: keep the default.
    }
  }, []);

  function setDock(min: boolean) {
    setCollapsed(min);
    try {
      window.localStorage.setItem(DOCK_KEY, min ? "min" : "full");
    } catch {
      // Not remembered, still works.
    }
  }

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, pending]);

  const push = React.useCallback((turn: NewTurn) => {
    setTurns((current) => [...current, { ...turn, id: nextId.current++ }]);
  }, []);

  const run = React.useCallback(
    (text: string) => {
      const answer = text.trim();
      if (!answer || !enabled || pending) return;
      const command = continuation
        ? `${continuation}\nThe user answered the clarification with: ${answer}`
        : answer;
      // Only the user's own earlier words go back as context — see
      // AssistantContext in lib/ai/assistant.ts for why results never do.
      const history = turns
        .filter((turn): turn is UserTurn => turn.from === "user")
        .map((turn) => turn.text)
        .slice(-3);

      push({ from: "user", text: answer });
      setInput("");
      setHint(null);
      startTransition(async () => {
        try {
          const result = await runAssistantAction(command, { path: pathname, history });
          push({ from: "assistant", outcome: result });
          setContinuation(result.kind === "info" && result.continuation ? result.continuation : null);
          if (result.kind === "done") router.refresh(); // the screen behind just changed
        } catch {
          push({
            from: "assistant",
            outcome: { kind: "error", message: "I couldn't finish that one. Give it another go?" },
          });
          setInput(answer);
        }
        inputRef.current?.focus();
      });
    },
    [continuation, enabled, pathname, pending, push, router, turns],
  );

  const dictation = useDictation(
    (transcript) => {
      setInput(transcript);
      setHint("Here's what I heard — fix anything, then send.");
      inputRef.current?.focus();
    },
    (message) => setHint(message),
    { cloud },
  );

  function settle(id: number) {
    setTurns((current) =>
      current.map((turn) => (turn.id === id && turn.from === "assistant" ? { ...turn, settled: true } : turn)),
    );
  }

  function confirm(turn: AssistantTurn) {
    const outcome = turn.outcome;
    if (outcome.kind !== "confirm") return;
    startTransition(async () => {
      try {
        const result =
          "pending" in outcome
            ? await confirmAssistantAction(outcome.pending)
            : await confirmRemoveProductAction(outcome.remove.productId);
        settle(turn.id);
        push({ from: "assistant", outcome: result });
        if (result.kind === "done") router.refresh();
      } catch {
        push({
          from: "assistant",
          outcome: { kind: "error", message: "That didn't go through — nothing was changed. Try again?" },
        });
      }
    });
  }

  function cancel(turn: AssistantTurn) {
    settle(turn.id);
    push({ from: "assistant", outcome: { kind: "info", message: "No problem — nothing was changed." } });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      dictation.cancel();
      setInput("");
      setTurns([]);
      setHint(null);
      setContinuation(null);
    }
  }

  function launch(event: React.MouseEvent<HTMLButtonElement>, voice: boolean) {
    launchButtonRef.current = event.currentTarget;
    openedWithVoice.current = voice && enabled && dictation.supported;
    setOpen(true);
    if (openedWithVoice.current) dictation.start();
  }

  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const listening = dictation.state === "listening";
  const transcribing = dictation.state === "transcribing";
  const starters = STARTERS.filter((starter) => showMoney || !starter.money);
  const status = listening
    ? "Listening… I'll stop when you pause."
    : transcribing
      ? "Writing down what you said…"
      : hint
        ? hint
        : !dictation.supported
          ? "Voice isn't available in this browser — typing works just the same."
          : "Type, or tap the mic and just say it. Any language.";

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={(event) => launch(event, false)}
          aria-label="Open the shop assistant"
          title="Ask RepairPilot"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rf-assistant-talk fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full text-white shadow-lg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden"
        >
          <AudioLines className="size-6" aria-hidden />
        </button>
      ) : (
        <div
          role="group"
          aria-label="Shop assistant"
          className="rf-assistant-dock fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex w-[calc(100%-2rem)] max-w-[460px] items-center gap-1.5 rounded-full bg-surface p-2 sm:gap-2 sm:p-2.5 print:hidden"
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
            <span className="truncate text-sm font-medium sm:text-lg">
              Ask RepairPilot<span className="hidden min-[400px]:inline"> anything</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDock(true)}
            aria-label="Shrink the assistant to a button"
            title="Shrink — it stays one tap away"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="size-5" aria-hidden />
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
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[min(88dvh,760px)] max-w-xl flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (openedWithVoice.current) voiceButtonRef.current?.focus();
            else inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launchButtonRef.current?.focus();
          }}
        >
          <header className="rf-assistant-hero flex items-center gap-3.5 px-5 py-5 pr-14 sm:px-6">
            <RepairPilotMark className="size-12 shrink-0 rounded-full shadow-sm" />
            <div className="min-w-0">
              <DialogTitle className="text-[19px] font-bold leading-tight tracking-tight">
                {firstName ? `Hi ${firstName}, what do you need?` : "Hi, what do you need?"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13.5px] leading-snug">
                Ask me about repairs, stock, customers or today&rsquo;s numbers — or tell me what to do.
              </DialogDescription>
            </div>
          </header>

          <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 sm:px-6">
            {!enabled ? (
              <div role="status" className="rounded-lg border border-border bg-surface-hover px-4 py-3.5 text-sm">
                <p className="font-semibold text-foreground">The assistant isn&rsquo;t switched on yet</p>
                <p className="mt-1 text-muted-foreground">
                  {owner
                    ? "Connect it once and everyone in the shop can use it."
                    : "Ask your shop owner to switch it on."}
                </p>
                {owner ? (
                  <Link
                    className="mt-2 inline-block font-semibold underline underline-offset-2"
                    href="/settings/assistant"
                    onClick={() => handleOpenChange(false)}
                  >
                    Switch it on
                  </Link>
                ) : null}
              </div>
            ) : null}

            {enabled && turns.length === 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {starters.map((starter) => (
                  <button
                    key={starter.title}
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (starter.run) run(starter.say);
                      else {
                        setInput(starter.say);
                        setHint("Finish the sentence, then send.");
                        inputRef.current?.focus();
                      }
                    }}
                    className="group flex min-h-[4.75rem] items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", starter.tone)}>
                      <starter.icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-bold leading-tight text-foreground">{starter.title}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                        {starter.run ? starter.say : `${starter.say.trim()}…`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {turns.map((turn) =>
              turn.from === "user" ? (
                <div key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] leading-snug text-accent-foreground">
                    {turn.text}
                  </p>
                </div>
              ) : (
                <AssistantBubble
                  key={turn.id}
                  turn={turn}
                  pending={pending}
                  onConfirm={() => confirm(turn)}
                  onCancel={() => cancel(turn)}
                  onNavigate={() => handleOpenChange(false)}
                />
              ),
            )}

            {pending ? (
              <div className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground" role="status">
                <RepairPilotMark className="size-7 shrink-0 rounded-full" />
                <span className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-hover px-4 py-2.5">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> On it…
                </span>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border bg-surface px-5 pb-4 pt-3 sm:px-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={input}
                aria-label="Message to the assistant"
                maxLength={500}
                onChange={(event) => setInput(event.target.value)}
                placeholder={continuation ? "Your answer…" : "Ask or tell me anything about the shop…"}
                disabled={pending || !enabled}
                // 16px: anything smaller makes iOS zoom the whole page on focus.
                className="h-13 min-w-0 flex-1 rounded-full border border-border-strong bg-background px-5 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
              />
              <button
                ref={voiceButtonRef}
                type="button"
                aria-label={listening ? "Stop listening" : "Speak"}
                aria-pressed={listening}
                disabled={!enabled || !dictation.supported || pending || transcribing}
                title={!dictation.supported ? "Voice isn't available in this browser. You can type instead." : "Tap and talk"}
                onClick={listening ? dictation.stop : dictation.start}
                className={cn(
                  "flex size-13 shrink-0 items-center justify-center rounded-full text-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40",
                  listening ? "rf-assistant-listening bg-destructive" : "rf-assistant-talk hover:brightness-110",
                )}
              >
                {transcribing ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : listening ? (
                  <Square className="size-4 fill-current" aria-hidden />
                ) : (
                  <Mic className="size-5" aria-hidden />
                )}
              </button>
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                className="size-13 shrink-0 rounded-full"
                disabled={!enabled || pending || dictation.state !== "idle" || input.trim() === ""}
              >
                <ArrowUp className="size-5" aria-hidden />
              </Button>
            </form>
            <div className="mt-2 flex items-start justify-between gap-3 px-1 text-[12.5px] text-muted-foreground">
              <p role="status">{status}</p>
              {collapsed ? (
                <button
                  type="button"
                  onClick={() => setDock(false)}
                  className="shrink-0 font-semibold underline underline-offset-2 hover:text-foreground"
                >
                  Show the full bar
                </button>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------

function AssistantBubble({
  turn,
  pending,
  onConfirm,
  onCancel,
  onNavigate,
}: {
  turn: AssistantTurn;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onNavigate: () => void;
}) {
  const { outcome } = turn;
  const links = outcome.kind === "done" || outcome.kind === "info" ? (outcome.links ?? []) : [];
  // When every bullet has a tappable row of its own, the bulleted copy of the
  // same list is noise: keep the headline and let the rows be the list. A
  // summary whose bullets are the answer (today's numbers) keeps them.
  const bullets = outcome.message.split("\n").filter((line) => line.startsWith("•")).length;
  const message =
    bullets > 0 && bullets === links.length
      ? outcome.message.slice(0, outcome.message.indexOf("\n•"))
      : outcome.message;

  const Icon =
    outcome.kind === "done"
      ? Check
      : outcome.kind === "error"
        ? AlertCircle
        : outcome.kind === "confirm"
          ? TriangleAlert
          : null;

  return (
    <div className="flex items-end gap-2.5" role={outcome.kind === "error" ? "alert" : "status"}>
      <RepairPilotMark className="size-7 shrink-0 rounded-full" />
      <div
        className={cn(
          "flex min-w-0 max-w-[90%] flex-col gap-2.5 rounded-2xl rounded-bl-md px-4 py-3 text-[14.5px] leading-snug",
          outcome.kind === "done"
            ? "bg-status-resolved-bg text-status-resolved-fg"
            : outcome.kind === "error"
              ? "bg-destructive-soft text-destructive"
              : outcome.kind === "confirm"
                ? "border border-status-in-progress/30 bg-status-in-progress-bg text-status-in-progress-fg"
                : "bg-surface-hover text-foreground",
        )}
      >
        <p className="flex items-start gap-2 whitespace-pre-line">
          {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
          <span>{message}</span>
        </p>

        {links.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {links.map((link) => (
              <li key={`${link.href}|${link.label}`}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2 text-foreground transition-colors hover:border-border-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{link.label}</span>
                    {link.detail ? (
                      <span className="block truncate text-[12.5px] text-muted-foreground">{link.detail}</span>
                    ) : null}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {outcome.kind === "confirm" && !turn.settled ? (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
            <Button type="button" variant="outline" size="sm" className="h-10" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={"pending" in outcome ? "default" : "destructive"}
              size="sm"
              className="h-10"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {"pending" in outcome ? outcome.confirmLabel : "Confirm remove"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
