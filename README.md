# Repairs helper

Repairs helper is a multi-tenant repair-shop management app built with Next.js 16,
React 19, Prisma 6 and PostgreSQL. It covers the workflow from lead and
appointment through repair ticket, estimate, invoice and payment, with inventory,
customer communication and a customer portal alongside it.

## Product areas

- Staff sign-in, shop roles, optional Google sign-in, two-factor authentication
  and password recovery
- Customers, repair assets, tickets, checklists, attachments and time tracking
- Estimates, invoices, recurring invoices, POS, deposits, refunds and cash drawers
- Products, stock tracking, vendors, purchase orders, serials and barcode scanning
- Appointments, leads, public check-in, the customer portal and shop display
- Reports, campaigns, audit logs, API keys and outbound webhooks
- Optional Stripe and Square payments, connected card terminals, email/SMS,
  QuickBooks, Xero and AI assist

## Run locally

Use Node.js 22 and PostgreSQL 16 or later. Docker Compose starts PostgreSQL and the app:

```sh
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to a fresh value from `openssl rand -base64 32`.
For Docker Compose, also set `POSTGRES_PASSWORD` to a fresh hex value from
`openssl rand -hex 32`. Compose refuses to start if it is missing; there is no
default database password.
Keep `NEXT_PUBLIC_APP_URL=http://localhost:3020` while developing.

To run Next.js directly, start PostgreSQL, set `DATABASE_URL`, then run:

```sh
npm ci
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3020](http://localhost:3020) and create a shop at `/signup`.
For the full single-machine stack, use `docker compose up -d`.

## Google sign-in for staff

Google sign-in is implemented for shop owners and staff. It uses OpenID Connect
with only `openid email profile`; it does not read or send Gmail messages. The
Google button stays hidden until both `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are configured.

In Google Cloud, finish the OAuth consent setup, add the app's users as test
users while the consent screen is in Testing, then create a Web application
OAuth client. Add this exact authorized redirect URI:

```text
https://repairshelper.com/api/auth/google/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the private VPS environment.
Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to the public HTTPS origin;
it must match the host in the redirect URI. For local Next.js development, use
`http://localhost:3020`. `scripts/dev/fake-google.mjs` provides a local-only
identity provider for exercising the complete OAuth flow without real Google
credentials.

## Production hosting

The website at https://repairshelper.com runs on the shared VPS alongside UI Discovery,
in its own Linux service. PostgreSQL is local to the VPS with a dedicated app role.
Attachments remain in Cloudflare R2; noreply, support and welcome email use Hostinger.
Production credentials are private on the server, never in Git. See [operations and
backup instructions](ops/README.md) for deployment, daily backups, restore and rollback.

The retired PlanetScale database and Hyperdrive configuration were removed after all
127 source rows were verified. Source exports and a PostgreSQL backup are retained
privately on the VPS and owner's Mac. The old Cloudflare Worker only redirects to
the new domain; `npm run cf:deploy` deploys that redirect, not the application.

## Assistant and voice

Common lookups use fresh, shop-scoped database queries before any AI provider call.
Quick commands include low stock, my repairs, overdue repairs, repair numbers,
customer/product searches, appointments and sales periods. They don't spend text-AI
quota and remain available when the provider allowance is exhausted. Unsupported
wording and conversational follow-ups use the existing interpreter. This is a
query system, not model training: the database is not uploaded to train a model.

Autocomplete offers command suggestions and debounced customer, product and repair
matches. Each lookup checks the session and shop scope. Money permissions and
confirmation steps remain enforced by the action dispatcher.

Voice defaults to OpenAI Whisper (`STT_DRIVER=openai`, `STT_MODEL=whisper-1`, the
existing private `OPENAI_API_KEY`). It records up to 60 seconds, stops on a pause,
discards silence, and returns editable text. The capture includes a level meter,
cancel control, noise suppression and compressed audio where supported. Cloud
transcription consumes voice allowance even when the resulting query skips AI.
Supported browsers also offer browser recognition without paid AI calls, with
English, Hindi, Punjabi, Mandarin, Cantonese and Filipino/Tagalog language choices.
Whisper auto-detects the language. Recognition quality varies by accent, language,
noise and device; review names and numbers before submitting.

