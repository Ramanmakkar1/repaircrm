/**
 * The words a CUSTOMER reads: the portal, the check-in desk and the shop page.
 *
 * Staff see the shop's own workflow ("In Progress", "Waiting on Customer",
 * "Sent", "Converted"). A customer standing in a hallway with a phone wants the
 * answer to one question ("where is my phone, and do I need to do anything?"),
 * so every customer page asks this file for its status words instead of
 * printing the stored value.
 *
 * Display only, and pure: no `db`, no `next/*`, no React. Money is never
 * computed here; callers pass the totals they already have (lib/money.ts).
 *
 * TIME. The server runs in UTC and the shop does not. Every "today", every day
 * boundary and every clock time below is read in the shop's own zone
 * (`Shop.timezone`), through the same helpers Shop overview uses.
 */

import type { StatusTone } from "@/components/ui/badge";
import { addressLine, mapLink, readPublicHub } from "@/components/settings/hub-meta";
import { dayKeyIn, safeTimeZone } from "@/lib/dashboard/zone";
import { deviceImageSource } from "@/lib/inventory/product-images";

// ---------------------------------------------------------------------------
// Repairs
// ---------------------------------------------------------------------------

/** The four stages a customer is shown. Always four, so the tracker fits a 320px phone. */
export const REPAIR_STAGES = ["Received", "Fixing", "Ready", "Done"] as const;
export type RepairStage = 0 | 1 | 2 | 3;

export type RepairWords = {
  /** Which of the four stages is current; null for a closed or cancelled repair. */
  stage: RepairStage | null;
  /** The short status word for a badge: "Ready to collect". */
  label: string;
  /** One sentence for the top of the repair page. */
  headline: string;
  /** What happens next, in plain words. */
  next: string;
  tone: StatusTone;
  /** The shop is waiting on the customer (an answer, a reply). */
  needsYou: boolean;
};

const has = (text: string, pattern: RegExp) => pattern.test(text);

/**
 * The shop's status, as the customer should read it. Works on the default
 * workflow and on a shop's own status names (matched by the words in them), so
 * a renamed or added status still lands on a sensible stage.
 *
 * `device` is the customer's word for the device ("iPhone 14 Pro"); without it
 * the sentences say "your device".
 */
