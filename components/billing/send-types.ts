/**
 * SHAPES FOR THE DOCUMENT SEND SYSTEM.
 *
 * Plain types and pure functions only — no `"use server"`, no `db`, no React.
 * Both halves import from here: the Server Actions in
 * app/(app)/invoices|estimates/actions.ts, and the client dialog in
 * ./send-dialog.tsx. A `"use server"` module may only export async functions,
 * which is exactly why these cannot live next to the actions that return them.
 */

export type SendChannel = "EMAIL" | "SMS";

/** What the dialog posts. One shape for invoices and estimates alike. */
export type SendRequest = {
  id: string;
  /** Subject line as edited by staff. Ignored for SMS. */
  subject: string;
  /** The personal message prepended above the document summary. */
  message: string;
  email: boolean;
  sms: boolean;
  /**
   * Override for the destination address, typed into the dialog. Blank means
   * "use whatever is on the customer record" — the server resolves it, so a
   * stale page cannot pin a send to an address that has since been corrected.
   */
  emailTo?: string;
};

/**
 * What actually happened on ONE channel.
 *
 * `status` is the raw `CommunicationLog.status` written by lib/comms — "sent",
 * "logged", "skipped: opted out", "skipped: no address", "failed: …". It is
 * carried through rather than flattened to a boolean because the UI has to be
 * able to say WHY, and "we couldn't send that" is not an answer a front desk
 * can act on.
 */
export type SendChannelOutcome = {
  channel: SendChannel;
  ok: boolean;
  to: string;
  status: string;
  /** A finished sentence for the toast. */
  message: string;
};

export type SendResultState =
  | { ok: false; error: string }
  | {
      ok: true;
      outcomes: SendChannelOutcome[];
      /** True when this send moved the document from DRAFT to SENT. */
      statusChanged: boolean;
      /** The document's status after the send. */
      status: string;
    };

/** Everything the preview pane renders. Produced by the REAL renderers. */
export type SendPreview = {
  subject: string;
  /** Exactly the HTML the provider is handed. Rendered in a sandboxed frame. */
  emailHtml: string;
  /** The plain-text alternative part of the same email. */
  emailText: string;
  /** The full SMS as it leaves the building — shop name and link included. */
  smsText: string;
  /** The customer-facing link both channels point at. */
  linkUrl: string;
  /** True when the email will carry a "pay online" call to action. */
  payOnline: boolean;
};

export type SendPreviewState =
  | { ok: false; error: string }
  | { ok: true; preview: SendPreview };

/** Static facts the dialog needs, computed on the server that renders it. */
export type SendDocument = {
  id: string;
  kind: "invoice" | "estimate";
  /** "Invoice #12" — used in headings and toasts. */
  label: string;
  customerName: string;
  defaultSubject: string;
  defaultMessage: string;
  email: string | null;
  emailOptIn: boolean;
  mobile: string | null;
  smsOptIn: boolean;
  /** True once the document has left DRAFT — flips the button to "Send again". */
  alreadySent: boolean;
  /** "Last sent 2 hours ago by email", or null when it never has been. */
  lastSentHint: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers, shared by the server (building outcomes) and the client
// ---------------------------------------------------------------------------

/**
 * Why a channel cannot be used, as a sentence to show inline. `null` means the
 * channel is available.
 *
 * NO DEAD BUTTONS: every disabled checkbox in the dialog renders one of these
 * next to it. "Opted out" is stated plainly rather than hidden — a customer who
 * asked not to be texted is a fact staff need to see, not an error.
 */
export function channelBlockedReason(
  channel: SendChannel,
  doc: Pick<SendDocument, "email" | "emailOptIn" | "mobile" | "smsOptIn">,
): string | null {
  if (channel === "EMAIL") {
    if (!doc.email?.trim()) return "No email address on this customer.";
    if (!doc.emailOptIn) return "This customer has opted out of email.";
    return null;
  }
  if (!doc.mobile?.trim()) return "No mobile number on this customer.";
  if (!doc.smsOptIn) return "This customer has opted out of SMS.";
  return null;
}

/** "Email" / "SMS", for sentences. */
export function channelLabel(channel: SendChannel): string {
  return channel === "EMAIL" ? "Email" : "SMS";
}

/**
 * Turns a raw lib/comms status into the sentence the toast shows.
 *
 * The log driver's "logged" is reported honestly as "printed to the server log"
 * rather than dressed up as "sent" — on a laptop nothing left the building, and
 * a developer who believes it did will spend an afternoon looking in an inbox.
 */
export function describeOutcome(
  channel: SendChannel,
  to: string,
  status: string,
): { ok: boolean; message: string } {
  const what = channelLabel(channel);

  if (status === "sent") {
    return { ok: true, message: `${what} sent to ${to}` };
  }
  if (status === "logged") {
    return {
      ok: true,
      message: `${what} for ${to} written to the server log — no provider is configured`,
    };
  }
  if (status === "skipped: opted out") {
    return { ok: false, message: `${what} skipped — customer has opted out` };
  }
  if (status === "skipped: no address") {
    return {
      ok: false,
      message:
        channel === "EMAIL"
          ? "Email skipped — no address on file"
          : "SMS skipped — no mobile number on file",
    };
  }
  if (status.startsWith("failed:")) {
    return {
      ok: false,
      message: `${what} failed — ${status.slice("failed:".length).trim()}`,
    };
  }
  return { ok: false, message: `${what}: ${status}` };
}

/** "2 hours ago", "just now" — for the "last sent" hint under the button. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 90) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

/**
 * GSM-7 segment arithmetic, near enough for a warning label.
 *
 * A message that fits in 160 characters is one billable segment; past that,
 * carriers concatenate and each part carries a 7-character header, so the
 * budget per segment drops to 153. Staff are shown the count so a chatty
 * message is a decision rather than a surprise on the phone bill.
 */
export function smsSegments(length: number): number {
  if (length === 0) return 0;
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}
