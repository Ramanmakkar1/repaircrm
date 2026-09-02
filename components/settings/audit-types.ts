/**
 * Shapes for Settings → Audit log.
 *
 * Pure — shared by the client tab, the page loader and the server action.
 */

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  /** Serialised for the client; rendered in the expandable detail line. */
  meta: string | null;
  ip: string | null;
  createdAt: string;
  /** Null for an act with no signed-in user, e.g. a password reset link. */
  actorName: string | null;
};

export type AuditPage = {
  rows: AuditRow[];
  /** Id to pass back as `cursor` for the next page; null when the list ends. */
  nextCursor: string | null;
};

export type AuditFilters = {
  /** "" means every entity. */
  entity: string;
  /** "" means everyone. */
  userId: string;
};

/** The entity filter's options, in the order they matter to a shop owner. */
export const AUDIT_ENTITIES = [
  { value: "user", label: "People" },
  { value: "settings", label: "Settings" },
  { value: "api_key", label: "API keys" },
  { value: "invoice", label: "Invoices" },
  { value: "ticket", label: "Tickets" },
  { value: "customer", label: "Customers" },
] as const;

/** Plain-English names for the dotted verbs lib/audit.ts writes. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "user.login": "Signed in",
  "user.login_locked": "Sign-in locked",
  "user.logout": "Signed out",
  "user.password_changed": "Password changed",
  "user.password_reset": "Password reset",
  "user.2fa_enabled": "Two-step turned on",
  "user.2fa_disabled": "Two-step turned off",
  "user.2fa_reset": "Two-step reset",
  "user.google_linked": "Google account connected",
  "user.google_unlinked": "Google account disconnected",
  "user.google_refused": "Google sign-in refused",
  "user.signup_google": "Shop created with Google",
  "user.invited": "Invited",
  "user.role_changed": "Role changed",
  "user.deactivated": "Deactivated",
  "user.reactivated": "Reactivated",
  "settings.updated": "Settings saved",
  "api_key.created": "API key created",
  "api_key.revoked": "API key revoked",
  "ticket.deleted": "Ticket deleted",
  "customer.deleted": "Customer deleted",
  "invoice.voided": "Invoice voided",
  "invoice.refunded": "Invoice refunded",
};

/** Actions worth colouring red: someone lost access, or money moved back. */
const NOTABLE = new Set([
  "user.login_locked",
  "user.deactivated",
  "user.2fa_disabled",
  "user.2fa_reset",
  "user.google_unlinked",
  "user.google_refused",
  "api_key.revoked",
  "ticket.deleted",
  "customer.deleted",
  "invoice.voided",
  "invoice.refunded",
]);

export function isNotableAction(action: string): boolean {
  return NOTABLE.has(action);
}

export const AUDIT_PAGE_SIZE = 50;
