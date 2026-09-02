/**
 * Shared shapes for the Settings module.
 *
 * Pure — imported by both the client tabs and the server actions, so no `db`,
 * no `next/*`, no "use server".
 */

/**
 * `useActionState` shape for the settings forms.
 *
 * Settings screens differ from the billing forms in one way that matters: they
 * do not redirect on success. Saving a tax rate leaves you exactly where you
 * were, so the form needs somewhere to say "saved" — hence `message` alongside
 * `error`, and `done` as a monotonic stamp so a repeat save still registers as
 * a fresh success rather than looking identical to the previous render.
 */
export type SettingsFormState = {
  error: string | null;
  message?: string | null;
  done?: number;
};

export const IDLE_SETTINGS_STATE: SettingsFormState = { error: null };

export function settingsError(error: string): SettingsFormState {
  return { error };
}

export function settingsSuccess(message: string): SettingsFormState {
  return { error: null, message, done: Date.now() };
}

/** Result shape for the dialog/inline actions the client awaits directly. */
export type SettingsResult = { ok: true } | { ok: false; error: string };

export const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "FRONT_DESK", label: "Front desk" },
  { value: "TECH", label: "Technician" },
] as const;

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  FRONT_DESK: "Front desk",
  TECH: "Technician",
};

/** What each role is actually allowed to do — shown under the team table. */
export const ROLE_BLURB: Record<string, string> = {
  OWNER: "Full access, including settings, team and voiding invoices.",
  FRONT_DESK: "Intake, customers, billing and store credit. No settings.",
  TECH: "Tickets, time and notes. No billing or settings.",
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
  /** Null means the invite has never been accepted — the row can be re-sent. */
  lastLoginAt: string | null;
  /** True when the member has an authenticator on their account. */
  twoFactorOn: boolean;
};

/**
 * What an invite (or a re-sent invite) comes back with.
 *
 * `inviteUrl` is only populated when the email driver is "log" — in development
 * nothing is actually delivered, so the link is handed to the owner to pass on.
 * With a real provider configured it is null and the link only exists in the
 * email, which is where it belongs.
 */
export type InviteResult =
  | { ok: true; inviteUrl: string | null; delivery: string }
  | { ok: false; error: string };

export type CannedResponseItem = {
  id: string;
  title: string;
  body: string;
};

export type ShopSettingsValues = {
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  timezone: string;
  taxRateBps: number;
};

/**
 * A public-API key as the settings screen sees it.
 *
 * There is no `key` field, and there never will be: the secret exists in
 * memory exactly once, in the response to the create action, and only its
 * sha256 reaches the database. `prefix` is the first 8 characters kept in the
 * clear purely so a row is identifiable.
 */
export type ApiKeyItem = {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

/** The one place the full key is ever handed back. */
export type CreateApiKeyResult =
  | { ok: true; key: string; item: ApiKeyItem }
  | { ok: false; error: string };

export type MessagingConfig = {
  emailDriver: string;
  smsDriver: string;
  appUrl: string;
  /** Env vars the active driver needs, with whether each one is populated. */
  emailVars: { name: string; set: boolean }[];
  smsVars: { name: string; set: boolean }[];
  payments: PaymentsConfig;
};

/**
 * How online card payments are wired up, as the settings screen sees it.
 *
 * Same rule as the messaging drivers: only *whether* each secret is populated
 * ever reaches the browser, never its value. A Stripe secret key in a client
 * bundle is a full account compromise.
 */
export type PaymentsConfig = {
  /** What PAYMENTS_DRIVER resolved to: "off" or "stripe". */
  driver: string;
  /** Driver is stripe AND the secret key is present. */
  live: boolean;
  /** Live AND the webhook secret is present — payments cannot settle without it. */
  webhookReady: boolean;
  currency: string;
  /** False for zero/three-decimal currencies, which cents cannot represent. */
  currencySupported: boolean;
  /** The endpoint to register in the Stripe dashboard. */
  webhookUrl: string;
  vars: { name: string; set: boolean }[];
};
