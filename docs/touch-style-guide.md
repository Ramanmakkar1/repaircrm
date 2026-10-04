# Repairs helper: touch / POS style guide

Every signed-in screen follows the Home screen (`app/(app)/counter/page.tsx`): it
should feel like a shop's register, not a back-office system. Staff are standing,
busy and non-technical. One screen, one decision, big targets, pictures where a
picture helps, plain words.

## Principles

1. **Pictures first.** Things you pick are shown as pictures (a device, a product,
   a person's initials), not as rows of text.
2. **One primary action per screen.** One black button (`Button` default). Anything
   else is outline or lives behind "More".
3. **Few choices at a time.** A tab row shows the 4-6 views people use all day;
   the rest sit behind one "More" or in the tab row's scroll. A card shows a title,
   one line, at most three facts, and one status.
4. **Big and calm.** Targets are 48px or taller (CSS lifts `a[data-slot=button]`
   and `a[data-touch-control]` to 48px in Easy mode). Titles 18px+, body 14px+.
   Plenty of space; no dense tables in Easy mode.
5. **Words, never colour alone.** Status always shows its word (StatusBadge /
   StatusPill). Counts are numbers in a pill, not just a red dot.
6. **Same vocabulary everywhere.** Repairs, Invoices, Customers, Stock, Sell,
   Home, Back, Settings. No "ticket" in Easy mode copy (use "repair").
7. **Nothing removed.** Easy mode reorganises; every feature stays reachable.
   Full mode (account menu) keeps the dense tables and bulk actions.

## Building blocks (use these, do not invent new ones)

| Need | Use | File |
| --- | --- | --- |
| Picture box on a hub | `PictureTile` | `components/counter/picture-tile.tsx` |
| Row of pill views (All / Unpaid / ...) | `FilterTabs` | `components/ui/filter-tabs.tsx` |
| A record in a list | `RecordCard` + `RecordGrid` | `components/ui/record-card.tsx` |
| Picture for a record | `PhotoVisual`, `InitialsVisual`, `IconVisual` | same |
| A small fact on a card | `MetaChip` | same |
| Status | `StatusBadge` / `StatusPill` | `components/ui/badge.tsx` |
| Page title + one action | `PageHeader` | `components/ui/page-header.tsx` |
| Empty list | `EmptyState` with `photo`, and `actionLabel` + `actionHref` | `components/ui/empty-state.tsx` |
| Device picture | `DeviceVisual` | `components/dashboard/device-visual.tsx` |
| Loading screen | `PageHeaderSkeleton`, `RecordCardsSkeleton`, `PictureTileGridSkeleton` | `components/ui/skeleton.tsx` |
| Focus a field on arrival | `useFineAutoFocus` (never bare `autoFocus` on a form) | `components/ui/auto-focus.ts` |
| A search field | `{...SEARCH_INPUT_PROPS}` (type=search, Search key) | same |
| "Done · Undo" | `toastWithUndo` | `components/ui/undo-toast.ts` |
| Open the search sheet from a page | `OpenSearchButton` / `openSearch()` | `components/search/open-search-button.tsx` |

Colours come only from the theme tokens in `app/globals.css` (`bg-surface`,
`border-border`, `text-muted-foreground`, `bg-accent`, `ring`, ...). No hex, no
`bg-white` (exception: the white canvas behind a product photo, which is shot on
white in every theme). Light and dark must both work.

## Page recipes

### Hub (a screen of boxes)
Title, one line, then a `PictureTile` grid (`grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`).
Every tile has a picture from `public/images/home` or `public/images/products`.

### List (Repairs, Invoices, Estimates, Customers, Enquiries, Stock, Orders, ...)
1. `PageHeader`: title, one short description, ONE primary action.
2. `FilterTabs` for the main views, with counts.
3. One large search field (min 48px) and, if needed, one "Filters" button.
4. Easy mode: `RecordGrid` of `RecordCard`. Full mode: keep the existing table.
5. Empty state that names the next action.
6. Pagination as two big buttons (Previous / Next) with "Page 2 of 5".

### Detail (a repair, an invoice, a customer)
Title + status badge + the single next action as a big black button, then simple
sections. No coloured side stripes. Facts as label/value pairs, not nested cards.

### Form (new repair, new invoice, new customer)
Already one screen with optional "more details". Keep it: at most four visible
inputs, everything else behind one toggle.

## Page headers (one system)

- **One title size.** `PageHeader` draws every list and form title at 22px on a
  phone and 24px from `sm`. A detail page that builds its own hero uses
  `PAGE_TITLE_CLASS` on its h1. Hubs (Home and the box screens) are 26px.
- **One way back.** The controls row's Back returns to where the person came
  from, with that list's filters (the Pickup counter, a filtered Repairs list,
  the customer they were on), and falls back to the screen above when there is
  no earlier screen in the visit. It says where it goes ("Back to Repairs").
  Do not add text back links ("< All invoices") or back chips in a page.
