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
  /** Hourly bench rate billed when time entries become invoice lines. */
  labourRateCents: number;
  /** Billing increment in minutes; logged time rounds UP to it. */
  labourRoundingMinutes: number;
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
  inbound: InboundConfig;
};

/**
 * How online card payments are wired up, as the settings screen sees it.
 *
 * Same rule as the messaging drivers: only *whether* each secret is populated
 * ever reaches the browser, never its value. A Stripe secret key in a client
 * bundle is a full account compromise, and `testMode` — a single boolean — is
 * the only thing about the key itself that is ever derived for the UI.
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

/** One paired card machine, as the Payments tab lists it. */
export type ReaderItem = {
  id: string;
  label: string;
  /** Stripe's word — "online", "offline", "unknown". Rendered as a sentence. */
  status: string;
  deviceType: string;
  serialNumber: string | null;
  /** Stripe's software reader: no hardware, test keys only, labelled as such. */
  simulated: boolean;
  /** 0–100, only for models that have a battery. */
  batteryPercent: number | null;
  lastSeenAt: string | null;
  locationId: string | null;
};

/**
 * The state of the automatic payment-confirmation setup for this shop.
 *
 * There is no secret in here and there never will be. `lib/payments/endpoint.ts`
 * builds this by naming each field it is allowed to read, precisely so that the
 * signing key sitting in the next column cannot be swept into a page payload by
 * a later refactor.
 */
export type PaymentSetupState = {
  /** True when Stripe has been told, automatically, where to confirm payments. */
  automatic: boolean;
  endpointId: string | null;
  url: string | null;
  setUpAt: string | null;
  /** One sentence saying why the automatic setup did not finish. */
  error: string | null;
  /** True when this app has moved since Stripe was told where to post. */
  addressChanged: boolean;
};

/** Whether Stripe can reach this app at all, and the sentence to say so. */
export type AppAddressState = {
  url: string;
  publicAddress: boolean;
  message: string;
};

/** "How you get paid", already in prose. See lib/payments/payouts.ts. */
export type PayoutState = {
  scheduleText: string;
  bankText: string | null;
  available: { amountCents: number; currency: string }[];
  pending: { amountCents: number; currency: string }[];
  dashboardUrl: string;
  error: string | null;
};

/**
 * Everything the Payments tab renders.
 *
 * Assembled on the server in app/(app)/settings/page.tsx: the environment
 * facts from `process.env`, the connection from the database, and the account
 * and reader lists from live Stripe calls. Anything Stripe could not answer
 * arrives as an `*Error` string rather than as a missing section, so the tab
 * can say "we could not reach Stripe" instead of quietly claiming a shop has
 * no readers.
 */
export type PaymentsTabConfig = {
  env: PaymentsConfig;
  /** True when both STRIPE_SECRET_KEY and STRIPE_CLIENT_ID are present. */
  connectConfigured: boolean;
  connected: boolean;
  accountId: string | null;
  onboardedAt: string | null;
  /** Platform key is sk_test_… — the only key-derived fact the browser gets. */
  testMode: boolean;
  /** The shop's stored currency. */
  currency: string;
  account: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    defaultCurrency: string | null;
    country: string | null;
    businessName: string | null;
    disabledReason: string | null;
  } | null;
  accountError: string | null;
  readers: ReaderItem[];
  readersError: string | null;
  /** Whether a Terminal Location exists, i.e. a reader was ever registered. */
  hasReaderLocation: boolean;
  /** True when a card can be saved against a customer today. */
  cardOnFileReady: boolean;
  /** The automatic payment-confirmation setup, and whether it finished. */
  setup: PaymentSetupState;
  /** Whether Stripe can reach this app, so the tab can be honest about it. */
  address: AppAddressState;
  /** Where the money lands and roughly when. */
  payout: PayoutState;
  /** True when a practice (simulated) card machine may be added. */
  canPairPractice: boolean;
  /** The events Stripe is asked to send, for the by-hand fallback. */
  confirmationEvents: string[];
};

/**
 * An outbound webhook endpoint as the settings screen sees it.
 *
 * There is no `secret` here. Unlike an API key the secret IS stored in the
 * clear (the server has to sign every delivery with it), but it still crosses
 * to the browser exactly once — in the response to the create action — and
 * never again. A "reveal" affordance would put it in every page render.
 */
export type WebhookItem = {
  id: string;
  url: string;
  /** Event names, or the single entry "*". */
  events: string[];
  active: boolean;
  createdAt: string;
};

/** The one place the signing secret is ever handed back. */
export type CreateWebhookResult =
  | { ok: true; secret: string; item: WebhookItem }
  | { ok: false; error: string };

/** One delivery attempt, for the recent-activity table. */
export type WebhookDeliveryItem = {
  id: string;
  webhookId: string;
  event: string;
  /** "pending" | "delivered" | "failed" */
  status: string;
  attempts: number;
  responseCode: number | null;
  lastError: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
};

/**
 * Inbound email/SMS configuration, as the Messaging tab sees it.
 *
 * `inboundEmail` is the shop's own choice (stored in `Shop.settings`); the
 * flags are read from `process.env` on the server and only their presence
 * crosses to the browser, never a value.
 */
export type InboundConfig = {
  /** The address customers reply to, matched against a webhook's `to`. */
  inboundEmail: string;
  emailUrl: string;
  smsUrl: string;
  /** True once RESEND_WEBHOOK_SECRET is set — signature checking is on. */
  resendSecretSet: boolean;
  /** True once INBOUND_SECRET is set — the generic ?token= route works. */
  inboundTokenSet: boolean;
  /** True once TWILIO_AUTH_TOKEN is set — without it SMS is refused outright. */
  twilioTokenSet: boolean;
  /** The number Twilio delivers to, used to resolve which shop a text is for. */
  twilioFrom: string | null;
  /** Whether this deployment has more than one shop (changes the fallback). */
  singleShop: boolean;
  canEdit: boolean;
};
