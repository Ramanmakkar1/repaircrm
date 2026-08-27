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
};

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

export type MessagingConfig = {
  emailDriver: string;
  smsDriver: string;
  appUrl: string;
  /** Env vars the active driver needs, with whether each one is populated. */
  emailVars: { name: string; set: boolean }[];
  smsVars: { name: string; set: boolean }[];
};
