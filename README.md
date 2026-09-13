# RepairPilot

RepairPilot is a multi-tenant repair-shop management app built with Next.js 16,
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

Use Node.js 22 and PostgreSQL 17. Docker Compose starts PostgreSQL and the app:

```sh
cp .env.example .env
```

Set `AUTH_SECRET` in `.env` to a fresh value from `openssl rand -base64 32`.
For Docker Compose, also set `POSTGRES_PASSWORD` to a fresh hex value from
`openssl rand -hex 32`. Compose refuses to start if it is missing; there is no
default database password.
Keep `NEXT_PUBLIC_APP_URL=http://localhost:3020` while developing.

To run Next.js directly, start PostgreSQL, set `DATABASE_URL`, then run. The
development launcher passes that URL to the local Hyperdrive binding without
printing it:

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
https://YOUR_PUBLIC_HOST/api/auth/google/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as private Worker secrets.
Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin when building the Worker;
it must match the host in the redirect URI. For local Next.js development, use
`http://localhost:3020`. `scripts/dev/fake-google.mjs` provides a local-only
identity provider for exercising the complete OAuth flow without real Google
credentials.

## Temporary Cloudflare test runtime

Cloudflare Workers is the temporary test host while the product is being
finished. The website will move to the owner's new server before production
launch. Do not put live payment credentials or real customer data on this test
deployment. Its Square environment is Sandbox and both payment drivers default
off. The app uses the same PostgreSQL schema and transaction-based workflows,
through Prisma's PostgreSQL driver adapter and Cloudflare Hyperdrive binding
`HYPERDRIVE`.

There are three database paths:

- **$0 PostgreSQL:** Neon Free can connect through Hyperdrive. Cloudflare still
  runs the Worker and Hyperdrive, but Neon hosts the database. Its free plan has
  storage and compute quotas and scales to zero when idle. See [Neon's current
  limits](https://neon.com/pricing) and Cloudflare's [Neon connection
  guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/).
