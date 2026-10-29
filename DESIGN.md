# Repairs helper design

The app serves busy repair counters under normal shop lighting. White surfaces, clear black primary actions, the blue-accented husky mechanic mascot, picture tiles and touch-sized controls keep the next task easy to find. Counter is Home in both display modes; Shop overview remains a separate destination.

## The signed-in app

These are the values in `app/globals.css` today; the code is the source of truth and this section follows it.

- **Canvas, rail and cards are all white** (`--background`, `--sidebar-bg`, `--surface` = `#ffffff`). Hairline borders (`--border` `#e3e8ee`, `--border-strong` `#cfd7e3`) separate things; shadows are only for what floats (menus, dialogs, the Ask dock).
- **One black primary.** `--accent` is `#111111` with white text: the single primary button on a screen, the selected tab or chip, the active rail row. Everything else is outline or soft.
- **Blue is for small accent text and focus only.** `--accent-soft-foreground` `#0058d6` on `--accent-soft` `#f3f6ff` (5.8:1); `--ring` `#006aff`. No blue buttons in the app.
- **Text.** `--foreground` `#111214`; `--muted-foreground` `#565a60` (6.6:1 on white); `--faint-foreground` `#686d75` (5.2:1). Danger text `--destructive` `#b91c1c` (6.5:1 on white, 5.3:1 on its soft tint).
- **Status** keeps six hues (new blue, in-progress amber, waiting violet, ready teal, resolved green, overdue red). Each pill is a tint with a darker same-hue word and a dot, and every word is at least 4.5:1 on its tint in light and dark mode. Status always shows its word.
- **Shape.** Radii 6px (controls), 8px (cards, tables), 12px (dialogs, picture tiles); `rounded-full` only for avatars, dots and count bubbles.
- **Two densities, one palette.** Easy mode (the default) follows `docs/touch-style-guide.md`: 48px targets, picture tiles, cards instead of tables, the five-tab bar on phones and tablets and a slim rail from 1024px. Full view is the Stripe-like dense mode: tables, a grouped rail from 768px (icons only below 1280px), and 44px targets on touch screens.
- **Pictures** come from `public/images/{home,products,catalog}`: studio shots on white, and no two tiles on one screen share a picture (`tests/hub-pictures.test.ts`).

## The public homepage

The public homepage takes its organization from the user’s Square and Stripe references. Its centered Manrope hero has paired calls to action above a wide, self-hosted phone-repair film. Manrope provides consistent typography for navigation, product sections and forms. Use Manrope for the hero as well, with bold, compact headlines. Keep headings short, spacing deliberate and the product easy to explore.

A dedicated device section shows the actual workspace on tablet and mobile. A keyboard-accessible product explorer connects Counter, repairs, sales, stock and shop overview. Customer drop-off and pickup scenes are clearly illustrative; app screenshots use fictional demo records. Avoid invented dashboards, metrics, reviews and customer claims. The user’s cheerful husky mechanic is the brand identity, with a blue cap brim and wrench. Use its compact head mark in navigation and app icons; the full mascot and wordmark are available as a transparent master.

The homepage (only) uses white, cool neutral (#f4f6f8), dark ink (#111827), and blue (#2563eb). Blue buttons and small text use darker variants for contrast. These colours are scoped to the landing styles and are not the app's tokens. The assistant section uses navy (#13243d). Sections share a continuous page rather than repeated rounded panels. Screenshots remain uncropped and legible.

Landing styles stay scoped under `.site`. Hero height follows its content. The video has a pause control and a responsive poster; reduced motion, data saver and slow connections use the still image. Mobile navigation closes on selection or Escape. Preserve semantic headings, visible focus and the GET email-prefill signup form.

Stock source, license, logo-generation prompt and verification evidence: [landing refresh](docs/square-landing-2026-10-04.md).

Latest husky identity, typography, footer and search copy: [landing refinement](docs/husky-landing-2026-10-04.md).
