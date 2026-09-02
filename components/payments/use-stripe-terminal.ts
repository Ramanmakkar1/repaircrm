"use client";

import * as React from "react";

/**
 * Driving a card machine from the browser.
 *
 * WHAT THE BROWSER IS TRUSTED WITH: nothing. It holds a connection token, which
 * is short-lived and scoped to one reader session, and at the end it hands a
 * PaymentIntent id back to a Server Action that re-reads that intent from
 * Stripe before a cent is written down. Every amount comes from the server.
 *
 * THE SDK IS LOADED LAZILY. `js.stripe.com/terminal/v1/` is a third-party
 * script; injecting it into every page load so that a card machine *might* be
 * used at some point is how a register gets slow. It is fetched the first time
 * someone actually opens the card option, cached on `window` afterwards, and
 * never loaded at all for a shop that has no machine.
 *
 * THE EVERYDAY PATH IS: TAP CARD, PRESENT CARD, DONE
 * -------------------------------------------------
 * Which machine this till uses is remembered in the browser — per till, which
 * is exactly the right scope, because the machine on the front counter is a
 * property of the counter and not of the shop or of whoever is logged in. On
 * every later sale the hook reconnects to it before the cashier has finished
 * reading the amount, and no picker is shown at all.
 *
 * The picker appears in exactly two situations: more than one machine is on
 * the network and none is remembered, or the remembered one is not answering.
 * Both are real decisions somebody has to make. Everything else is noise.
 *
 * THE STEP MACHINE is the other half of the point. "Connecting…", "Present
 * card", "Approved" are the three things a cashier needs to see, and the
 * difference between them is what stops someone tapping a card at the wrong
 * moment.
 */

/** Overridable for development against scripts/dev/fake-stripe.mjs. */
const SDK_URL =
  process.env.NEXT_PUBLIC_STRIPE_TERMINAL_JS?.trim() ||
  "https://js.stripe.com/terminal/v1/";

/** Where this till's choice of machine lives. Browser-local, per device. */
const REMEMBERED_KEY = "repairflow.till.reader";

export type TerminalStep =
  | "idle"
  | "loading"
  | "connecting"
  | "choose"
  | "present"
  | "processing"
  | "recording"
  | "approved"
  | "error";

/** The human sentence for each step. One line, present tense, no jargon. */
export const TERMINAL_STEP_LABEL: Record<TerminalStep, string> = {
  idle: "Ready when you are.",
  loading: "Waking the card machine…",
  connecting: "Connecting to the card machine…",
  choose: "Which card machine?",
  present: "Present card…",
  processing: "Reading card…",
  recording: "Recording the payment…",
  approved: "Approved",
  error: "Something went wrong.",
};

// Stripe's SDK, narrowed to the calls this hook makes.
type Reader = {
  id: string;
  label?: string;
  status?: string;
  device_type?: string;
};
type TerminalSdk = {
  discoverReaders(options: {
    simulated: boolean;
  }): Promise<{ discoveredReaders?: Reader[]; error?: { message?: string } }>;
  connectReader(reader: Reader): Promise<{ error?: { message?: string } }>;
  collectPaymentMethod(clientSecret: string): Promise<{
    paymentIntent?: { id: string };
    error?: { message?: string };
  }>;
  processPayment(intent: { id: string }): Promise<{
    paymentIntent?: { id: string; status?: string };
    error?: { message?: string };
  }>;
};
type TerminalFactory = {
  create(config: {
    onFetchConnectionToken: () => Promise<string>;
    onUnexpectedReaderDisconnect: () => void;
  }): TerminalSdk;
};

declare global {
  interface Window {
    StripeTerminal?: TerminalFactory;
  }
}

let sdkPromise: Promise<TerminalFactory> | null = null;

/** Injects the script once per page and resolves with the global it defines. */
function loadSdk(): Promise<TerminalFactory> {
  if (window.StripeTerminal) return Promise.resolve(window.StripeTerminal);
  sdkPromise ??= new Promise<TerminalFactory>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.StripeTerminal) resolve(window.StripeTerminal);
      else reject(new Error("Stripe Terminal did not load."));
    };
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      sdkPromise = null;
      reject(new Error("Could not load Stripe Terminal."));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

