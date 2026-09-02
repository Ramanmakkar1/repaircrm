/**
 * The webhook event catalogue.
 *
 * Pure — imported by the client card (checkboxes), the server actions that
 * validate a subscription, and lib/events.ts which emits them. One list, so a
 * shop can never subscribe to an event nothing sends.
 *
 * NAMES ARE A CONTRACT. An event name that has shipped is never renamed or
 * repurposed; a new fact gets a new name. Somebody's automation is switching on
 * these strings.
 */

export const WEBHOOK_EVENTS = [
  "ticket.created",
  "ticket.status_changed",
  "ticket.resolved",
  "customer.created",
  "invoice.created",
  "invoice.paid",
  "invoice.voided",
  "payment.recorded",
  "estimate.approved",
  "estimate.declined",
  "appointment.created",
  "lead.created",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Subscribes to everything, including events added after the hook was made. */
export const WILDCARD_EVENT = "*";

export const WEBHOOK_EVENT_LABEL: Record<string, string> = {
  "ticket.created": "Ticket created",
  "ticket.status_changed": "Ticket status changed",
  "ticket.resolved": "Ticket resolved",
  "customer.created": "Customer created",
  "invoice.created": "Invoice created",
  "invoice.paid": "Invoice paid in full",
  "invoice.voided": "Invoice voided",
  "payment.recorded": "Payment recorded",
  "estimate.approved": "Estimate approved",
  "estimate.declined": "Estimate declined",
  "appointment.created": "Appointment booked",
  "lead.created": "Lead captured",
};

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** The delivery states a `WebhookDelivery.status` can hold. */
export const DELIVERY_STATUSES = ["pending", "delivered", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Retry schedule, in minutes, indexed by the attempt that just failed.
 *
 * Five retries over roughly fifteen hours: long enough to ride out a deploy or
 * a provider outage, short enough that a delivery which is never going to work
 * stops burning a worker slot before the next day's traffic.
 */
export const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const;

export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1;
