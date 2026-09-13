# Payment provider setup

The temporary Cloudflare test Worker is `repairpilot` at
`https://repairpilot.townmedialabs.workers.dev`. Its Stripe and Square
credentials are currently absent. Both payment drivers are explicitly off, so
adding credentials alone does not enable payment flows. Keep them off until
the provider connection and a test-mode payment have been verified. Cloudflare
is for testing only: do not configure live processor keys here. Production
credentials and callback URLs belong on the new server after migration.

## Stripe

In the Stripe Dashboard, enable Connect for the RepairPilot platform and
register this exact OAuth redirect URL:

```text
https://repairpilot.townmedialabs.workers.dev/api/payments/stripe/callback
```

Enable OAuth onboarding and copy the matching test-mode or live-mode platform
secret key and Connect client ID. Store them as Worker secrets named
`STRIPE_SECRET_KEY` and `STRIPE_CLIENT_ID`. Use test credentials first. The
current implementation uses Stripe's Standard-account OAuth flow; Stripe now
recommends Connect Onboarding for new platforms, so review that migration
before inviting a broad customer base. [Stripe Connect OAuth setup](https://docs.stripe.com/connect/oauth-standard-accounts)

When a shop connects its Stripe account, RepairPilot tries to create that
shop's webhook endpoint automatically and securely stores its signing secret.
The endpoint is:

```text
https://repairpilot.townmedialabs.workers.dev/api/webhooks/stripe
```

It subscribes to `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `payment_intent.succeeded`,
`charge.refunded`, `refund.updated`, and
`account.application.deauthorized`. If automatic setup reports an error, use
the Payments screen's retry/status message before taking real payments.

`STRIPE_WEBHOOK_SECRET` is required for direct platform-mode payments, where
the money is processed by the RepairPilot platform account. That mode is not
the intended shop connection path; do not configure it unless you deliberately
want settlement to go through the platform's Stripe account. Stripe webhooks
are verified against their signing secret before any payment is recorded.

Keep `PAYMENTS_DRIVER=off` while configuring credentials. To test Stripe,
upload only test-mode credentials, explicitly set `PAYMENTS_DRIVER=stripe` in
`wrangler.jsonc`, deploy, and exercise test payments. Return it to `off` after
testing. Do not switch the Cloudflare Worker to live keys. The new server will
get its own production key, client ID, and callback URL. These driver values
are ordinary Wrangler configuration variables under `vars`, not secrets;
deploy test changes with `npm run cf:deploy`. Stripe's [OAuth reference](https://docs.stripe.com/connect/oauth-reference)
describes the redirect and client-ID requirements.

## Square

Square does not support payment-processing sellers in New Zealand. For a
supported US, Canadian, or UK shop, create a RepairPilot application in the
Square Developer Console. See Square's [supported-country payment list](https://developer.squareup.com/docs/payment-card-support-by-country).
Choose the matching environment (Sandbox for testing, Production for live use),
then register this exact OAuth redirect URL under that environment:

```text
https://repairpilot.townmedialabs.workers.dev/api/payments/square/callback
```

Copy the environment-matched application ID and application secret. In that
application's Webhooks settings, create a subscription with this exact
notification URL:

```text
https://repairpilot.townmedialabs.workers.dev/api/webhooks/square
```

Subscribe to `payment.updated` and `terminal.checkout.updated`, then copy the
subscription's signature key. Those are the events the current settlement
handler processes. The signature key must match this notification URL exactly;
Square signs the URL and raw request body together.
[Square OAuth redirect setup](https://developer.squareup.com/docs/oauth-api/create-urls-for-square-authorization)
and [Square webhook signature validation](https://developer.squareup.com/docs/webhooks/step3validate)
provide the dashboard details.

Upload all three values as Worker secrets: `SQUARE_APPLICATION_ID`,
`SQUARE_APPLICATION_SECRET`, and `SQUARE_WEBHOOK_SIGNATURE_KEY`. Set
`SQUARE_ENVIRONMENT=sandbox` in `wrangler.jsonc` for Sandbox app credentials
and keep `SQUARE_DRIVER=off` while configuring. To test the connection and
checkout, set `SQUARE_DRIVER=square` and deploy with Sandbox credentials. Turn
the driver off and deploy after testing. Do not switch the Cloudflare Worker to
Production credentials; configure those on the new server after migration.
Both flags are ordinary Wrangler configuration variables; never store them as
secrets.

## Store and upload Worker secrets

Never put provider keys in source control, a browser field, or this chat. From
the project directory, use Cloudflare's secret prompt for each value:

```sh
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_CLIENT_ID
npx wrangler secret put SQUARE_APPLICATION_ID
npx wrangler secret put SQUARE_APPLICATION_SECRET
npx wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY
```

Only if intentionally using direct platform-mode Stripe payments, also run
`npx wrangler secret put STRIPE_WEBHOOK_SECRET` with the platform webhook's
signing secret. Connected shop accounts use their own stored signing secrets.

`wrangler secret put` deploys a Worker version immediately, so leave both
payment drivers off during setup. Do not set a secret you do not have; the
provider remains unavailable without its credentials. Wrangler keeps values
encrypted and does not display them after upload. [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
documents this behavior.

For a one-request upload after all needed values have been collected, Cloudflare
also supports `npx wrangler secret bulk <file>` with a JSON key/value file. Keep
such a file outside the repository with owner-only permissions, run the command
from this project directory, and remove the file after upload. [Wrangler secret
bulk](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
documents the accepted format.

No live provider credentials are present on Cloudflare. On the new server,
production processing must be deliberately enabled only after its separate
environment, callback URLs, and webhook subscriptions have passed test mode.
