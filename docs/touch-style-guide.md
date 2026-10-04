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
| Empty list | `EmptyState` with a next action | `components/ui/empty-state.tsx` |
| Device picture | `DeviceVisual` | `components/dashboard/device-visual.tsx` |

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

## Pictures

`public/images/products/*.webp` (device and part photos) and
`public/images/home/*.webp` (tile photos): 768x768 WebP on white, generic and
unbranded, with provenance in `docs/catalog-*-provenance.json`. A new picture
needs the same style (photoreal studio shot on white, no logos, no text).