- **No breadcrumbs in Easy mode.** `Breadcrumbs` (and `PageHeader`'s
  `breadcrumbs`) are hidden in Easy mode by CSS; Full mode keeps them.
- **Nothing above the title.** The title is the first thing in the page, so
  it sits at the same height on every screen.

## The controls row, Needs you and search

- Back, Home, the shop (only with 2+ locations), Search, the **Needs you**
  bell and the account. All 48px.
- **Needs you** counts ready for pickup, customer replies, overdue repairs,
  new enquiries, unpaid invoices (not for technicians) and low stock. Home's
  list, the bell and the badge on the phone tab bar's Home all read the same
  counts (`components/counter/attention*.ts`), so they can never disagree.
- **Search** finds names, phones with any punctuation, and numbers written
  `1012`, `#1012`, `INV-1012`, `R-1012` or `repair 1012`.

## Touch, keyboard and the bottom of the screen

- Easy-mode touch rules live in `app/globals.css` under
  `[data-touch-workspace="true"]`. The attribute is on `<html>` while the app
  is open, so dialogs, sheets, menus and selects (portalled to `<body>`) get
  the 48px rules too. Do not re-add per-dialog size hacks.
- **No auto-focus on touch.** Focusing a field on arrival opens the on-screen
  keyboard over the picture choices. Use `useFineAutoFocus()` (focuses only
  with a mouse or trackpad), or check `prefersFinePointer()` in a Radix
  `onOpenAutoFocus`. A sheet the person opened *to type* (search) may focus.
- Search fields spread `SEARCH_INPUT_PROPS`; other fields set `enterKeyHint`
  (`next`, `done`, `send`) so the keyboard's return key says what it does.
- The viewport uses `interactive-widget=resizes-content`: fixed Next / Save /
  Pay bars ride above the keyboard.
- The bottom belongs to the phone tab bar, the flows' Next bars and the round
  Ask button (the wide Ask bar only shows on Home and its hubs, and steps back
  while a dialog is open or someone types). `<main>` keeps `--rf-dock-space`
  free at its foot. Toasts appear top centre, never at the bottom.

## Feedback

- **Toasts**: 16px, a 48px close, a 44px Undo. `toast.error` stays until
  closed and adds "Try again..." when the message does not say what to do.
  Use `toastWithUndo` for anything that can be put back (10 seconds, "Undo").
- **Taps**: every in-app link shows a slim bar across the top while the next
  screen loads; picture tiles also dim with a spinner (`LinkPending`). Give a
  route a `loading.tsx` built from the shared skeletons when it is slow.
- **Empty and error screens**: a picture, one plain sentence, one line of what
  to do and one big button. The in-app error and not-found screens follow it.

## Pictures

`public/images/products/*.webp` (device and part photos) and
`public/images/home/*.webp` (tile photos): 768x768 WebP on white, generic and
unbranded, with provenance in `docs/catalog-*-provenance.json`. A new picture
needs the same style (photoreal studio shot on white, no logos, no text).
