# Repairs helper production

Live application: https://repairshelper.com. Source remains in the existing Ramanmakkar1/repaircrm GitHub repository.

## Where data lives

- Website and server code: `/srv/repairshelper/releases/<release>/.next/standalone` on VPS `103.118.17.152`; `/srv/repairshelper/current` selects the active release. Node listens privately on port 3020 behind nginx HTTPS. UI Discovery remains on its separate port 3300 and service.
- Business records: local PostgreSQL database `repairshelper`, with its own unprivileged database role and Linux account.
- Attachments: existing private Cloudflare R2 bucket `repairpilot-uploads-prod`, accessed using an S3 credential restricted to this bucket and the VPS IP. Existing attachment paths are preserved.
- Mail: Hostinger `noreply@repairshelper.com` for login codes/reset and transactional mail, `welcome@repairshelper.com` for onboarding, and `support@repairshelper.com` for replies. SMTP uses verified TLS on port 465. Credentials are in `/etc/repairshelper/app.env`, root-owned and readable by the app group, never in Git.

## Deploy and recover

The existing GitHub CI checks migrations, types, lint, tests, and production build. Deployment is explicit; pushing does not deploy the legacy Cloudflare application.

Extract a reviewed source archive under `/srv/repairshelper/releases/<release>`, then run as root:

```sh
/usr/local/sbin/repairshelper-deploy /srv/repairshelper/releases/<release>
```

The deployment script installs/builds as the restricted app user, takes a database backup, applies migrations, switches the runtime symlink, and verifies `/api/health`. On a failed health check it restores the previous code symlink. Database migrations remain applied: review compatibility before a code rollback. Keep previous releases for recovery.

```sh
systemctl status repairshelper
journalctl -u repairshelper --since '15 minutes ago'
/usr/local/sbin/repairshelper-backup
systemctl list-timers repairshelper-backup.timer
```

Daily PostgreSQL backups run at approximately 03:15 UTC and retain 14 days in `/var/backups/repairshelper`. The initial source import is preserved. A full dump was restored into an isolated verification database on 2026-09-30; 53 tables, 8 users and 5 tickets were verified. These backups are on the VPS; an off-server copy should be arranged for protection against VPS loss.

HTTPS certificates renew with certbot webroot at `/var/www/letsencrypt`; the deploy hook validates and reloads nginx after renewal. `ops/nginx.conf` is the final HTTPS configuration and assumes the certificate has already been issued.

## Migration record

The original source had 50 tables and 127 rows including 14 migration records. Every imported row was compared to the source. After the old Worker entered maintenance and its cron was disabled, a fresh repeatable-read export matched the initial snapshot exactly. Three outstanding migrations were then present on the destination, including the email-code table. Source backups remain private; do not commit them.

The old `repairpilot.townmedialabs.workers.dev` Worker now redirects to the new HTTPS origin, with no database binding or cron. `ops/legacy-worker` is its redirect-only configuration. Webhook providers should have their callback URL updated explicitly; not all providers follow redirects.

The owner approved permanent source retirement on 2026-09-30. PlanetScale now shows no databases, and Cloudflare confirms Hyperdrive configuration `2823d25269e04680b92cc38e07a25400` was deleted. Previously accrued charges remain payable; ongoing source database compute has been removed. Rollback now requires restoring a saved dump to PostgreSQL. Private migration exports and a PostgreSQL dump are also retained on the owner’s Mac at `~/.local/share/repairshelper/private`, outside Git. `npm run cf:deploy` deploys only the legacy redirect Worker; it no longer deploys the old application.

## Design and authentication

The landing page implements Figma file `WMyZIhUH6GhWtULNXP7OrK`, frame `10:2`, using exported assets in `public/marketing/figma`. User-requested white backgrounds and solid black/blue colors override the reference gradients/tints. UI Discovery references inspected: shadcn dashboard and Ramp hero.

The image-only badge is AI-generated: a solid blue shield with a negative-space wrench/check symbol, without lettering, gradients, shadow, or mascot details. Final generated asset source: `01a0f30d-482c-7aa3-9680-8ecd4e3b0729/exec-56f10557-9f59-4449-ad35-c6808811d6b1.png`. WebP and app icon variants are under `public/brand` and `public/icons`.

The application workspace implements Figma file `v3kr0p5xolbavbXxBli0YX`, visual POS frame `36:604` and repair workbench frame `36:605`. The signed-in app has no side or top menu; tools are reached from Home (its tabs, and More tools for the longer list). The photo catalog uses live prices and stock; all original serial, ticket, customer, tax, and payment flows remain connected.

The signed-in app is a touch workspace (see `docs/touch-workspace-design.md`). A controls row provides Home, Back, Search and the account menu, and phones add bottom tabs for Home, Repairs, Sales (Customers for technicians), Stock and Assistant. Home is `/counter`: New repair and New sale are pinned, a Needs attention list sits under them, a Today strip (takings, owed, ready for pickup; opens the Shop overview at `/dashboard`) sits above three tabs (Counter, Stock & purchasing, Shop management) that hold the tiles; Settings is a separate row, and the longer tool list, including Shop overview, is under More tools (`/counter/tools`). The last tab used is remembered per device. Easy mode (48px touch controls, card lists on phones) is the default per-device preference. Account menu → Full workbench turns it off on that device and opens Shop overview (`/dashboard`, titled Repair workbench); Easy mode (task boxes) in the same menu turns it back on and returns to Home. Both views use the same records and role checks.

Product photos use the existing private attachment storage and `/files/<id>` endpoint. The additive product-photo migration associates an attachment with a product without changing existing customer or ticket files. Photos can be selected when creating a product, or uploaded, replaced, and removed on its detail/edit page. Uploads accept signature-validated JPG, PNG, and WebP files up to 5 MB, enforce current account validity and shop ownership, and appear consistently in POS, cart, and inventory. Products without exact photos use explicitly labeled category illustrations where available; services and unknown categories retain meaningful icons.

Email codes last ten minutes, are HMAC-hashed with the application secret, allow five attempts, and are single use with a database row lock. Login codes preserve two-factor requirements. Reset codes issue the existing short-lived reset token. Unknown/disabled addresses receive the same public response. Sender authentication was verified with real delivery and SPF/DKIM/DMARC passing.

Reverse-proxy redirects use the configured `APP_URL` rather than the private Node request origin, including Google callback, logout and portal entry. Runtime scheduled jobs retain the original 15-minute cadence; builds explicitly disable the timer.
