# Touch workspace

Repairs helper starts Easy mode at `/counter`, with six large task boxes:
Repairs, Invoices, Sales, Customers, Products & parts, and Appointments.
Each opens its own workspace with plain-language actions. More tools & settings
keeps reports, marketing, time clock, estimates, display and settings available.
The full workbench remains an explicit, remembered choice on each device.
Old cookies that inherited the former Full view default move to the task home
once; subsequent view choices stay remembered.

The signed-in shell has no website masthead, navigation tabs or footer.
Home and Back live in the workspace. Guided entry uses its own Back button to
avoid two buttons with different meanings. Easy controls are at least 48px;
phone and tablet inputs use 16px text. Backgrounds remain solid white, with
black primary actions and blue navigation accents.

New repairs use Customer → Device & repair → Review & save. New invoices use
Customer → Items → Review & save. Every stage remains mounted so Back retains
entered details. Validation returns users to the relevant stage. Additional
options stay available in expandable sections, and the invoice item editor uses
touch cards. Full view retains the existing editing layout and all features.

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
