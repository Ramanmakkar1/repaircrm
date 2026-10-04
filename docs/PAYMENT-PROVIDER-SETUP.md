# Payment provider setup

Repairs helper runs in production at `https://repairshelper.com` on the VPS (see
[Production hosting](../README.md#production-hosting) and [operations
instructions](../ops/README.md)). Use that bare domain for every URL below, not
`www.repairshelper.com`, which only redirects. Keep both payment drivers off until
a provider connection and a test-mode payment have been verified.

The retired Cloudflare test Worker at `repairpilot.townmedialabs.workers.dev` now
only redirects to the new domain, and not every provider follows a redirect. Any
OAuth redirect URL or webhook URL still registered with that old address must be
replaced with the `repairshelper.com` URLs in this guide.

## Where settings and secrets live

Every payment setting is an environment variable in the private file
`/etc/repairshelper/app.env` on the VPS. The `repairshelper` systemd service loads
it with `EnvironmentFile=` (see `ops/repairshelper.service`). The file is
root-owned, readable by the app group, and never committed to Git. Never put a
provider key in source control, a browser field, a chat message or a document.

To change a value, as root on the VPS:

1. Edit `/etc/repairshelper/app.env`, one `NAME=value` line per setting. Leave the
   file root-owned and group-readable.
2. Restart the service so it reads the file again: `systemctl restart repairshelper`.
3. Check it came back: `systemctl status repairshelper`, then
   `journalctl -u repairshelper --since '15 minutes ago'`.

A value change needs only that restart, not a new release, with one exception: `NEXT_PUBLIC_*` values (including `NEXT_PUBLIC_APP_URL`) are fixed when the code is built, so changing one needs a new release. `APP_URL` is read at run time; set `APP_URL=https://repairshelper.com` in `app.env` so it always wins. A code release goes out
with `/usr/local/sbin/repairshelper-deploy /srv/repairshelper/releases/<release>`,
which backs up the database, applies migrations, switches the code, checks
`/api/health` and restores the previous code if the check fails; see
[ops/README.md](../ops/README.md) for the full procedure.

To see the payment switches without printing any secret, run as root:

```sh
grep -E '^(PAYMENTS_DRIVER|SQUARE_DRIVER|SQUARE_ENVIRONMENT)=' /etc/repairshelper/app.env
```

The URLs the app sends to Stripe and Square are built from `APP_URL` (or
`NEXT_PUBLIC_APP_URL` when `APP_URL` is unset). Both should be
`https://repairshelper.com`, otherwise the URLs the app uses will not match the ones
registered in the provider dashboards.

## The two payment switches

The drivers do not switch on the same way.

- **Square** is off unless `SQUARE_DRIVER=square`. Adding Square credentials alone
  never starts a payment flow.
- **Stripe** uses `PAYMENTS_DRIVER`, which accepts `off` or `stripe`. When it is
  unset or blank, the app switches Stripe on as soon as `STRIPE_SECRET_KEY` is present.
  Any other value counts as `off`. So write `PAYMENTS_DRIVER=off` explicitly in
  `app.env` before adding a Stripe key; leaving the line out is not enough.

`.env.example` ships `PAYMENTS_DRIVER=off`, `SQUARE_DRIVER=off` and
`SQUARE_ENVIRONMENT=sandbox`. These two switches and `SQUARE_ENVIRONMENT` are
ordinary settings in the same file, not secrets.

## Stripe

In the Stripe Dashboard, enable Connect for the Repairs helper platform and
register this exact OAuth redirect URL:

```text
https://repairshelper.com/api/payments/stripe/callback
```