async function fetchConnectionToken(): Promise<string> {
  const response = await fetch("/api/payments/terminal/connection-token", {
    method: "POST",
  });
  const payload = (await response.json().catch(() => null)) as {
    secret?: string;
    error?: string;
  } | null;
  if (!response.ok || !payload?.secret) {
    throw new Error(payload?.error ?? "Could not start a card machine session.");
  }
  return payload.secret;
}

/** localStorage is unavailable in a locked-down browser; that is not an error. */
function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED_KEY);
  } catch {
    return null;
  }
}

function remember(readerId: string): void {
  try {
    window.localStorage.setItem(REMEMBERED_KEY, readerId);
  } catch {
    // A till that cannot remember still works; it just asks every time.
  }
}

/** One machine on the network, as the picker lists it. */
export type ReaderChoice = {
  id: string;
  label: string;
  online: boolean;
  /** Stripe's software machine — approves everything, takes no money. */
  simulated: boolean;
};

export type CollectInput = {
  /**
   * Opens the payment on the server. Called only once a machine is connected,
   * so a shop with no machine never opens a payment it will have to cancel.
   */
  createIntent: () => Promise<
    | { ok: true; clientSecret: string | null; paymentIntentId: string }
    | { ok: false; error: string }
  >;
  /** Writes the payment down. Receives the id Stripe approved. */
  record: (
    paymentIntentId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export type UseStripeTerminal = {
  step: TerminalStep;
  /** The sentence to show. Either the step label or the reason it failed. */
  message: string;
  error: string | null;
  busy: boolean;
  readerLabel: string | null;
  /** Non-empty only while `step === "choose"`. */
  choices: ReaderChoice[];
  /**
   * Set when there is no machine to use at all — nothing on the network, or
   * the SDK would not load. The caller offers the payment link instead.
   */
  unavailable: string | null;
  /** Connects ahead of time so the everyday sale is one tap. */
  prepare: () => Promise<void>;
  /** Picks a specific machine from the picker and remembers it. */
  choose: (readerId: string) => Promise<void>;
  collect: (input: CollectInput) => Promise<boolean>;
  reset: () => void;
};

function toChoice(reader: Reader): ReaderChoice {
  const deviceType = reader.device_type ?? "";
  return {
    id: reader.id,
    label: reader.label ?? reader.id,
    online: (reader.status ?? "online") === "online",
    simulated: deviceType.startsWith("simulated"),
  };
}

/**
 * @param testMode a plain boolean from the server. It decides whether the SDK
 *   discovers SIMULATED machines — the only way to exercise this without
 *   hardware. Nothing about the Stripe key itself crosses to the client.
 */
export function useStripeTerminal(testMode: boolean): UseStripeTerminal {
  const [step, setStep] = React.useState<TerminalStep>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [readerLabel, setReaderLabel] = React.useState<string | null>(null);
  const [choices, setChoices] = React.useState<ReaderChoice[]>([]);
  const [unavailable, setUnavailable] = React.useState<string | null>(null);

  // The connected SDK instance survives across attempts: reconnecting for
  // every retry is several seconds a queue does not have.
  const sdkRef = React.useRef<TerminalSdk | null>(null);
  const connectedRef = React.useRef(false);
  const foundRef = React.useRef<Reader[]>([]);

  const reset = React.useCallback(() => {
    setStep("idle");
    setError(null);
  }, []);

  /** Loads the SDK once and hands back the instance. */
  const sdk = React.useCallback(async (): Promise<TerminalSdk> => {
    if (sdkRef.current) return sdkRef.current;
    setStep("loading");
    const factory = await loadSdk();
    const instance = factory.create({
      onFetchConnectionToken: fetchConnectionToken,
      onUnexpectedReaderDisconnect: () => {
        connectedRef.current = false;
        setReaderLabel(null);
      },
    });
    sdkRef.current = instance;
    return instance;
  }, []);

  const connectTo = React.useCallback(
    async (terminal: TerminalSdk, reader: Reader): Promise<void> => {
      setStep("connecting");
      const connected = await terminal.connectReader(reader);
      if (connected.error) throw new Error(connected.error.message);
      connectedRef.current = true;
      setChoices([]);
      setReaderLabel(reader.label ?? reader.id);
      remember(reader.id);
    },
    [],
  );

  /**
   * Gets to a connected machine, or throws with a sentence.
   *
   * Returns false when the answer is "ask the cashier which one" — the step is
   * left on "choose" and the picker takes over from here.
   */
  const ensureConnected = React.useCallback(async (): Promise<boolean> => {
    if (connectedRef.current) return true;

    const terminal = await sdk();
    setStep("connecting");
    const found = await terminal.discoverReaders({ simulated: testMode });
    if (found.error) throw new Error(found.error.message);

    const readers = found.discoveredReaders ?? [];
    foundRef.current = readers;

    // Only a machine that is actually answering is a candidate. Connecting to
    // one Stripe has already reported as offline just moves the failure to the
    // moment the customer is holding out their card.
    const answering = readers.filter(
      (reader) => (reader.status ?? "online") === "online",
    );
    if (answering.length === 0) {
      throw new Error(
        readers.length > 0
          ? "No card machine is answering. Check it is switched on and on the same wifi as this computer."
          : testMode
            ? "No practice machine was offered by Stripe."
            : "No card machine was found on this network. Check it is switched on and on the same wifi.",
      );
    }

    const rememberedId = readRemembered();
    const remembered = answering.find((reader) => reader.id === rememberedId);
    const only = answering.length === 1 ? answering[0] : null;
    const pick = remembered ?? only;

    if (!pick) {
      // Genuinely a decision: several machines are answering and the usual one
      // is not among them.
      setChoices(readers.map(toChoice));
      setStep("choose");
      return false;
    }

    await connectTo(terminal, pick);
    return true;
  }, [connectTo, sdk, testMode]);

  /** Connects in the background when the payment box opens. */
  const prepare = React.useCallback(async (): Promise<void> => {
    if (connectedRef.current) return;
    try {
      setUnavailable(null);
      const ready = await ensureConnected();
      if (ready) setStep("idle");
    } catch (thrown) {
      // Not an error state yet: nothing has been asked of the machine. The
      // caller offers the payment link instead, and the message says why.
      const message =
        thrown instanceof Error && thrown.message
          ? thrown.message
          : "No card machine is available.";
      setUnavailable(message);
      setStep("idle");
    }
  }, [ensureConnected]);

  const choose = React.useCallback(
    async (readerId: string): Promise<void> => {
      const reader = foundRef.current.find((entry) => entry.id === readerId);
      if (!reader) return;
      try {
        setError(null);
        const terminal = await sdk();
        await connectTo(terminal, reader);
        setStep("idle");
      } catch (thrown) {
        setStep("error");
        setError(
          thrown instanceof Error && thrown.message
            ? thrown.message
            : "That card machine would not connect.",
        );
      }
    },
    [connectTo, sdk],
  );

  const collect = React.useCallback(
    async ({ createIntent, record }: CollectInput): Promise<boolean> => {
      setError(null);

      try {
        const ready = await ensureConnected();
        // The picker is up; the cashier finishes by choosing, then presses
        // charge again. Not a failure, so no error state.
        if (!ready) return false;

        const terminal = sdkRef.current;
        if (!terminal) throw new Error("The card machine is not connected.");

        const intent = await createIntent();
        if (!intent.ok) throw new Error(intent.error);
        if (!intent.clientSecret) {
          throw new Error("Stripe did not return a payment to collect.");
        }

        setStep("present");
        const collected = await terminal.collectPaymentMethod(intent.clientSecret);
        if (collected.error) throw new Error(collected.error.message);
        if (!collected.paymentIntent) throw new Error("The card was not read.");

        setStep("processing");
        const processed = await terminal.processPayment(collected.paymentIntent);
        if (processed.error) throw new Error(processed.error.message);
        if (processed.paymentIntent?.status !== "succeeded") {
          throw new Error("The card was declined.");
        }

        // The id from Stripe's own response, not the one we asked for — they
        // are the same, and using theirs means the server verifies what the
        // machine actually charged.
        setStep("recording");
        const recorded = await record(processed.paymentIntent.id);
        if (!recorded.ok) throw new Error(recorded.error);

        setStep("approved");
        return true;
      } catch (thrown) {
        setStep("error");
        setError(
          thrown instanceof Error && thrown.message
            ? thrown.message
            : "The card machine could not take that payment.",
        );
        return false;
      }
    },
    [ensureConnected],
  );

  const busy =
    step === "loading" ||
    step === "connecting" ||
    step === "present" ||
    step === "processing" ||
    step === "recording";

  return {
    step,
    message: error ?? TERMINAL_STEP_LABEL[step],
    error,
    busy,
    readerLabel,
    choices,
    unavailable,
    prepare,
    choose,
    collect,
    reset,
  };
}
