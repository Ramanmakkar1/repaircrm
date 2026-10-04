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

Voice starts with live browser recognition where supported (Chrome/Edge). This is
the default and needs no key: interim words appear while speaking, and the complete
utterance becomes editable text on pause/stop. Sending is a separate action. Under
Voice settings, Spoken language offers English, Hindi, Punjabi, Mandarin Chinese,
Cantonese and Filipino / Tagalog for live recognition. Cloud transcription is off
unless `STT_DRIVER` is set to `openai`, `groq` or `custom` and that provider's key
is present (`OPENAI_API_KEY`, `GROQ_API_KEY`, or `STT_API_KEY` with `STT_BASE_URL`).
Once it is on, it is selectable as the Voice engine and is the fallback on browsers
without speech recognition; it returns text after recording, not word-by-word. The
OpenAI cloud default is `gpt-transcribe`; `STT_MODEL` can explicitly retain a
different model. Repair vocabulary includes screen guards, screen protectors and
tempered glass. Recognition still varies by accent and noise.

OpenAI command interpretation and spreadsheet column matching default to
`gpt-6.1-sol` with low reasoning and strict structured output. Set
`ASSISTANT_MODEL` to override those calls; `AI_MODEL` continues to control routine
drafts. The full interpreter receives the complete request and clarification;
`ASSISTANT_ROUTER=jev` explicitly enables the legacy classifier route. Exact stock
lookups take priority. A failed lookup can show possible matches (such as screen
cards → screen guards), clearly labelled as suggestions. Fuzzy matching never
resolves stock changes, prices or deletions.

### Counter and inventory entry

Home (`/counter`) is a touch screen with a start panel and three tabs. The panel
holds two large pinned buttons, New repair and New sale, with a Needs attention list
under them: tappable counts for Ready for pickup, Overdue repairs, Unpaid invoices
and Low stock. Items with nothing waiting are hidden, and an empty list reads "All
clear". Wide screens put the panel on the left with the tabs beside it; phones stack
them. Each tab is a set of picture tiles with a plain name and a line of live detail:

- Counter: Repairs, Pickup & pay, Take payment, Add customer, Find customer and
  Book a visit.
- Stock & purchasing: View & add stock, Low stock, Add product, Purchase orders,
  Suppliers and Import stock.
- Shop management: Money, Reports, Time clock, Shop display, Marketing and More tools.

Settings is a separate row, not a tile: at the bottom of the panel on wide screens and
under the tabs on phones. The tab last used is remembered on each device (cookie
`rf_home_tab`), so Home reopens where that device left off. More tools
(`/counter/tools`) opens the longer list: Shop settings, Reports, Marketing, Time
clock, Shop display, AI assistant settings, New estimate, Shop overview, Enquiries,
Purchase orders, Suppliers, Import stock, Import customers, Cash drawers and
Recurring bills. Role restrictions still apply: technicians do not see Take payment,
Money or the Unpaid invoices count (nor Import customers and Recurring bills under
More tools), and owner-only items (Purchase orders, Suppliers and Import stock, plus
AI assistant settings and Cash drawers under More tools) are hidden from other roles.
There is no side or top menu. A controls row gives Back, Home, Search and the
account menu (Back and Home are hidden on Home itself; a branch switcher appears
when the shop has several locations). Phones also have persistent Home, Repairs,
Sales (Customers for technicians), Stock and Assistant tabs, a compact header,
safe-area spacing and full-width action sheets. Easy-mode list tables become
labelled cards on phones so status, dates, balances and actions remain visible
without horizontal panning. The old dashboard is kept as
Shop overview (`/dashboard`, titled Repair workbench), listed under More tools. The
account menu's Full workbench item also opens it, but turns Easy mode off on that
device; Easy mode (task boxes) in the same menu turns it back on and returns to Home.
The installable web app opens `/counter` in a standalone window. Account menu →
Install app opens the browser prompt or installation instructions (including
Safari Add to Home Screen). Installation events are captured by the app shell,
not a menu that may be closed when the browser fires the event.
Repair intake defaults to quick entry, with optional step-by-step guidance. Device
boxes select Phone, Tablet, Laptop, TV, PS5, Xbox, Switch or Other and adapt brands,
models and common problems. PS5 seeds Sony/PlayStation 5. Device type is free text;
email, serial/IMEI and passcode are optional. Existing contacts can be found by
name, email or formatted phone numbers; repair summaries are suggested and editable.

New inventory puts name, selling price and stock quantity first. Photos, cost,
barcode, supplier and other existing fields remain under More details. Quick Add
stays open after saving for the next item. Easy-mode inventory opens with stock
groups and totals; choosing a group lists every matching item with quantities and
stock adjustment controls. Serialized products open their unit-management page.
Adjustments retain the existing server validation and audit records. Products with
no uploaded or built-in photo can fetch a licensed one automatically, which makes
outbound requests from the server to commons.wikimedia.org (and Wikimedia's image
hosts) carrying only a short catalogue name, never customer data; see
[Automatic product photos](docs/automatic-product-photos.md).

Inventory import accepts XLSX, XLS, ODS, CSV and TSV, or cells copied from a private
Google Sheet/Excel workbook. This is a one-time import, not Google account linking
or live sync. Select a worksheet/header row, review column matches and sample
values, preview, then import. AI matching is optional and sends only headers and
three sample rows to the configured provider. Existing SKU duplicate handling is
preserved. Sheets without SKUs can explicitly select Generate product codes; the
code is stable for the same name and barcode on repeat imports. Currency and whole-number validation reject ambiguous values instead
of silently changing them. Limits: 5 MB, 5,000 data rows, 100 columns.
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

Provider connections also need their application credentials and webhook signing
secrets before they can complete a payment. The two drivers do not switch on the
same way. Square is off unless `SQUARE_DRIVER=square` is set, so adding Square
secrets alone cannot start payment flows. Stripe is different: when
`PAYMENTS_DRIVER` is unset, the app uses Stripe as soon as `STRIPE_SECRET_KEY` is
present. `.env.example` ships `PAYMENTS_DRIVER=off`; keep that line (or set it
explicitly) in the production environment file while configuring Stripe, and set
`stripe` only when ready to test. Any other value is treated as `off`.
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
Optional integrations stay disabled until their credentials are provided; several
(such as Square and cloud transcription) also need an explicit driver setting.
`.env.example` documents local and provider configuration.