Enable OAuth onboarding and copy the matching test-mode or live-mode platform
secret key and Connect client ID. Add them to `app.env` as `STRIPE_SECRET_KEY` and
`STRIPE_CLIENT_ID`. Use test credentials first. The current implementation uses
Stripe's Standard-account OAuth flow; Stripe now recommends Connect Onboarding for
new platforms, so review that migration before inviting a broad customer base.
[Stripe Connect OAuth setup](https://docs.stripe.com/connect/oauth-standard-accounts)

`PAYMENTS_CURRENCY` sets the currency (a lowercase three-letter code, `usd` when
unset). Only two-decimal currencies are accepted, because amounts are stored in
cents.

When a shop connects its Stripe account, Repairs helper tries to create that
shop's webhook endpoint automatically and securely stores its signing secret.
The endpoint is:

```text
https://repairshelper.com/api/webhooks/stripe
```

It subscribes to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `payment_intent.succeeded`,
`charge.refunded`, `refund.updated`, and
`account.application.deauthorized`. If automatic setup reports an error, use
the retry/status message on the Settings → Payments screen before taking real
payments.

`STRIPE_WEBHOOK_SECRET` is required for direct platform-mode payments, where
the money is processed by the Repairs helper platform account. That mode is not
the intended shop connection path; do not configure it unless you deliberately
want settlement to go through the platform's Stripe account. Stripe webhooks
are verified against their signing secret before any payment is recorded.

Keep `PAYMENTS_DRIVER=off` while configuring credentials. To test Stripe, add
only test-mode credentials, set `PAYMENTS_DRIVER=stripe` in `app.env`, restart the
service and exercise test payments. Set it back to `off` until the live key,
client ID and callback URL have been added and checked. Stripe's
[OAuth reference](https://docs.stripe.com/connect/oauth-reference) describes the
redirect and client-ID requirements.

## Square

Square does not support payment-processing sellers in New Zealand. For a
supported US, Canadian, or UK shop, create a Repairs helper application in the
Square Developer Console. See Square's [supported-country payment list](https://developer.squareup.com/docs/payment-card-support-by-country).
Choose the matching environment (Sandbox for testing, Production for live use),
then register this exact OAuth redirect URL under that environment:

```text
https://repairshelper.com/api/payments/square/callback
```

Copy the environment-matched application ID and application secret. In that
application's Webhooks settings, create a subscription with this exact
notification URL:

```text
https://repairshelper.com/api/webhooks/square
```

Subscribe to `payment.updated` and `terminal.checkout.updated`, then copy the
subscription's signature key. Those are the events the current settlement
handler processes. The signature key must match this notification URL exactly;
Square signs the URL and raw request body together.
[Square OAuth redirect setup](https://developer.squareup.com/docs/oauth-api/create-urls-for-square-authorization)
and [Square webhook signature validation](https://developer.squareup.com/docs/webhooks/step3validate)
provide the dashboard details.

Add all three values to `app.env` as `SQUARE_APPLICATION_ID`,
`SQUARE_APPLICATION_SECRET`, and `SQUARE_WEBHOOK_SIGNATURE_KEY`. Set
`SQUARE_ENVIRONMENT=sandbox` for Sandbox app credentials and
`SQUARE_ENVIRONMENT=production` for Production ones (Sandbox is the default when
it is unset), and keep `SQUARE_DRIVER=off` while configuring. To test the
connection and checkout, set `SQUARE_DRIVER=square` with Sandbox credentials and
restart the service. Set the driver back to `off` after testing until the
Production credentials have been added and checked.

## Adding the values on the VPS

These are the names to add or review in `/etc/repairshelper/app.env`. Fill the
values in on the server only:

```text
PAYMENTS_DRIVER=off
STRIPE_SECRET_KEY=
STRIPE_CLIENT_ID=
SQUARE_DRIVER=off
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=
SQUARE_APPLICATION_SECRET=
SQUARE_WEBHOOK_SIGNATURE_KEY=
```

Only if intentionally using direct platform-mode Stripe payments, also add
`STRIPE_WEBHOOK_SECRET` with the platform webhook's signing secret. Connected shop
accounts use their own stored signing secrets. Do not add a value you do not have;
a provider stays unavailable without its credentials. Restart the service after
each edit, as described above.

Production processing should be enabled deliberately, and only after the callback
URLs and webhook subscriptions above have passed test mode.
