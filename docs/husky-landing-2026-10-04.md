# Husky identity and landing page refinement — 4 October 2026

The user supplied their actual husky mascot after the earlier panda concept was deployed. This identity supersedes the panda. Their later requests also asked for a professional sans-serif font, organized footer, stronger SEO copy, clearer AI features and mobile/tablet access.

## Identity
Built-in image-generation editing mode was used with the supplied logo as the edit target and transparency enabled. The original reference and generated originals were preserved. Red brand accents were changed to blue, preserving the cheerful husky and RepairsHelper lettering. A companion head-only mark keeps navigation and app icons legible.

- Source: `/Users/raman/Downloads/RepairsHelper Husky Mascot Logo.png`.
- Transparent master: `public/brand/repairshelper-husky-blue.png` (1672×941).
- Master web export: `public/brand/repairshelper-husky-blue.webp`.
- Compact master: `public/brand/husky-mark-blue.png` (1254×1254).
- Compact web export: `public/brand/husky-mark-blue.webp` (256×256).
- Installable icons: `public/icons/husky-{192,512,apple}.png`; favicon: `app/favicon.ico`.
- Sharing image: `public/marketing/repair-shop-software-husky-og.png` (1200×630), laid out with the logo, product copy and licensed repair-film frame. This is a raster export, not a vector logo.

Full logo original: `/Users/raman/.codex/generated_images/01a107e0-2328-7823-bb6f-2c99e1492992/exec-89b2acaf-982e-4e69-842a-11bb59cf406e.png`.

Exact full-logo prompt:
> Use case: precise-object-edit
> Asset type: professional RepairsHelper mascot logo, transparent website-ready master.
> Input image: edit target, the user's actual husky logo. Preserve the recognizable cheerful black-and-white husky, blue eyes, mechanic cap and overalls, thumbs-up pose and large bold RepairsHelper wordmark.
> Primary request: redesign this logo to match the existing RepairsHelper website palette: royal blue #2563eb, near-black #111827 and white. Replace ALL red accents with royal blue: cap brim, wrench symbols, overall buttons, stitching, emphasis rays and the Helper lettering. Keep Repairs lettering near-black and Helper blue. Preserve exact spelling "RepairsHelper". Refine rendering and edge clarity; make the white outline and shadow subtler for a clean professional website identity. Retain the original composition and friendly character; no panda, no new characters or tagline.
> Background: genuinely transparent alpha, no white rectangular background, no checkerboard baked in. Center the complete logo with modest transparent margins, do not cut off ears or letters.

Compact original: `/Users/raman/.codex/generated_images/01a107e0-2328-7823-bb6f-2c99e1492992/exec-97eed933-0abd-470a-bdac-e7b68e9fd9d4.png`.

Exact compact-mark prompt:
> Use case: compositing / logo-brand
> Asset type: compact transparent mascot brand mark for RepairsHelper navigation and app icons.
> Input image 1 is the user's actual husky identity, image 2 is its approved blue recoloring. Create the compact companion mark from that SAME recognizable cheerful husky: head and neck only, both ears fully visible, blue eyes, near-black-and-white fur, black mechanic cap with royal blue #2563eb brim and small blue wrench emblem. Keep the face identity, expression, proportions and polished illustration style; center face upright with a clean compact silhouette and minimal fine fur detail so it is readable at small sizes. No body, hands, wordmark, rays, registration mark, outline sticker, shadows or unrelated character. Background genuinely transparent alpha with exceptionally clean edges and no stray pixels/checkerboard. Square composition, mascot large with modest 8% clear margins. This is a derivative of the existing brand, not a new animal design.

## Page
Manrope now provides all landing typography, including the hero. Its variable font is self-hosted by Next.js. The hero remains centered above the licensed repair film. The new device section shows actual app screenshots on tablet and mobile, with browser and supported home-screen installation copy. AI messaging distinguishes ticket summaries/reply drafts from the shop helper's lookups and commands. Provider configuration and permissions remain explicit.

The full-width footer organizes Product, Get started and Resources links, includes mobile/tablet access and the customer portal, and provides a clear free-start action and back-to-top link. No empty social destinations or invented support contacts are added.

## SEO
- Title: “Repair Shop Software & AI Helper | RepairsHelper”.
- Description: “Manage repairs, sales, inventory and customer updates with RepairsHelper and its AI helper. Works on mobile, tablet and desktop. Free during early access.”
- Canonical, Open Graph, Twitter sharing image, public sitemap and account-page noindex behavior retained.
- Truthful WebSite and WebApplication structured data describe the same visible product. No reviews, ratings or unsupported rich-result promise.
- One h1, named section h2s, semantic footer navigation, descriptive screenshot alt text and crawlable product copy.

Guidance inspected: [Google title links](https://developers.google.com/search/docs/appearance/title-link), [Google snippets](https://developers.google.com/search/docs/appearance/snippet), [software structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app), and the installed Next.js font, image and metadata guides.

## Previous release
The earlier Square-style hero release `59e0eb4` passed [CI](https://github.com/Ramanmakkar1/repaircrm/actions/runs/37234684522), with 4,496 unit tests and 8 PostgreSQL transaction checks. It was deployed to the VPS, verified active and healthy, and passed 21 HTTP endpoint checks plus two video byte-range checks. The pre-migration backup was `/var/backups/repairshelper/20261004T211207Z.dump`. This refinement preserves its signed-in Counter routing and stock-film behavior.

## Validation
TypeScript, ESLint and 4,497 unit tests (204 files, image checks enabled) passed before visual verification. Production build, responsive browser checks and final release evidence will be appended when complete.


Local production build passed. Browser verification used the standalone build and the isolated fictional demo database on port 5999. The actual assistant screenshot was refreshed as `public/marketing/app/assistant-husky-tablet.webp` (1024×768, 38,874 bytes). Desktop 1440, tablet 768 and phone 320 were checked for overflow, readable headings, footer organization and the footer device link. The 320px headline fits in two lines. The duplicated navigation signup action is omitted below 360px to keep the brand wordmark on one line; the hero signup action remains prominent.

## Features, Splitforms and product feedback
The user expanded this work to include a feature overview, the Splitforms partnership and a bug/feature reporting option. The feature section covers appointments/enquiries, customer portal, staff roles/PINs, branding/printing, imports/exports and AI tools. The Splitforms section uses the user-provided partnership description and the implemented shop-scoped webhook flow; it recommends the service for website lead capture without claiming it automatically creates customer accounts. [Splitforms](https://splitforms.com/) was inspected on 4 October 2026 to verify that webhooks require a paid plan. The section links to the existing referral URL and `/leads` connection screen.

Visitors can submit bugs, feature requests or other feedback at `/feedback`, linked from the homepage footer and signed-in account menu. Reports persist in the new platform-owned `ProductFeedback` table. Optional follow-up email and page references are entered by the reporter; signed-in attribution comes from the live account guard. Reports are not exposed to other shop users. Only separately authenticated platform admins can read the inbox at `/platform/feedback` or change New/In review/Closed statuses. Submissions have server-side validation, per-IP rate limiting, a honeypot and a recoverable storage-error message. No emails or third-party feedback services are used. The privacy policy describes the submitted information.

The additive migration `20261004220000_product_feedback` applied successfully to the isolated preview database. Unit coverage exercises validation, missing/invalid IDs, throttling, spoofed attribution, DB failures, authorization and HTML escaping. The full local suite passed 4,509 tests in 205 files, with no skips. TypeScript and ESLint passed after correcting one test fixture type; the production build and final browser evidence are recorded below.
