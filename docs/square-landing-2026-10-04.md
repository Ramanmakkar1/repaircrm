# Public landing page and panda symbol — 4 October 2026

The user requested a professionally organized landing page inspired by Square and Stripe, then specifically chose Square’s centered hero with a video beneath the headline. Signed-in users continue to enter Counter at `/counter?tab=counter`.

## References inspected

- [Square POS](https://squareup.com/us/en/point-of-sale): centered display headline, paired calls to action, wide film, browsable product sections.
- [Stripe Canada](https://stripe.com/en-ca): clear content hierarchy, concise product modules and deliberate spacing.
- [Manrope font specimen](https://fonts.google.com/specimen/Manrope): the public page’s product-label typography. Instrument Serif is retained for the hero alone.

The implementation uses Repairs helper’s own copy, blue identity and actual app screenshots. No Square or Stripe imagery or brand assets were copied.

## Stock film and license

- Source: [Man repairing a broken phone](https://www.pexels.com/video/man-repairing-a-broken-phone-6754828/), by Tima Miroshnichenko on Pexels.
- Download resolved from that page: `https://videos.pexels.com/video-files/6754828/6754828-uhd_3840_2160_25fps.mp4`.
- [Pexels license](https://www.pexels.com/license/) inspected on 4 October 2026: permits free use and modification on websites, without required attribution. People and brands in the footage must not be presented as endorsing the product. The page credits the filmmaker and makes no endorsement claim.
- Encodes: seconds 4–20, 16 seconds, H.264, silent, fast-start MP4. Desktop 1600×900 approximately 1.3 MB; mobile 960×540 approximately 419 KB.
- WebP posters: 1600×900 approximately 72 KB; mobile 960×540 approximately 35 KB.
- Files: `public/marketing/repair-film/repair-{desktop,mobile}.mp4` and `repair-poster{,-mobile}.webp`.
- Native responsive poster loads immediately. Video gets a source after hydration only if reduced motion is off, data saver is off and the reported connection is faster than 3G. Pause/play is keyboard accessible. Playback failure preserves the poster. The video has no audio or informational text; its scene is described by the poster’s alt text.

## Logo

The final mark is a flat geometric panda head with a blue wrench integrated beneath its face. It is drawn as a small, scalable SVG, with a transparent 1024px PNG export. Website, authentication, app marks, favicon and installable icons share the same symbol.

- `public/brand/panda-symbol.svg`: master scalable symbol.
- `public/brand/panda-symbol.png`: transparent 1024px raster export.
- `public/icons/symbol-{192,512,apple}.png`: padded app icons.
- `app/favicon.ico`: browser icon.

A concept was generated using the built-in image-generation tool with transparency enabled. The final geometric SVG was then constructed in code and exported with Sharp. Previous mascot assets are preserved but are no longer the active identity.

Exact concept prompt:

> Use case: logo-brand. Create a single professional logo symbol for Repairs helper, business software for independent repair shops. A minimal geometric panda HEAD only, cleverly integrating a small wrench shape into the negative space under the face or chin. Two rounded ears, two bold eye patches, no pupils or eyebrow lines, calm balanced expression, no body, paws, apron or cartoon detailing. Swiss identity design quality: strong silhouette, flat near-black #111827 shapes, white negative space, compact balanced construction, instantly readable at 24px. One restrained royal blue #2563eb detail in the wrench is allowed if it strengthens the concept. It should feel like a serious software brand symbol, not a cute illustration. Show ONE finished mark centered and large on a genuinely transparent background. No words, letters, mockups, texture, gradients, shadows, 3D, rings, crests or presentation board.

Original generated concept: `/Users/raman/.codex/generated_images/01a107e0-2328-7823-bb6f-2c99e1492992/exec-f34e41f2-127b-413e-a1a0-c4e3886eba1e.png`.

## Page behavior

Five product tabs show Counter, Repairs, Sales & payments, Stock & purchasing and Shop overview. They support roving keyboard focus, arrow keys, Home/End and direct section links. Only the selected panel is visible. Screenshots are labeled as actual app views with demo data. Customer handover photos remain clearly illustrative. Provider setup and early-access pricing limitations stay explicit. The final form remains a GET request to `/signup?email=...`.

## Search and responsive polish

The recreated hero says “Repair shop software. Built for your counter.” Copy names actual workflows and outcomes, including drop-off and pickup. The layout stacks product and assistant content on tablets, uses a horizontal tab list on phones, and provides large call-to-action controls on narrow screens.

The homepage has a descriptive title, meta description, canonical URL, Open Graph and Twitter image, and truthful `WebSite` JSON-LD. A public-only sitemap includes the homepage, privacy and terms. Account and workspace pages inherit `noindex`; the three public pages explicitly allow indexing. The robots file permits page-rendering assets and excludes API endpoints.

Guidance inspected: [Google site names](https://developers.google.com/search/docs/appearance/site-names), [Google snippets](https://developers.google.com/search/docs/appearance/snippet) and the installed Next.js metadata, video, robots and sitemap documentation. These changes provide crawl and sharing information; they do not promise a search ranking.

The sharing image is `public/marketing/repair-shop-software-og.png` (1200×630), composed from the final vector logo, product copy and a frame from the licensed Pexels film. The assistant screenshot was refreshed at its native 1024×768 viewport from a separate, temporary PostgreSQL demo database on loopback port 5999, using fictional seeded records. Its versioned asset is `public/marketing/app/assistant-panda-tablet.webp`.

Validation and release evidence are recorded below after verification.

## Local validation

- Node 22.23.3: TypeScript, ESLint and production build passed.
- Unit suite: 204 files, 4,496 tests passed, with catalog-image checks enabled and no skips.
- Browser checks: desktop 1440, tablet 768/1024 and phones 320/390 have no page overflow. The narrow-phone headline was adjusted to keep a compact layout.
- Verified silent playback, pause/resume, pause persistence across resizing, mobile video/poster selection, product-tab keyboard navigation and stock deep links, mobile-menu Escape and focus return, signup GET email route, and the new assistant symbol using fictional demo records.
- Reduced-motion/data-saver/slow-network decisions passed automated tests. Browser emulation of reduced motion was not performed: the browser permission review rejected the raw debugging command. No bypass was attempted.
- Signed-in demo login entered `/counter?tab=counter`; public landing behavior was checked while signed out.

Release and live smoke evidence follows after deployment.