No audio is saved by the app. Provider data handling applies to cloud transcription.
Daily shop and platform limits protect paid requests; per-user burst limits guard
voice, commands and autocomplete. In-memory burst limits assume one Node instance;
use a shared rate-limit store before scaling to multiple processes.

### Platform operations console

`/platform` is a separate, read-only operations surface with its own accounts.
Operators are rows in the `PlatformAdmin` table — not shop users — and sign in at
`/platform/login` with their own session cookie (scoped to `/platform`, 8-hour
life). No shop login, whatever its role or email, can reach the console, and the
shop app never links to it.

Create, reset or disable an operator from the command line (there is no web
signup for this):

```bash
PLATFORM_ADMIN_PASSWORD='a long random passphrase' \
  node scripts/platform-admin.mjs add ops@example.com "Ops Name"
node scripts/platform-admin.mjs disable ops@example.com
node scripts/platform-admin.mjs list
```

Optionally set `PLATFORM_HOST` (e.g. `admin.example.com`) so the console answers
only on that host and is a plain 404 on the shop's address. Failed operator
sign-ins are capped per email per hour in Postgres.

PostgreSQL size, session load, record counts, persisted failures and audit
summaries are read from the database. Legacy PlanetScale and Cloudflare Worker
metric adapters remain optional in the code and are not the active VPS runtime.
The console does not manage billing or provision resources.

## Production verification

HTTPS, database health, Google sign-in, code sign-in, reset-code delivery, R2 read/
write/delete and backup restoration have been checked. Daily backup and scheduled
jobs run on the VPS. Welcome messages passed sender authentication but were placed
in Junk by Hostinger during delivery tests; inbox placement is not guaranteed.
Provider payment credentials still require explicit configuration before activation.

### Payment providers and connected devices

Stripe Connect and Square OAuth are implemented as owner-approved account
connections. Stripe supports the initial New Zealand, United States, Canada and
United Kingdom markets. Square is offered for United States, Canada and United
Kingdom shops; Square does not process New Zealand sellers. Both connectors can
create online invoice payment links and pair supported payment terminals. A
completed provider payment is verified on the server and recorded once against
the Repairs helper invoice or POS sale.

The Payments settings screen also provides browser permission controls for
authorized USB, serial, Bluetooth and HID equipment. This covers devices such
as scanners, scales and compatible printers. Keyboard-mode barcode scanners
work directly in POS search. Certified EFTPOS readers remain connected through
Stripe or Square so card data does not pass through Repairs helper.

Provider connections remain disabled until their application credentials,
webhook signature secrets, and explicit driver settings are configured. Stripe
payments use the `PAYMENTS_DRIVER=stripe` switch; Square uses
`SQUARE_DRIVER=square`. Both switches default to `off`, so adding secrets alone
cannot start payment flows.
See [Payment provider setup](docs/PAYMENT-PROVIDER-SETUP.md) for the exact
dashboard values, redirect URLs, webhook events, and safe activation steps.
Windcave, Worldline, Moneris, Clover,
SumUp and PayPal appear in the country-aware provider catalogue but are labelled
unavailable until a working, certified connector exists; the interface never
accepts a key for an adapter that cannot complete a payment.

## Demo data

`npm run db:seed` creates the demo shop and prints temporary staff and API
credentials. Use a disposable development database; seeding is disabled when
`NODE_ENV=production`.

## Checks

```sh
npx tsc --noEmit
npm run lint
npm test
npm run build
```

The automated suite covers money calculations, payment/refund handling, tenant
scoping, bulk and inline actions, recurring billing and selected state changes.
Optional integrations stay disabled until their credentials and driver settings
are provided. `.env.example` documents local and provider configuration.
