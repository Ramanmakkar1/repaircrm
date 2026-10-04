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

Release verification will be recorded after publication.
