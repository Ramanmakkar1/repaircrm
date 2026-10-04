# Touch workspace

Home is `/counter`, laid out like a register. A start panel holds New repair and
New sale as two large pinned buttons, with a Needs attention list under them:
tappable counts for Ready for pickup, Overdue repairs, Unpaid invoices and Low
stock. Only items with something waiting are shown, each with its number as text
so nothing depends on colour, and an empty list reads "All clear". On wide screens
the panel is on the left and the tabs sit beside it; on phones they stack.

Three tabs group the shop's picture tiles, each with a plain name and one line of
live detail (phones show the short names Counter, Stock and Shop):

- Counter: Repairs, Pickup & pay, Take payment, Add customer, Find customer, Book a
  visit.
- Stock & purchasing: View & add stock, Low stock, Add product, Purchase orders,
  Suppliers, Import stock.
- Shop management: Money, Reports, Time clock, Shop display, Marketing, More tools.

Settings is a separate quiet row, not a tile: at the bottom of the panel on wide
screens and under the tabs on phones. The last tab used is remembered per device in
the `rf_home_tab` cookie; a `?tab=` value of `counter`, `stock` or `shop` in the
address opens that tab instead. Owners also see the Set up your shop checklist
below the tabs until it is finished or dismissed.

More tools (`/counter/tools`) is the tile that opens the longer list: Shop settings,
Reports, Marketing, Time clock, Shop display, AI assistant settings, New estimate,
Shop overview (the old dashboard at `/dashboard`), Enquiries, Purchase orders,
Suppliers, Import stock, Import customers, Cash drawers and Recurring bills.

Role restrictions still apply. Technicians do not see Take payment, Money or the
Unpaid invoices count (nor Import customers and Recurring bills under More tools).
Owner-only items (Purchase orders, Suppliers and Import stock, plus AI assistant
settings and Cash drawers under More tools) are hidden from other roles. Full
workbench (account menu) is an explicit, remembered choice on each device; it opens
Shop overview and turns Easy mode off there, and Easy mode (task boxes) in the same
menu turns it back on and returns to Home.

There is no side or top menu and no website masthead or footer. A controls row
holds Back and Home (hidden on Home itself), Search and the account menu, plus a
branch switcher when the shop has several locations.

Phones have a compact header and persistent Home, Repairs, Sales (Customers for
technicians), Stock and Assistant navigation. The header and navigation remain
visible while the page scrolls. Safe-area spacing supports installed use. Action
dialogs become full-width bottom sheets. Controls target 48px; inputs use 16px
text. Surfaces stay white, with black primary actions and blue navigation accents.
Easy-mode list tables become labelled cards on phones, keeping balances, statuses,
quantities and actions visible. Desktop lists retain their table layout.

Repair, invoice and estimate creation default to one-page quick entry. Optional
step-by-step guidance remains available and retains entered values. Optional
information is expandable. Repairs accept any device, with Phone, Tablet,
Laptop, TV, PS5, Xbox, Switch and Other boxes and device-specific suggestions.
Email, device model, serial/IMEI and unlock code can be left blank.

New inventory puts item name, price and quantity first; photo, cost, barcode,
supplier and other options remain under More details. Inventory begins with
stock group boxes and real quantities. Selecting a group brings its items and
stock controls forward; changing a group uses a compact disclosure. Stock
adjustments keep validation, reasons and audit records.

Imports accept Excel, OpenDocument, CSV, TSV and pasted Google Sheets cells.
Column matching shows core fields first and preserves extra mappings in More
columns. AI matching is optional. Preview validates values before saving.

The installed web app starts at `/counter`. Installation prompts are captured
at shell mount, with instructions available for browsers requiring manual
Add to Home Screen. This is an installable web app; store distribution has not
been configured. Live data still needs a connection.

## Inspected UI Discovery references

- [Affirm review flow](https://uidiscovery.com/sections/ios-affirm-aug-2026-36):
  concise review rows, clear back navigation and a prominent final action.
- [Wise task shortcuts](https://uidiscovery.com/sections/ios-wise-1):
  recognisable action shortcuts. This reference is App Store marketing art,
  used only for the visible shortcut pattern.
- [Shadcn Admin](https://uidiscovery.com/sections/app-shadcn-admin-1):
  restrained white surfaces, clear type hierarchy and spacing. The user's
  requested box navigation replaces its sidebar and masthead.

## Photo library

31 optimised category images cover phones, tablets, TV, gaming, drones,
common repair parts and accessories. Uploaded product and intake photos have
priority. Illustrations are labelled as category/device images rather than an
exact model. Unsupported catalogue items trigger the licensed internet fallback
with bounded lookup, cached files, source credit and a removal control.

Prompts and generated-image provenance are saved in
`catalog-image-provenance.json`, `repair-parts-image-provenance.json`,
`catalog-expanded-mobile-tv-provenance.json` and
`catalog-expanded-games-drones-provenance.json`. New assets were generated
individually with built-in image_gen, inspected, then exported as 768px WebP.
