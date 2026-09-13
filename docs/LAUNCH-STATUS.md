# RepairPilot test and launch status

Reviewed on September 12–13, 2026 (America/Edmonton).

## Temporary Cloudflare test deployment

This is a test environment, not the final production website. The owner plans
to move the app to a new server after feature and usability work is complete.
Use labelled QA shops and test processor credentials here; do not enter real
customer records or enable live payment processing.

- App: `https://repairpilot.townmedialabs.workers.dev`
- Runtime: Cloudflare Workers with OpenNext
- Database: PlanetScale PostgreSQL PS-5 through Cloudflare Hyperdrive
- Files: private Cloudflare R2 bucket `repairpilot-uploads-prod`
- Schedule: Cloudflare cron every 15 minutes
- Platform console: `/platform`, restricted by the verified database email
  allowlist
- Latest test Worker version: `d6be1d2a-2b1a-4e0f-982d-918e5ec089bd` (September
  13, 2026); payment drivers are off and Square remains in Sandbox

The health endpoint, admin and user password sign-in, tenant boundary, Google
OAuth callback, Google account linking, normal CRM navigation, customer create,
ticket create, R2 upload, and authenticated file download have all passed against
the test deployment using labelled QA data.

## Costs and safeguards

| Service | Current commitment | Guard |
| --- | ---: | --- |
| PlanetScale PS-5 | $5/month | 10 GB database volume cap; Hyperdrive limited to 8 origin connections |
| Cloudflare Workers | $0 base | Free plan; no paid upgrade configured |
| Cloudflare R2 | $0 base, usage based above free allowance | App rejects new recorded uploads at 8 GiB |
| Google OAuth | $0 base | `openid email profile` only |

The application platform console presents the known $5 base against a $10
operating budget. A $10 Cloudflare usage budget alert is active for the account
owner. The alert does not stop usage or block charges; it sends a daily-evaluated
email warning. Provider invoices remain the source
of truth. Do not upgrade a plan, enable a paid add-on, or register a domain
without explicit owner approval.

## Remaining launch decisions

1. The owner will choose and register a custom `.com` domain. After that choice,
   point it at the final server and update public OAuth and payment callback URLs.
2. Configure a transactional email sender after the custom domain is active.
   Until then, email uses the safe `log` driver: password resets, invitations,
   customer status messages, and invoice emails are recorded but are not sent.
3. Add the RepairPilot platform credentials and webhook signing secrets for
   Stripe and/or Square. The account connection, payment-link, POS terminal and
   automatic settlement flows are implemented, but remain disabled until those
   credentials exist. Stripe covers all four launch countries; Square covers
   the US, Canada and UK and is clearly unavailable for New Zealand sellers.
   RepairPilot itself is openly priced at $0 for early access and currently has
   no SaaS subscription billing. Both payment drivers are explicitly off in
   Cloudflare; Square is set to Sandbox. Keep Cloudflare test-only and configure
   live payment credentials on the new server after it is provisioned. See
   [the provider setup guide](PAYMENT-PROVIDER-SETUP.md) for exact dashboard
   URLs, webhook settings, and secure Cloudflare secret setup.
4. Provision the destination server and decide whether PostgreSQL moves with
   the app or stays on PlanetScale. The current Worker, database and bucket are
   test resources; plan an export, restore, file migration, OAuth callback
   updates and end-to-end verification before production data is introduced.

These items do not prevent authenticated early-access testing. A public launch
that promises email notifications or password recovery should complete item 2.
