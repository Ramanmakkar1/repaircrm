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

## Panda branding and landing-page rebuild — October 4, 2026

The owner requested a substantial reorganization, keeping the approved hero
headline and typography but removing the sky/video background. The page now
uses a solid pale blue hero and an eight-section story: customer drop-off,
repair work, pickup, sales and stock, assistant, pricing, questions and signup.
Two generated photoreal handover scenes are labeled as illustrative. Actual
app screenshots retain demo-data captions. No customer endorsements or metrics
were invented.

The new transparent panda repair mascot holds a screwdriver and wrench. Shared
website/app marks, browser favicon, install icons and offline branding use it.
Customer-uploaded shop logos are unaffected. PNG/WebP assets and exact generation
prompts are documented in `BRAND-ASSET-PROMPTS.md`.

Validation before release:
- 202 test files, 4,490 tests passed with catalog-image verification enabled.
- TypeScript and ESLint passed; production build passed.
- Production browser preview had no console errors. Layouts fit at 320, 390,
  768, 1024 and 1440 pixels with no horizontal overflow. Mobile navigation
  opens, closes on selection, and returns focus to Menu after Escape.
- Counter login-entry regression tests remain passing. This redesign does not
  change authentication or entry routing.

The smaller test count reflects removal of obsolete sky-video, ornamental gauge
and exact old layout assertions; remaining landing tests cover the new page,
links, landmarks, imagery, pricing caveats and signup behavior.

Release verification:
- Live source: `73090ba8f75a11595d4bb0e2e40352e8cf1bad16` at
  https://repairshelper.com.
- CI passed: https://github.com/Ramanmakkar1/repaircrm/actions/runs/37231815623
  (4,490 unit tests, 8 real PostgreSQL transaction checks, migrations, types,
  lint and build).
- Server release `/srv/repairshelper/releases/73090ba/.next/standalone` is active
  and healthy. All 21 migrations were already applied.
- Backup: `/var/backups/repairshelper/20261004T203118Z.dump`.
- Twelve live HTTP checks passed: public page, health, login, legal routes,
  handover photos, panda mark, icon, favicon, manifest and authenticated-API
  rejection. The anonymous live browser showed the new brand and page without
  console errors. Authenticated entry remains verified by regression tests.
- Live proof images are saved in the workspace `verification/` directory as
  `panda-homepage-hero-2026-10-04.jpg` and
  `panda-homepage-shop-2026-10-04.jpg`.
