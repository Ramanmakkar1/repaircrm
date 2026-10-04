# Counter home and public homepage update

Requested 4 October 2026: use the pictured Counter screen after login and for
existing sessions, and improve the public homepage while preserving its hero.

## Behavior

- Root and Login send existing sessions to Counter in both display modes.
  Entry uses `/counter?tab=counter` so a remembered Stock/Shop tab cannot
  replace the pictured Counter screen. Other returns can still remember a tab.
- Normal sign-in defaults to Counter. Two-factor verification carries that
  destination through. An explicit repair/document deep link stays intact.
- Full view and Shop overview remain available as deliberate tools.
- Preserve the owner's sky-video hero and typography. Replace the illustrative
  metrics/form cards with actual counter screenshots and a demo-data caption.
- Use app blue, white, cool slate and a navy signup section. Simplify section
  boundaries and device frames; retain real product screenshots and photos.
- Stack the final signup form on phones. Preserve reduced-motion/data-saver
  video behavior, accessible navigation, FAQ disclosures and provider caveats.

## Verification

- 202 test files, 4,510 tests passed, no skips (CHECK_CATALOG_IMAGES=1).
- Nine new entry-routing regressions cover existing sessions with Full view,
  signed-out marketing, default and unsafe destinations, repair deep links,
  two-factor handoff and failed authentication.
- Types, lint and isolated production build passed.
- Browser checks at 320, 390, 768 and 1440px: no page/heading overflow or broken
  loaded images. Mobile menu, Product/Pricing links and FAQ disclosures work.
- Browser verification uses local demo imagery; no real payment, credential,
  logo or notification setup is submitted.

## Live release

Release `a01704fc33d2d12deb10986f72eb68b032385ecc` is live at
https://repairshelper.com. [Release CI](https://github.com/Ramanmakkar1/repaircrm/actions/runs/37228150485)
passed 4,510 tests and 8 real PostgreSQL checks, migrations, types, lint and build.

The standard server deployment completed successfully. Runtime points to
`/srv/repairshelper/releases/a01704f/.next/standalone`; the service is active and
health returns `{ "ok": true }`. No migrations were pending. The deployment
backup is `/var/backups/repairshelper/20261004T193205Z.dump`.

Nine live HTTP/asset checks passed: health, public homepage, the login form's
`/counter?tab=counter` destination, privacy, terms, hero video, counter screenshot,
unauthenticated attention protection, and the new blue landing stylesheet.
The live public homepage was checked in Chrome and its screenshot saved as
`verification/homepage-2026-10-04.png` in the parent project folder.

The verification browser was signed out. Authenticated root/Login entry and
password/two-factor destinations are covered by regression tests; no live
credential, payment, logo or notification submission was used for this release.

Core solid-surface text/action combinations have contrast of at least 6.5:1
(blue button 6.53:1; muted slate copy 7.34:1; navy section copy 11.96:1).
This is palette verification, not a claim of a complete accessibility audit.
