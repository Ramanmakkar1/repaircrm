# Mobile screen review — 2026-10-01

Local authenticated owner session, using the demo shop. Reviewed at 390 × 844;
home also checked at 320 × 740, and desktop home/invoices at 1366 × 900.
No live shop deployment, payment, notification or inventory import was performed.

Note: the Home row below was reviewed against the Home layout of that date, which
grouped its boxes and kept Settings as a separate link. Home has changed since this
review (see [touch-workspace-design.md](touch-workspace-design.md) for the current
layout), and no 320 × 740 check of the current layout is recorded here.

| Area | Screens reviewed | Result |
| --- | --- | --- |
| Home and navigation | Home, tool boxes, compact header, bottom tabs | Small-phone home fits; everyday actions first |
| Repairs | List, new repair, PS5 intake, existing PS5 detail | Device-aware suggestions, optional contacts/identifiers, automatic summary, parts controls wrap |
| Customers | List, new, detail, edit, import entry | Phone cards, contact search, expandable extra fields |
| Inventory | Group overview, screen guards, all items, new, detail, edit | Group totals, visible quantities, quick creation, unit-aware controls |
| Stock adjustment | Increase screen protector; cancel | Full-width sheet shows 48 → 49, reason and note; no adjustment saved |
| Spreadsheet import | Paste, column mapping, generated codes, preview | Two synthetic rows: one valid; fractional quantity flagged; no products written |
| Billing | Invoices and estimates: lists, new, detail, edit; recurring list/new/detail/edit | Lists become labelled cards; existing desktop table retained |
| Scheduling and shop tools | Appointments, enquiries list/new/detail, reports, time clock, overview, display | Primary screens fit the phone width; overview works in Easy mode |
| Purchasing | Supplier list/detail; purchase-order list/new/detail; cash drawers | Primary screens and selected details fit the phone width |
| Marketing | List, new, detail, edit | Existing campaign controls remain available |
| Settings and assistant | Settings, assistant setup, assistant conversation | Phone sheets, live voice selected by default, voice settings expandable |

Read-only assistant test: “Find products screen cards” suggested the existing
Tempered Glass Protector, with its 48 units and product link. Approximate matching
is not used to authorize inventory changes.

Automated checks: 755 tests across 60 files, ESLint, TypeScript, production build
and git diff whitespace checks passed. Import tests include actual XLSX/XLS/ODS
buffers, numeric validation, row numbering, stable generated codes and initial
stock audit records.

Limits: local OpenAI API key is absent, so provider responses and live microphone
accuracy were not tested. Live browser recognition depends on browser support;
cloud transcription returns text after recording. Installation and device safe
areas still need validation on physical iPhone/iPad and Android devices after
an HTTPS production release. Store-distributed applications are not configured.