- **Cloudflare-billed PostgreSQL:** PlanetScale Postgres can be created in the
  Cloudflare dashboard and connected through Hyperdrive. Database usage is
  billed separately from Cloudflare's Free plan; PlanetScale's single-node
  Postgres currently starts at $5/month. See [Cloudflare's PlanetScale
  guide](https://developers.cloudflare.com/hyperdrive/planetscale/) and
  [PlanetScale pricing](https://planetscale.com/docs/postgres/pricing).
- **Cloudflare D1:** D1 has a free tier, but it uses SQLite. Prisma 6's D1
  adapter ignores implicit and explicit transactions, while RepairPilot relies
  on transactions for payments, inventory, invoices, signup and account
  security. It is not safe to bind D1 to this app without a substantial
  data-layer rewrite. See [Prisma's D1 limitations](https://www.prisma.io/docs/orm/v6/overview/databases/cloudflare-d1).

The existing PostgreSQL database `repairpilot-prod` is a PlanetScale PS-5
instance in Oregon with a 10 GB storage cap, billed through Cloudflare. The
current test Worker reaches it through the `repairpilot-prod` Hyperdrive
configuration, using a role scoped to the `main` branch. All 14 schema
migrations are applied and the database contains labelled QA data. Keep test
shops and test records separate from real customer records. The database
remains an active $5/month commitment; the new-server migration must decide
whether to keep it or move the database too. Its connection password is held
inside Hyperdrive and was intentionally omitted from the Desktop export, so a
new server will need a separate direct PostgreSQL credential. No Cloudflare
plan or payment method was changed during setup.

Hyperdrive's origin connection limit is 8. PlanetScale PS-5 permits 25 database
connections, so this leaves capacity for provider operations and occasional
soft-limit overflow instead of allowing the edge pool to consume 20 connections
while the product is in early access.

To preview locally, add a direct PostgreSQL URL to ignored `.dev.vars`:

```sh
HYPERDRIVE_LOCAL_URL="postgresql://USER:PASSWORD@localhost:5432/repairpilot"
npm run cf:preview
```

The preview helper passes that URL to Wrangler without printing it. Local
Hyperdrive emulation connects directly to PostgreSQL; the deployed Worker uses
Cloudflare's Hyperdrive binding and its managed connection pool.

`worker.mjs` wraps the generated OpenNext fetch handler with a Cloudflare
scheduled handler. The Worker runs `/api/cron` every 15 minutes, with the
in-process timer disabled. This keeps recurring invoices and other scheduled
work running on Workers rather than relying on a process timer.

The temporary test Worker uses the account's default
`https://repairpilot.townmedialabs.workers.dev` address. Set test-environment
secrets with Wrangler before deploying:

```sh
npx wrangler secret put AUTH_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Google sign-in is enabled on the test Worker. It uses the private
`REPAIRPILOT_UPLOADS` R2 binding for attachments and caps recorded R2 storage at
8 GB. The bucket is `repairpilot-uploads-prod`; an authenticated
upload/download smoke test has passed against it. Usage above R2's included
free allowance is billable
([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Do not use local
storage for a Worker. Deploy with both
`APP_URL=https://repairpilot.townmedialabs.workers.dev` and
`NEXT_PUBLIC_APP_URL=https://repairpilot.townmedialabs.workers.dev`, then run
`npm run cf:deploy` for test deployments only. The new-server deployment will
use its own environment variables, database connection, email provider,
payment credentials, and public callback URLs.

### Platform operations console

`/platform` is a separate, read-only operations surface. It accepts only a
currently active RepairPilot user whose database email is explicitly present
in `PLATFORM_ADMIN_EMAILS`; an OWNER role by itself does not grant platform
access. Configure one or more existing, active RepairPilot staff emails in the
deployment environment before relying on the console. Separate multiple
addresses with commas. For local Next.js development, place the value in ignored
`.env.local`; use ignored `.dev.vars` when running the Wrangler preview.

For a deployed Worker, configure `PLATFORM_ADMIN_EMAILS` in the Worker
environment settings. Keep administrator addresses out of source control. The
value must match one or more active RepairPilot staff accounts.

PostgreSQL size, session load, record counts, persisted failures, and audit
summaries are read directly from the database. PlanetScale primary CPU, memory
utilization/RSS, and volume use come from its [branch metrics
API](https://planetscale.com/docs/api/reference/get_branch_metrics), with
volume capacity from its [instant metrics
API](https://planetscale.com/docs/api/reference/get_instant_branch_metrics).
These endpoints accept a service token with `read_branch` on this database.
This access is read-only and does not expose billing controls. Store
`PLANETSCALE_SERVICE_TOKEN_ID` and `PLANETSCALE_SERVICE_TOKEN` as Worker
secrets; `PLANETSCALE_ORGANIZATION`, `PLANETSCALE_DATABASE`, and
`PLANETSCALE_BRANCH` are ordinary configuration variables. For local
development, set these in `.env.local` or `.dev.vars`.

Worker CPU, isolate memory, request, and error metrics are optional and read
from the [Cloudflare Workers Analytics GraphQL
API](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/).
Store `CF_ANALYTICS_API_TOKEN` as a secret with only Account Analytics: Read,
scoped to the RepairPilot Cloudflare account. `CLOUDFLARE_ACCOUNT_ID` and
`CF_WORKER_NAME` identify the account and Worker. Without these values the
console shows Cloudflare runtime metrics as unavailable; it does not estimate
them.

The console does not change a plan, manage billing, or provision resources.
Cloudflare analytics are operational measurements, not invoice totals. Review
service and billing decisions directly in the provider dashboard.

## Test deployment status

The temporary OpenNext test Worker is available at
`https://repairpilot.townmedialabs.workers.dev`. All 14 schema migrations are
applied, `/api/health` reaches the test database, scheduled work runs
every 15 minutes, and the R2 attachment path has passed a real upload/download
round trip. Password sign-in was verified with separate platform-admin and
normal-user sessions; the normal user receives a 404 from `/platform`.

Google OAuth is configured on the test Worker and has passed the complete account picker,
consent, callback, account-link, and session flow. Public privacy and terms pages
support the consent screen. The owner will choose the custom domain and
destination server; public callback URLs must be updated after that choice.

The current known base commitment is $5/month for PlanetScale PS-5. Workers is
on the Free plan, Google OAuth has no base charge, and R2 has a $0 base with
usage overages possible. `/platform` displays this as $5 of the configured $10
monthly operating budget plus recorded storage usage. This is an operating
policy and an alerting threshold, not a provider-side payment block: Cloudflare
has an active $10 usage budget alert for the account owner. Budget alerts are
informational and Cloudflare automatically charges invoices.
No service may be upgraded without the account owner's explicit approval.

### Payment providers and connected devices

Stripe Connect and Square OAuth are implemented as owner-approved account
connections. Stripe supports the initial New Zealand, United States, Canada and
United Kingdom markets. Square is offered for United States, Canada and United
Kingdom shops; Square does not process New Zealand sellers. Both connectors can
create online invoice payment links and pair supported payment terminals. A
completed provider payment is verified on the server and recorded once against
the RepairPilot invoice or POS sale.

The Payments settings screen also provides browser permission controls for
authorized USB, serial, Bluetooth and HID equipment. This covers devices such
as scanners, scales and compatible printers. Keyboard-mode barcode scanners
work directly in POS search. Certified EFTPOS readers remain connected through
Stripe or Square so card data does not pass through RepairPilot.

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

The account currently uses the Workers Free plan. Cloudflare's current limits
include 100,000 requests per day and 10 ms CPU time per invocation
([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
The Worker bundle builds within the published size limit, but representative
production routes have not been verified against the CPU limit. No Workers Paid
upgrade has been made. Logs use 10% sampling; tracing is disabled because
Cloudflare plans to bill trace events starting October 1, 2026
([tracing pricing](https://developers.cloudflare.com/workers/observability/traces/)).

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
npm run cf:build
```

The automated suite covers money calculations, payment/refund handling, tenant
scoping, bulk and inline actions, recurring billing and selected state changes.
Optional integrations stay disabled until their credentials and driver settings
are provided. `.env.example` documents local and provider configuration.