export function repairWords(status: string, device?: string | null): RepairWords {
  const text = status.trim().toLowerCase();
  const it = device?.trim() ? `your ${device.trim()}` : "your device";

  if (has(text, /cancel|abandon|declin|unrepairable|not repaired|no fix|scrapped|void/)) {
    return {
      stage: null,
      label: "Closed",
      headline: "This repair is closed",
      next: "Call or message the shop if you have a question about it.",
      tone: "neutral",
      needsYou: false,
    };
  }
  if (has(text, /ready|for pick ?up|to collect|awaiting pick/)) {
    return {
      stage: 2,
      label: "Ready to collect",
      headline: `${capital(it)} is ready to collect`,
      next: "Come by the shop to pick it up. Bring this page or your repair number.",
      tone: "ready",
      needsYou: true,
    };
  }
  if (has(text, /picked|collected|resolv|complet|closed|done|deliver|finish|returned/)) {
    return {
      stage: 3,
      label: "Done",
      headline: "All done",
      next: "Thanks for choosing us. Something not right? Send the shop a message below.",
      tone: "success",
      needsYou: false,
    };
  }
  if (has(text, /customer|approv|authori|your|response|answer|reply|quote|estimate/)) {
    return {
      stage: 1,
      label: "Waiting for your answer",
      headline: "We need your answer",
      next: "Read the latest message from the shop and reply below, or give them a call.",
      tone: "waiting",
      needsYou: true,
    };
  }
  if (has(text, /part|order|supplier|ship|backorder/)) {
    return {
      stage: 1,
      label: "Waiting for a part",
      headline: "We are waiting for a part",
      next: `We have ordered what ${it} needs and will carry on as soon as it arrives.`,
      tone: "waiting",
      needsYou: false,
    };
  }
  if (has(text, /^new$|received|checked|booked|queue|intake|created|open|drop/)) {
    return {
      stage: 0,
      label: "Received",
      headline: `We have ${it}`,
      next: "A technician will look at it soon. Every update appears on this page.",
      tone: "info",
      needsYou: false,
    };
  }
  // In Progress, and any status of the shop's own we cannot read: mid-repair.
  return {
    stage: 1,
    label: "We are fixing it",
    headline: `We are working on ${it}`,
    next: "We will post an update here as soon as there is news.",
    tone: "active",
    needsYou: false,
  };
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The family picture for a device (a phone, a laptop, a console), the toolbox when nothing fits. */
export function devicePicture(asset: { type?: string | null; make?: string | null; model?: string | null } | null | undefined): string {
  const words = asset ? [asset.type, asset.make, asset.model].filter(Boolean).join(" ") : "";
  return (words && deviceImageSource(words)?.src) || "/images/products/repair-tools.webp";
}

/** "Apple iPhone 14 Pro", else the kind ("Laptop"), else null. */
export function deviceName(asset: { type?: string | null; make?: string | null; model?: string | null } | null | undefined): string | null {
  if (!asset) return null;
  const named = [asset.make, asset.model].map((part) => part?.trim()).filter(Boolean).join(" ");
  return named || asset.type?.trim() || null;
}

// ---------------------------------------------------------------------------
// Dates, in the shop's zone
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/**
 * The calendar day a due date means. A date picked in a form is stored as UTC
 * midnight of that day (components/billing/format fromDateInputValue), so its
 * UTC date IS the day. Any other instant (an import, the API) is read on the
 * shop's wall calendar.
 */
export function dueDayKey(due: Date, zone: string): string {
  const iso = due.toISOString();
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : dayKeyIn(due.getTime(), zone);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 6", or "Oct 6, 2027" when it is not this year (both `yyyy-mm-dd`). */
export function dayLabel(key: string, todayKey: string): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  return key.slice(0, 4) === todayKey.slice(0, 4) ? MONTH_DAY.format(date) : MONTH_DAY_YEAR.format(date);
}

function keyPlus(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export type DueState = "overdue" | "today" | "tomorrow" | "later";

/**
 * A deadline's calendar day against the shop's today: its state and the day in
 * words ("today", "tomorrow", "Oct 6").
 */
export function deadline(date: Date, nowMs: number, zone: string): { state: DueState; day: string } {
  const tz = safeTimeZone(zone);
  const today = dayKeyIn(nowMs, tz);
  const key = dueDayKey(date, tz);
  if (key < today) return { state: "overdue", day: dayLabel(key, today) };
  if (key === today) return { state: "today", day: "today" };
  if (key === keyPlus(today, 1)) return { state: "tomorrow", day: "tomorrow" };
  return { state: "later", day: dayLabel(key, today) };
}

/** "Due today", "Due tomorrow", "Due Oct 6", or "Was due Oct 1" (overdue). */
export function dueWords(due: Date, nowMs: number, zone: string): { state: DueState; text: string } {
  const { state, day } = deadline(due, nowMs, zone);
  return { state, text: state === "overdue" ? `Was due ${day}` : `Due ${day}` };
}

/**
 * When something happened, for a person: "Today, 4:15 PM", "Yesterday, 9:02 AM",
 * "Sep 23, 2:30 PM" (the year only when it is not this year). In the shop's zone.
 */
export function whenWords(at: Date, nowMs: number, zone: string): string {
  const tz = safeTimeZone(zone);
  const today = dayKeyIn(nowMs, tz);
  const key = dayKeyIn(at.getTime(), tz);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
  if (key === today) return `Today, ${time}`;
  if (key === keyPlus(today, -1)) return `Yesterday, ${time}`;
  return `${dayLabel(key, today)}, ${time}`;
}

/** "Sep 23" / "Sep 23, 2025": the shop's calendar day of an instant. */
export function dayWords(at: Date, nowMs: number, zone: string): string {
  const tz = safeTimeZone(zone);
  return dayLabel(dayKeyIn(at.getTime(), tz), dayKeyIn(nowMs, tz));
}

// ---------------------------------------------------------------------------
// Invoices and estimates
// ---------------------------------------------------------------------------

export type DocWords = { label: string; tone: StatusTone };

/**
 * An invoice's badge, from what is OWED rather than from the stored status: a
 * bill that is paid in full reads "Paid" even when its stored status still
 * says SENT, so a customer never sees "Sent" next to "Paid in full".
 */
export function invoiceWords(input: {
  status: string;
  totalCents: number;
  paidCents: number;
  dueDate: Date | null;
  nowMs: number;
  zone: string;
}): DocWords {
  if (input.status === "VOID") return { label: "Cancelled", tone: "neutral" };
  if (input.totalCents <= 0) return { label: "Nothing to pay", tone: "success" };
  const balance = input.totalCents - input.paidCents;
  if (balance <= 0) return { label: "Paid", tone: "success" };
  if (input.dueDate) {
    const due = dueWords(input.dueDate, input.nowMs, input.zone);
    if (due.state === "overdue") return { label: "Overdue", tone: "danger" };
    return { label: due.text, tone: due.state === "later" ? "info" : "active" };
  }
  return input.paidCents > 0 ? { label: "Part paid", tone: "active" } : { label: "To pay", tone: "info" };
}

/** An estimate's badge. A sent one is the shop waiting on the customer. */
export function estimateWords(status: string): DocWords {
  switch (status) {
    case "SENT":
      return { label: "Waiting for your answer", tone: "waiting" };
    case "APPROVED":
      return { label: "You said yes", tone: "success" };
    case "CONVERTED":
      return { label: "Approved", tone: "success" };
    case "DECLINED":
      return { label: "You said no", tone: "neutral" };
    default:
      return { label: "Being prepared", tone: "neutral" };
  }
}

/**
 * A few customer words under a problem box, so "Diagnostic" or "Board Repair"
 * still makes sense to someone who is not a technician. "" when the name says
 * it already.
 */
export function problemHint(label: string): string {
  const text = label.toLowerCase();
  if (/other/.test(text)) return "Something else";
  if (/diagnos|inspect|not sure/.test(text)) return "Not sure what is wrong";
  if (/screen|display|lcd|crack/.test(text)) return "Cracked, black or not responding";
  if (/batter/.test(text)) return "Dies fast or is swollen";
  if (/charg/.test(text)) return "Will not charge";
  if (/water|liquid|wet|spill/.test(text)) return "Got wet";
  if (/virus|software|slow/.test(text)) return "Slow, pop-ups or errors";
  if (/data|recover|backup/.test(text)) return "Get my photos and files back";
  if (/board|hardware|chip/.test(text)) return "Inside parts";
  if (/no power|won.?t turn|dead|power/.test(text)) return "Will not turn on";
  if (/overheat|fan/.test(text)) return "Gets too hot";
  if (/hdmi|no picture|picture/.test(text)) return "No picture on the screen";
  return "";
}

/**
 * The words for a dead document link (/portal/i/<token>, /portal/e/<token>):
 * about THAT document, never the generic sign-in error. "the shop" is swapped
 * for the shop's name when the page knows it.
 */
export function linkExpiredWords(doc: string): { title: string; body: string; picture: string } {
  if (doc === "invoice") {
    return {
      title: "This payment link has expired",
      body: "Ask the shop for a new one, or sign in with your email to see and pay your bills.",
      picture: "/images/home/card-terminal.webp",
    };
  }
  if (doc === "estimate") {
    return {
      title: "This estimate link has expired",
      body: "Ask the shop to send the estimate again, or sign in with your email to see it.",
      picture: "/images/home/price-tag.webp",
    };
  }
  return {
    title: "This link has expired",
    body: "Ask the shop for a new one, or sign in with your email to see your repairs.",
    picture: "/images/home/pickup-bag.webp",
  };
}

/** At most `limit` problem boxes for a customer, and "Other" (always last) is never the one cut. */
export function fewProblems(options: readonly string[], limit = 12): string[] {
  return options.length > limit ? [...options.slice(0, limit - 1), options[options.length - 1]] : [...options];
}

/** "1 item" / "3 items". */
export function itemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

// ---------------------------------------------------------------------------
// Shop contact
// ---------------------------------------------------------------------------

/** What every customer page shows about the shop: who, how to call, where, when. */
export type PublicShop = {
  name: string;
  phone: string | null;
  logoUrl: string | null;
  /** One line ("1420 E 6th Street · Austin, TX · 78702"), or "" when not filled in. */
  address: string;
  /** A maps link for the address, or "" without one. */
  mapUrl: string;
  /** Opening hours as lines (Settings, Connect, shop page), possibly none. */
  hours: string[];
  /** The shop's own zone, for every date and "today" on the page. */
  timezone: string;
};

/** The fields `publicShop` reads; select exactly these. */
export const PUBLIC_SHOP_SELECT = {
  name: true,
  phone: true,
  logoUrl: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  postalCode: true,
  timezone: true,
  settings: true,
} as const;

export function publicShop(row: {
  name: string;
  phone?: string | null;
  logoUrl?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  timezone?: string | null;
  settings?: unknown;
}): PublicShop {
  const address = addressLine(row);
  return {
    name: row.name,
    phone: row.phone?.trim() || null,
    logoUrl: row.logoUrl?.trim() || null,
    address,
    mapUrl: address ? mapLink(`${row.name}, ${address}`) : "",
    hours: hoursLines(readPublicHub(row.settings).hours),
    timezone: safeTimeZone(row.timezone),
  };
}

/** `tel:` link for a phone number as typed ("(512) 555-0142" becomes tel:5125550142). */
export function telHref(phone: string): string {
  const digits = phone.trim().replace(/(?!^\+)[^\d]/g, "");
  return `tel:${digits}`;
}

/** Opening hours as lines, blank lines dropped. Free text in Settings, one line per day. */
export function hoursLines(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
}

/** Up to two letters for a shop with no logo: "Demo Repair Shop" is "DR". */
export function shopInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  const letters = words.slice(0, 2).map((word) => [...word][0] ?? "");
  return letters.join("").toUpperCase() || "?";
}
