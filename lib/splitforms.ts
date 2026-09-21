/**
 * Splitforms → RepairPilot leads.
 *
 * Splitforms (splitforms.com) is a hosted form backend: the shop builds its
 * website form there (spam filtering, file uploads, email alerts, auto-replies)
 * and adds one webhook — the private URL RepairPilot shows on the Leads page.
 * Every submission then arrives here and becomes a lead.
 *
 * Trust: the URL carries a 32-byte random token, which is what Splitforms'
 * own docs recommend treating as the shared secret. If the owner also pastes
 * the webhook's signing secret, the `X-Splitforms-Signature` header
 * (`sha256=<hex HMAC of the raw body>`) is checked too and an unsigned or
 * mis-signed request is refused.
 *
 * Web Crypto only (no `node:crypto`): this runs on Cloudflare Workers.
 */

export type SplitformsSettings = {
  token: string;
  secret: string | null;
  connectedAt: string;
  lastLeadAt: string | null;
};

export function readSplitforms(settings: unknown): SplitformsSettings | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const raw = (settings as Record<string, unknown>).splitforms;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.token !== "string" || value.token.length < 32) return null;
  return {
    token: value.token,
    secret: typeof value.secret === "string" && value.secret ? value.secret : null,
    connectedAt: typeof value.connectedAt === "string" ? value.connectedAt : "",
    lastLeadAt: typeof value.lastLeadAt === "string" ? value.lastLeadAt : null,
  };
}

export function newSplitformsToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Where RepairPilot sends a shop to build its form — tagged so Splitforms can see who referred them. */
export const SPLITFORMS_SIGNUP_URL =
  "https://splitforms.com/?ref=repairpilot&utm_source=repairpilot&utm_medium=integration&utm_campaign=leads";

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time over equal-length strings; unequal lengths fail. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function splitformsSignatureValid(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return sameString(header.trim().toLowerCase(), `sha256=${hex(mac)}`);
}

// ---------------------------------------------------------------------------
// Submission → lead
// ---------------------------------------------------------------------------

export type SplitformsLead = {
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: string;
  submissionId: string | null;
};

const NAME_KEYS = ["name", "full_name", "fullname", "your_name", "customer_name", "contact_name"];
const FIRST_KEYS = ["first_name", "firstname", "fname", "given_name"];
const LAST_KEYS = ["last_name", "lastname", "lname", "surname", "family_name"];
const EMAIL_KEYS = ["email", "e_mail", "email_address", "your_email"];
const PHONE_KEYS = ["phone", "phone_number", "mobile", "cell", "tel", "telephone", "whatsapp", "contact_number"];
const MESSAGE_KEYS = ["message", "comments", "comment", "details", "description", "body", "enquiry", "inquiry", "issue", "problem", "notes"];
/**
 * Splitforms' own reserved fields — never shown as lead details. Written in
 * their normalised form (see `norm`: dashes and spaces become underscores).
 */
const IGNORED_KEYS = new Set([
  "g_recaptcha_response",
  "cf_turnstile_response",
  "h_captcha_response",
  "access_key",
  "redirect",
  "botcheck",
  "website",
  "_gotcha",
  "subject",
  "from_name",
]);

function norm(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  return String(value).trim();
}

function pick(fields: Map<string, string>, keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = fields.get(key);
    if (value) return { key, value };
  }
  return null;
}

/**
 * Reads a Splitforms `submission.created` payload into a lead, whatever the
 * shop called its fields. Anything that is not name / email / phone / message
 * ("Device", "Model", "Preferred day") is kept, labelled, under the message —
 * nothing a customer typed is thrown away.
 */
export function leadFromSubmission(payload: unknown): SplitformsLead | null {
  if (!payload || typeof payload !== "object") return null;
  const submission = (payload as { submission?: unknown }).submission;
  if (!submission || typeof submission !== "object") return null;
  const { data, form_name: formName, id } = submission as {
    data?: unknown;
    form_name?: unknown;
    id?: unknown;
  };
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const fields = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(data as Record<string, unknown>)) {
    const key = norm(rawKey);
    const value = text(rawValue).slice(0, 2000);
    if (!value || IGNORED_KEYS.has(key) || key.startsWith("_")) continue;
    fields.set(key, value);
    labels.set(key, rawKey.trim());
  }

  const used = new Set<string>();
  const take = (keys: string[]) => {
    const hit = pick(fields, keys);
    if (hit) used.add(hit.key);
    return hit?.value ?? null;
  };

  let name = take(NAME_KEYS);
  if (!name) {
    const first = take(FIRST_KEYS);
    const last = take(LAST_KEYS);
    name = [first, last].filter(Boolean).join(" ") || null;
  }
  const email = take(EMAIL_KEYS);
  const phone = take(PHONE_KEYS);
  const message = take(MESSAGE_KEYS);

  const extras = [...fields.entries()]
    .filter(([key]) => !used.has(key))
    .map(([key, value]) => `${labels.get(key) ?? key}: ${value}`);

  const body = [message, extras.length ? extras.join("\n") : null].filter(Boolean).join("\n\n");
  const form = text(formName);

  return {
    name: (name || email || phone || "Website visitor").slice(0, 120),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase().slice(0, 160) : null,
    phone: phone ? phone.slice(0, 40) : null,
    message: body ? body.slice(0, 5000) : null,
    source: form ? `Splitforms · ${form}`.slice(0, 60) : "Splitforms",
    submissionId: typeof id === "string" && id ? id.slice(0, 80) : null,
  };
}
