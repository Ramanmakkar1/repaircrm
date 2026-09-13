/**
 * Shared vocabulary for the accounting integrations.
 *
 * Pure — imported by the sync engine (server), the server actions and the
 * Integrations settings tab (client), so this file must stay free of `db`,
 * `next/*` and "use server".
 */

import type { ProviderName } from "./config";

export type { ProviderName };

/** The four things RepairPilot pushes, in the order it pushes them. */
export const SYNC_ENTITIES = [
  "customer",
  "product",
  "invoice",
  "payment",
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const ENTITY_LABEL: Record<SyncEntity, string> = {
  customer: "Customers",
  product: "Products & services",
  invoice: "Invoices",
  payment: "Payments",
};

/** Per-entity outcome of one pass. */
export type EntityResult = {
  /** Rows created in the provider for the first time. */
  created: number;
  /** Rows that already existed there and were brought up to date. */
  updated: number;
  /** Rows examined and deliberately left alone (nothing changed). */
  skipped: number;
  /** Rows that failed; the reason is in `errors`. */
  failed: number;
};

export function emptyEntityResult(): EntityResult {
  return { created: 0, updated: 0, skipped: 0, failed: 0 };
}

export type SyncResult = {
  provider: ProviderName;
  /** ISO 8601 UTC — the watermark this pass ran against. */
  ranAt: string;
  ms: number;
  entities: Record<SyncEntity, EntityResult>;
  /** One line per failed row, already prefixed with what it was. */
  errors: string[];
  /**
   * Set when the pass stopped early rather than finishing:
   *
   *   rate-limited   the provider answered 429; the run is rescheduled and the
   *                  watermark is NOT advanced, so nothing is skipped.
   *   auth           the tokens are dead; the connection is marked "error".
   *   not-connected  there is nothing to sync against.
   */
  stopped?: "rate-limited" | "auth" | "not-connected";
  /** ISO 8601 — when a rate-limited run may be tried again. */
  retryAfter?: string;
};

export function emptySyncResult(provider: ProviderName): SyncResult {
  return {
    provider,
    ranAt: new Date().toISOString(),
    ms: 0,
    entities: {
      customer: emptyEntityResult(),
      product: emptyEntityResult(),
      invoice: emptyEntityResult(),
      payment: emptyEntityResult(),
    },
    errors: [],
  };
}

/** Rows written per entity per pass. Keeps one shop from monopolising a run. */
export const MAX_ROWS_PER_ENTITY = 200;

export function totalPushed(result: SyncResult): number {
  return SYNC_ENTITIES.reduce(
    (sum, entity) =>
      sum + result.entities[entity].created + result.entities[entity].updated,
    0,
  );
}

export function totalFailed(result: SyncResult): number {
  return SYNC_ENTITIES.reduce(
    (sum, entity) => sum + result.entities[entity].failed,
    0,
  );
}

/** The one-line form used in the settings card and the automation log. */
export function syncLine(result: SyncResult): string {
  if (result.stopped === "not-connected") return "not connected";
  if (result.stopped === "auth") return "reconnect required";
  const parts = SYNC_ENTITIES.filter(
    (entity) =>
      result.entities[entity].created > 0 || result.entities[entity].updated > 0,
  ).map(
    (entity) =>
      `${result.entities[entity].created + result.entities[entity].updated} ${entity}${
        result.entities[entity].created + result.entities[entity].updated === 1
          ? ""
          : "s"
      }`,
  );
  const body = parts.length > 0 ? parts.join(", ") : "nothing new";
  const failed = totalFailed(result);
  const tail = failed > 0 ? `, ${failed} failed` : "";
  const limited = result.stopped === "rate-limited" ? ", rate limited" : "";
  return `${body}${tail}${limited} (${result.ms}ms)`;
}

/**
 * What lives in `IntegrationConnection.settings`.
 *
 * Everything here is provider bookkeeping or an operator preference — never a
 * token. Tokens have their own columns and never leave the server.
 */
export type ConnectionSettings = {
  /** QuickBooks: the Income account every Item is booked against. */
  qboIncomeAccountRef?: { value: string; name: string };
  /** QuickBooks: the Item invoice lines fall back to when they sell no product. */
  qboServiceItemRef?: { value: string; name: string };
  /** Xero: sales account code for invoice lines. Editable; default "200". */
  xeroSalesAccountCode?: string;
  /** Xero: bank account code payments are banked into. Default "090". */
  xeroBankAccountCode?: string;
  /** Xero: the tenants this grant covers, kept for the picker. */
  xeroTenants?: { tenantId: string; tenantName: string }[];
  /** The last pass, so the card survives a restart. */
  lastSummary?: SyncResult;
  /** Set by a 429; passes decline to start until this instant. */
  retryAfter?: string;
};

/**
 * Connection status.
 *
 *   connected     tokens are good, syncing runs
 *   pending       Xero only — the grant covers several organisations and the
 *                 operator has not picked one yet, so nothing may be written
 *   error         the provider rejected the tokens; `lastError` says how
 *   disconnected  revoked here, kept as a tombstone so links survive a reconnect
 */
export type ConnectionStatus =
  | "connected"
  | "pending"
  | "error"
  | "disconnected";

/** How the Integrations tab sees one provider. Never carries a token. */
export type IntegrationCard = {
  provider: ProviderName;
  label: string;
  /** Server has the client id/secret for this provider. */
  configured: boolean;
  /** Which env vars are populated — the "how do I turn this on" list. */
  envVars: { name: string; set: boolean }[];
  redirectUri: string;
  status: ConnectionStatus | "none";
  tenantName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  lastSummary: SyncResult | null;
  /** IntegrationLink counts, per entity. */
  linked: Record<SyncEntity, number>;
  /** Xero only — the account codes, editable in the card. */
  salesAccountCode: string;
  bankAccountCode: string;
  /** Xero only — set while `status` is "pending". */
  tenantChoices: { tenantId: string; tenantName: string }[];
};
