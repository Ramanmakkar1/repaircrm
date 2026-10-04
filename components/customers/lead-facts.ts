import { leadAge } from "@/components/leads/lead-meta";

/** Sources are free text from forms ("website", "walk-in"): start them with a capital. */
export function sourceLabel(source: string | null | undefined): string | null {
  const text = source?.trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
}

/**
 * The (at most three) small facts on an enquiry card, in words: when it came
 * in, where it came from, and what it became. The status (New, Contacted,
 * Converted, Closed) is its own badge on the card, not one of these.
 */
export function leadFacts({
  source,
  customerId,
  ticketId,
  createdAt,
  now = new Date(),
  zone,
}: {
  source: string | null;
  customerId: string | null;
  ticketId: string | null;
  createdAt: Date;
  now?: Date;
  /** The shop's time zone: an old enquiry's date is the shop's calendar day. */
  zone?: string;
}): string[] {
  const facts = [`Received ${leadAge(createdAt, now, zone)}`];

  const from = sourceLabel(source);
  if (from) facts.push(from);

  if (customerId && ticketId) facts.push("Customer and repair");
  else if (customerId) facts.push("Is a customer");
  else if (ticketId) facts.push("Has a repair");

  return facts;
}
