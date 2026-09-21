# RepairPilot feature implementation

Scope authorised September 21, 2026: implement gaps identified in the CoreHub comparison, including the speak-or-type assistant. Preserve existing working-tree changes. Configuration, migrations, and deployment must be reported separately from source implementation.

- [x] Visible assistant with typing, microphone, provider status, and transcript review
- [x] Automatic SKUs for new products and Quick Add; optional custom code; preserve existing codes during edits
- [ ] One-screen customer/device/ticket intake, duplicate handling, device suggestions, promised time, notification preferences
- [ ] Compact onboarding and counter-sized POS layout
- [ ] Repair board and parts queue
- [ ] Shared inbox, read/unanswered state, assignment, reply
- [ ] Split POS payments and recovery
- [ ] POS favourites, today's sales, sale-to-ticket, linked exchanges
- [ ] Customer booking requests, invitations, approval, arrival
- [ ] Courier intake links and receiving queue
- [ ] Structured printable damage reports
- [ ] Loyalty settings and applied discounts
- [ ] Product images and grouped variants
- [ ] Mailbox receiving connector
- [ ] Print configuration with previews
- [ ] Passcode retention on pickup
- [ ] Tax-inclusive pricing without changing historical documents
- [ ] Questions over scoped report data
- [ ] Type checks, relevant tests, build, and browser verification

Do not mark a feature complete based only on a visible button. Each feature needs its authorised, tenant-scoped server behavior and a usable UI.

## September 21 review release

OpenAI is configured using a Worker secret, excluded from Git and the generated deployment bundle. A live authenticated inventory lookup succeeded; a synthetic speech sample was transcribed by OpenAI. Interpretation checks handled repeated words, an explicit quantity correction, and a Hindi/English price command. These checks do not establish accuracy for every accent or noisy microphone.

The assistant currently supports inventory additions/search/stock/prices/removal and ticket lookup. It does not yet operate all shop modules or maintain conversational context. Remaining competitor features above are still open.

The new-ticket page now renders for an empty shop, supports inline customer/device creation and pickup time shortcuts. Per-ticket notification preferences remain pending; the existing customer communication settings still govern delivery. Setup checklist is collapsed by default. Barcode label count handles an empty value and SKU edits retain existing printed codes.

Validation: full 519-test suite passed, then two added SKU edit regression tests passed; lint, Next production build, Cloudflare build and packaging passed. Live browser checks covered the assistant response and automatic-SKU form. Production test sales or customer messages were not created.
