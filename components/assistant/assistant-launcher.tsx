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
import { prefersFinePointer } from "@/components/ui/auto-focus";
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
import { assistantSuggestions } from "@/app/(app)/assistant/suggestions";
import { commandSuggestions, type CommandSuggestion } from "@/lib/ai/quick-commands";
import { OPEN_SHOP_ASSISTANT, type OpenShopAssistantDetail } from "./assistant-events";

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
  // At the register the button sits above the pinned total and pay buttons.
  const atRegister = pathname === "/pos";
  // The wide "Ask anything" bar lives only on Home and its hub screens, where
  // there is room for it. Everywhere else it is one round button in the
  // corner, so it never sits on a total, a Save button or the last row.
  const roomy = pathname === "/counter" || pathname.startsWith("/counter/");
  const busy = useBusyScreen();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [continuation, setContinuation] = React.useState<string | null>(null);
  const [hint, setHint] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const nextId = React.useRef(1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const titleRef = React.useRef<HTMLElement>(null);
  const voiceButtonRef = React.useRef<HTMLButtonElement>(null);
  const launchButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const openedWithVoice = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const busyRef = React.useRef(false);
  const [matches, setMatches] = React.useState<{ input: string; rows: CommandSuggestion[] }>({ input: "", rows: [] });
  const [voiceMode, setVoiceMode] = React.useState<"live" | "cloud">("live");
  const [voiceLanguage, setVoiceLanguage] = React.useState("en-CA");
  const suggestions = continuation || !input.trim() ? [] : [
    ...(matches.input === input ? matches.rows : []), ...commandSuggestions(input, showMoney),
  ].slice(0, 4);

  React.useEffect(() => {
    if (!open || pending || continuation || !/^(?:find|search|look up|show) (?:customers?|parts?|products?|repair|ticket) .{2}/i.test(input)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void assistantSuggestions(input).then(rows => { if (!cancelled) setMatches({ input, rows }); }).catch(() => undefined);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, input, pending, continuation]);

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
      if (!answer || !enabled || pending || busyRef.current) return;
      busyRef.current = true;
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
        busyRef.current = false;
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
    { cloud, preferLive: voiceMode === "live", language: voiceLanguage },
  );
  const { supported: dictationSupported, start: startDictation } = dictation;

  React.useEffect(() => {
    function handleLaunch(event: Event) {
      const detail = (event as CustomEvent<OpenShopAssistantDetail>).detail ?? {};
      launchButtonRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
      openedWithVoice.current = Boolean(detail.voice && enabled && dictationSupported);
      if (detail.prompt) {
        setInput(detail.prompt);
        setHint("Ready to send — you can edit this first.");
      }
      setOpen(true);
      if (openedWithVoice.current) startDictation();
    }
    window.addEventListener(OPEN_SHOP_ASSISTANT, handleLaunch);
    return () => window.removeEventListener(OPEN_SHOP_ASSISTANT, handleLaunch);
  }, [enabled, dictationSupported, startDictation]);

  function settle(id: number) {
    setTurns((current) =>
      current.map((turn) => (turn.id === id && turn.from === "assistant" ? { ...turn, settled: true } : turn)),
    );
  }

  function confirm(turn: AssistantTurn) {
    const outcome = turn.outcome;
    if (outcome.kind !== "confirm" || busyRef.current || turn.settled) return;
    busyRef.current = true;
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
      busyRef.current = false;
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
    ? dictation.engine === "browser" ? "Words appear as you speak. Pause or tap stop, then review and send." : "Recording… Your words will appear after you pause or tap stop."
    : transcribing
      ? "Writing down what you said…"
      : hint
        ? hint
        : !dictation.supported
          ? "Voice isn't available in this browser — typing works just the same."
          : dictation.engine === "cloud"
            ? "Speak English, Hindi, Punjabi, Chinese or Filipino. Review before sending."
            : "Live voice: see your words as you speak. Review before sending.";

  return (
    <>
      {collapsed || !roomy || busy ? (
        <button
          type="button"
          onClick={(event) => launch(event, false)}
          aria-label="Ask: type or talk to the shop assistant"
          title="Ask"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "rf-assistant-talk fixed right-[max(1rem,env(safe-area-inset-right))] z-30 hidden size-14 sm:flex items-center justify-center rounded-full shadow-lg hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden",
            // The register pins its total and pay buttons to the bottom edge.
            atRegister
              ? "bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))]"
              : "bottom-[max(1rem,env(safe-area-inset-bottom))]",
          )}
        >
          <AudioLines className="size-6" aria-hidden />
        </button>
      ) : (
        <div
          role="group"
          aria-label="Ask the shop assistant"
          className="rf-assistant-dock fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 hidden w-[calc(100%-2rem)] sm:flex max-w-[420px] items-center gap-1.5 rounded-full bg-surface p-2 sm:gap-2 print:hidden"
        >
          {/* No aria-label: the words on the button are its name, so what a person sees is what a screen reader says. */}
          <button
            type="button"
            onClick={(event) => launch(event, false)}
            title="Type a question"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="rf-assistant-prompt flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full pl-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RepairPilotMark className="size-10 shrink-0 rounded-full" />
            <span className="truncate text-base font-medium">Ask anything</span>
          </button>
          <button
            type="button"
            onClick={() => setDock(true)}
            aria-label="Make Ask smaller"
            title="Make it a round button. It stays one tap away."
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={(event) => launch(event, true)}
            title="Talk: ask out loud"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="rf-assistant-talk flex h-12 shrink-0 items-center gap-2 rounded-full px-5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <AudioLines className="size-5" aria-hidden />
            <span className="text-base font-semibold">Talk</span>
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex max-h-[min(88dvh,760px)] max-w-xl flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (openedWithVoice.current) voiceButtonRef.current?.focus();
            // A finger gets the starter boxes first: focusing the field would open the
            // on-screen keyboard over them. A prefilled request still goes to the field.
            else if (prefersFinePointer() || input.trim()) inputRef.current?.focus();
            else titleRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launchButtonRef.current?.focus();
          }}
        >
          <header ref={titleRef} tabIndex={-1} className="rf-assistant-hero flex items-center gap-3.5 px-5 py-5 pr-14 outline-none sm:px-6">
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
            {suggestions.length > 0 && !pending && dictation.state === "idle" ? (
              <div aria-label="Suggested requests" className="mb-3 grid gap-1">
                {suggestions.map((suggestion, index) => <button key={`${suggestion.command}-${index}`} type="button"
                  className="flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => { setInput(suggestion.command); setHint("Ready to send — you can edit this first."); inputRef.current?.focus(); }}>
                  <span className="truncate font-medium">{suggestion.label}</span><span className="shrink-0 text-xs text-muted-foreground">{suggestion.detail}</span>
                </button>)}
              </div>
            ) : null}
            {listening ? <div role="status" className="mb-3 flex items-center gap-3 text-sm">
              <span className="size-2 rounded-full bg-destructive" /><span>Listening · {dictation.seconds}s</span>
              {dictation.engine === "cloud" ? <meter aria-label="Microphone level" min={0} max={1} value={dictation.level} className="h-2 min-w-0 flex-1" /> : <span className="flex-1" />}
              <button type="button" className="min-h-12 px-2 font-semibold underline" onClick={dictation.cancel}>Cancel</button>
            </div> : null}
            {listening && dictation.engine === "browser" ? <p aria-label="Live transcript" className="mb-3 max-h-32 overflow-y-auto rounded-lg bg-surface px-3 py-2 text-base">{dictation.transcript || "Start speaking…"}</p> : null}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                value={listening && dictation.engine === "browser" ? dictation.transcript : input}
                aria-label="Message to the assistant"
                enterKeyHint="send"
                maxLength={1500}
                onChange={(event) => setInput(event.target.value)}
                placeholder={continuation ? "Your answer…" : "Ask or tell me anything about the shop…"}
                disabled={pending || !enabled || listening || transcribing}
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
                  "flex size-13 shrink-0 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40",
                  listening ? "rf-assistant-listening bg-destructive text-destructive-foreground" : "rf-assistant-talk hover:brightness-110",
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
                  className="min-h-12 shrink-0 font-semibold underline underline-offset-2 hover:text-foreground"
                >
                  Show the Ask bar on Home
                </button>
              ) : null}
            </div>
            {dictation.browserSupported ? <details className="mt-1">
            <summary className="flex min-h-12 cursor-pointer items-center text-xs font-medium text-muted-foreground">Voice settings</summary>
            {cloud ? <label className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">Voice engine
              <select aria-label="Voice engine" value={voiceMode} disabled={listening || transcribing || pending} onChange={event => { dictation.cancel(); setVoiceMode(event.target.value as "live" | "cloud"); }} className="rounded border border-border bg-background px-2 py-1 text-foreground">
                <option value="live">Live words · browser</option><option value="cloud">Cloud · transcribe after recording</option>
              </select>
            </label> : null}
            {dictation.engine === "browser" ? <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">Spoken language
              <select aria-label="Spoken language" value={voiceLanguage} disabled={listening || transcribing || pending} onChange={event => setVoiceLanguage(event.target.value)} className="rounded border border-border bg-background px-2 py-1 text-foreground">
                <option value="en-CA">English</option><option value="hi-IN">हिन्दी · Hindi</option><option value="pa-IN">ਪੰਜਾਬੀ · Punjabi</option><option value="zh-CN">普通话 · Mandarin Chinese</option><option value="zh-HK">廣東話 · Cantonese</option><option value="fil-PH">Filipino / Tagalog</option>
              </select>
            </label> : null}
            </details> : null}
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
            <Button type="button" variant="outline" size="lg" className="min-h-12" disabled={pending} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={"pending" in outcome ? "default" : "destructive"}
              size="lg"
              className="min-h-12"
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

// ---------------------------------------------------------------------------

/** A field someone is typing in: the on-screen keyboard is (or is about to be) up. */
function isTypingField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "hidden"].includes(target.type);
}

/**
 * True while a dialog, sheet or menu is open, or someone is typing in a field:
 * the moments the wide Ask bar would sit on the thing the person is doing, so
 * it steps back to the round button until they finish.
 */
export function useBusyScreen(): boolean {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [typing, setTyping] = React.useState(false);

  React.useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setDialogOpen(Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')));
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    check();
    const onFocusIn = (event: FocusEvent) => setTyping(isTypingField(event.target));
    const onFocusOut = () => setTyping(false);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return dialogOpen || typing;
}
