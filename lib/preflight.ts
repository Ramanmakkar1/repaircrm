/**
 * Boot-time configuration check.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * Every environment variable in this app is read lazily, at the moment it is
 * first needed. That is the right design — it is what lets a shop run with no
 * Stripe, no Twilio and no accounting sync, and it is why every integration
 * fails closed and names the variable it wanted.
 *
 * It has one bad consequence, and it only shows up in production: a deploy
 * that is missing `AUTH_SECRET` **boots perfectly**. `/api/health` answers 200
 * because the database is reachable. The load balancer marks the instance
 * healthy and sends it traffic. Then the first person to sign in gets a 500,
 * and so does everyone after them, because `authSecretKey()` throws on every
 * request that touches a session.
 *
 * So: check the things that must be true before the process is allowed to
 * serve, and check them once, out loud, at boot.
 *
 * FATAL vs WARNING is a deliberate split.
 *   · Fatal  — the app cannot do its job at all. Refuse to start. A container
 *              that exits immediately is a deploy that visibly failed, which
 *              is far better than one that silently serves errors.
 *   · Warning — a feature is off or half-wired. The shop still works. Say it
 *              loudly in the boot log and carry on; refusing to start because
 *              nobody configured Twilio would be absurd.
 *
 * Development is never fatal. Half a `.env` is the normal state of a laptop.
 */

interface Findings {
  fatal: string[];
  warn: string[];
}

/** Set by Next during `next build`; there is no server to protect yet. */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function set(name: string): boolean {
  return (process.env[name] ?? "").trim().length > 0;
}

/**
 * Anything an attacker could guess is not a secret. 32 characters is the floor
 * for an HS256 key that signs staff sessions, portal links and the pending-2FA
 * token; the placeholder check catches the far more common failure, which is
 * shipping the example file's value verbatim.
 */
const PLACEHOLDERS = [
  "change-me",
  "changeme",
  "replace-me",
  "your-secret-here",
  "secret",
  "dev-secret",
  "development",
];

function checkAuthSecret(out: Findings): void {
  const secret = (process.env.AUTH_SECRET ?? "").trim();

  if (!secret) {
    out.fatal.push(
      "AUTH_SECRET is not set — every sign-in and every portal link would fail at request time.",
    );
    return;
  }
  if (!isProd()) return;

  if (secret.length < 32) {
    out.fatal.push(
      `AUTH_SECRET is ${secret.length} characters; use at least 32 (\`openssl rand -base64 32\`).`,
    );
  }
  if (PLACEHOLDERS.includes(secret.toLowerCase())) {
    out.fatal.push(
      "AUTH_SECRET is still a placeholder value — anyone who has read this repo can mint a session.",
    );
  }
}

function checkDatabase(out: Findings): void {
  if (!set("DATABASE_URL")) {
    out.fatal.push("DATABASE_URL is not set — nothing in this app can read or write.");
  }
}

function checkAppUrl(out: Findings): void {
  const url = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (!url) {
    // Not fatal: the app renders. But every emailed magic link, payment link
    // and portal invite is built from this, so in production it is wrong to
    // be missing and the shop will only find out when a customer can't pay.
    out.warn.push(
      "NEXT_PUBLIC_APP_URL is not set — emailed portal, payment and check-in links will point at the wrong host.",
    );
    return;
  }
  if (isProd() && url.startsWith("http://")) {
    out.warn.push(
      `NEXT_PUBLIC_APP_URL is http:// (${url}) — session cookies are Secure in production, so sign-in will not stick over plain HTTP.`,
    );
  }
}

/**
 * The half-configured Stripe state is real and it is quiet: a secret key on
 * its own is enough to *charge* a customer, but without the webhook secret
 * nothing ever *settles*, so payments succeed at Stripe and the invoice stays
 * unpaid forever. Settings warns about this too; a deploy should not need
 * someone to go looking.
 */
function checkPayments(out: Findings): void {
  if (!set("STRIPE_SECRET_KEY")) return;
  if (!set("STRIPE_WEBHOOK_SECRET")) {
    out.warn.push(
      "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — cards will be charged and invoices will never be marked paid.",
    );
  }
}

function checkComms(out: Findings): void {
  if (process.env.EMAIL_DRIVER === "resend" && !set("RESEND_API_KEY")) {
    out.warn.push("EMAIL_DRIVER=resend but RESEND_API_KEY is not set — no email will leave the app.");
  }
  if (process.env.EMAIL_DRIVER === "resend" && !set("EMAIL_FROM")) {
    out.warn.push("EMAIL_DRIVER=resend but EMAIL_FROM is not set — Resend will reject every send.");
  }
  if (process.env.SMS_DRIVER === "twilio") {
    for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"]) {
      if (!set(key)) out.warn.push(`SMS_DRIVER=twilio but ${key} is not set — no text message will send.`);
    }
  }
}

/**
 * The one that would otherwise go unnoticed for a month.
 *
 * Background work runs EITHER from the in-process timer (JOBS_INTERVAL_MIN) OR
 * from an external scheduler hitting /api/cron with CRON_SECRET. Turn the
 * timer off without setting the secret — which is exactly what you do when you
 * move to more than one instance — and recurring invoices stop generating,
 * appointment reminders stop sending, and review requests stop going out. No
 * error is raised anywhere, because nothing is running to raise one.
 */
function checkScheduler(out: Findings): void {
  const raw = (process.env.JOBS_INTERVAL_MIN ?? "").trim();
  const timerOff = raw !== "" && Number(raw) <= 0;
  if (timerOff && !set("CRON_SECRET")) {
    out.warn.push(
      "JOBS_INTERVAL_MIN=0 disables the in-app timer and CRON_SECRET is not set, so /api/cron returns 503 — nothing will run recurring invoices, reminders or review requests.",
    );
  }
}

function checkStorage(out: Findings): void {
  if (process.env.STORAGE_DRIVER !== "s3") return;
  for (const key of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    if (!set(key)) out.warn.push(`STORAGE_DRIVER=s3 but ${key} is not set — attachment uploads will fail.`);
  }
}

export function collectFindings(): Findings {
  const out: Findings = { fatal: [], warn: [] };
  checkAuthSecret(out);
  checkDatabase(out);
  checkAppUrl(out);
  checkPayments(out);
  checkComms(out);
  checkScheduler(out);
  checkStorage(out);
  return out;
}

/**
 * Run the check and act on it. Called once from `instrumentation.ts`.
 *
 * Throwing here is deliberate: Next surfaces it and the process exits, which
 * is what makes a bad deploy fail visibly instead of serving 500s behind a
 * green health check.
 */
export function preflight(): void {
  if (isBuildPhase()) return;

  const { fatal, warn } = collectFindings();

  for (const line of warn) console.warn(`[preflight] WARN  ${line}`);

  if (fatal.length === 0) {
    if (warn.length === 0) console.log("[preflight] configuration OK");
    return;
  }

  for (const line of fatal) console.error(`[preflight] FATAL ${line}`);

  if (!isProd()) {
    // A laptop with half a .env is normal; say it plainly and let it run.
    console.error(
      "[preflight] continuing anyway because NODE_ENV is not production — this deploy would refuse to start.",
    );
    return;
  }

  throw new Error(
    `RepairFlow refused to start: ${fatal.length} fatal configuration problem${
      fatal.length === 1 ? "" : "s"
    } (see [preflight] FATAL above).`,
  );
}
