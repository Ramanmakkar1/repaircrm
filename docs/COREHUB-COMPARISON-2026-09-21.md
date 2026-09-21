# CoreHub versus RepairPilot

Reviewed September 21, 2026, using the user's Chrome browser and the current RepairPilot working tree.

## Conclusion

CoreHub's clearest advantage is a focused front-counter workflow: enter a walk-in repair in one form, see the repair stages together, and reach customer messages directly. RepairPilot already has substantial repair, inventory, billing, and automation functionality. Its best next investment is reducing the steps between those features, followed by filling specific retail and intake gaps.

This is a browser-and-source comparison, not an end-to-end certification. CoreHub's demo was empty, so transaction completion, actual message delivery, refunds, hardware operation, and populated ticket details were not verified. After the user signed in, RepairPilot's live dashboard, New Ticket, ticket list, POS, and inventory screens were also inspected. That shop had no tickets or products, so populated workflows remain unverified. Source findings include existing uncommitted work, which may differ from the deployed version. No application implementation, settings, customer records, or payments were changed during this review.

## Highest-value improvements

| Priority | Area | CoreHub evidence | RepairPilot evidence and recommendation |
| --- | --- | --- | --- |
| 1 | Walk-in intake | [New Ticket](https://demo.corehub.co.nz/pos/new) combines customer search/new contact fields, device, fault, quoted price, inspection choice, notification preference, pickup time, and terms. | Staff intake selects an existing customer and existing device. Worse, `app/(app)/tickets/new/page.tsx:80` calls `notFound()` when there are zero customers. Allow customer + device + ticket creation together, with duplicate matching. Keep technician, priority, and checklist choices available progressively. Public check-in already creates these objects, so reuse that capability rather than inventing another disconnected flow. |
| 2 | Shared inbox | [Messages](https://demo.corehub.co.nz/pos/messages) and [Emails](https://demo.corehub.co.nz/pos/emails) are direct destinations, with unread filtering and customer matching described on screen. | Inbound email/SMS handling already exists, attaches messages to tickets, and creates leads for unknown senders. Dashboard and ticket filters expose needs-reply tickets. Add a shared inbox over that existing data, with conversation previews, owner, unread/unanswered filters, and direct reply. This is mainly a workflow gap, not missing messaging infrastructure. |
| 3 | Repair work board | [Dashboard](https://demo.corehub.co.nz/pos) shows Booked In, Diagnosing, Awaiting Approval, Awaiting Parts, In Progress, Ready for Collection, and Unrepairable together. | RepairPilot has dashboard attention queues, status counts, and ticket cards, but no equivalent operational status-column board was found. Offer a Board view alongside existing views; preserve current layouts and saved filters. Distinct diagnosis/approval/unrepairable outcomes need deliberate behavior, not just added labels. CoreHub drag-and-drop was not verified. |
| 4 | Split payment at POS | [Quick Sale](https://demo.corehub.co.nz/pos/sale) exposes Split payment. | `components/pos/types.ts` defines one `method` per checkout. Deposits, store credit, and multiple invoice payments are not the same as splitting one POS sale across cash and card. Add tender rows with remaining balance, partial-failure recovery, and correct drawer/refund accounting. CoreHub's completed split transaction was not tested. |
| 5 | Fast repeated sales | Quick Sale has configurable quick picks, an exchange entry point, a sale-to-ticket option, today's sales, and copy promising printing without leaving the page. The Customize state visibly exposes product search for quick picks. | RepairPilot has barcode search, category tiles, custom items, serialized units, ticket-charge checkout, and a receipt screen. Add favourites and today's sales first. Current POS consumes existing ticket charges; it does not expose CoreHub's reverse flow of creating a new repair from a sale. Refunds exist, but a combined return-and-replacement exchange workflow was not found. |
| 6 | Promised pickup time | New Ticket has a date/time field and Today, Tomorrow, +3 Days, +1 Week shortcuts; settings expose a due-soon threshold in hours. | Staff ticket intake uses a date-only input. SLA calculations exist, so this is not a missing deadline system. Add explicit promised date/time and quick choices, then use one consistent definition across dashboard, tickets, and reminders. |

## Additional feature gaps

| Area | What CoreHub exposes | What RepairPilot currently has / lacks |
| --- | --- | --- |
| Courier repair intake | [Courier Bookings](https://demo.corehub.co.nz/pos/courier-bookings): send a one-hour customer form link; queues for awaiting customer, ready to receive, and recently received. | Public check-in and portal requests exist, but no dedicated expected-device/received-device workflow was found. Purchase-order shipping costs are unrelated. Add this if mail-in repairs are a target market. No carrier booking, shipping-label purchase, or tracking integration was verified in CoreHub. |
| Customer-requested appointments | [Bookings](https://demo.corehub.co.nz/pos/bookings): invite by SMS/email, pending decisions, confirmed/not-arrived, checked-in progression. | Staff calendar, appointments, conflict handling, and reminder jobs exist. No equivalent customer booking-request approval queue was found. Add request → approve → arrive conversion without duplicating customer/device records. |
| Damage reports | [Damage Reports](https://demo.corehub.co.nz/pos/damage-reports) lists unrepairable tickets and Analytics distinguishes reports not yet written. | Diagnostic notes, photos, attachments, and configurable statuses exist. No dedicated damage-report document or completion queue was found. Consider a structured printable report for shops that need written repairability assessments; the actual CoreHub report form could not be inspected with an empty demo. |
| Loyalty | Jobs & Payments settings expose every-Nth-visit and percentage discount values. | No loyalty model, calculation, or configuration was found. Store credit and marketing campaigns already exist, but are different features. Discount application in CoreHub was not tested. |
| Product variants and images | Products offers an image upload and colour selections to create variants. | Product schema has SKU, barcode, category, stock, vendor, serials, and warranty, but no parent/variant relationship or product image field. Photo identification in the current working tree identifies inventory; it is not catalogue photography or variant management. |
| Device catalogue | Staff intake offers device type, make choices, and a make-dependent model control. | Asset make/model are free-text inputs. Add searchable suggestions with a manual fallback if standardised device names would improve intake and reporting. |
| Existing email mailbox connection | Settings exposes incoming IMAP host, folder, login, and connection test, plus outgoing SMTP. | RepairPilot has provider-based inbound webhooks and outbound messaging. No equivalent IMAP mailbox connection was found. A shared inbox should come before adding another email transport. |
| Print setup previews | Printing settings show example receipt, quote, and invoice alongside configurable wording. | Print routes and thermal receipt styling exist. A comparable settings preview/editor was not found. Reuse the actual document renderer so preview and output cannot diverge. |
| Passcode retention | Intake explicitly says the device passcode is cleared on collection. | `markPickedUpAction` closes the ticket and logs pickup but does not clear `Asset.password`; no automatic clearing path was found in the reviewed source. Add a deliberate retention rule, accounting for other open repairs on the same asset. CoreHub's deletion behavior is a UI claim, not verified backend behavior. |
| Tax-inclusive retail prices | Business settings expose “Prices already include GST.” | RepairPilot's shared totals calculate tax on top of line subtotals. No equivalent inclusive-price mode was found. Relevant for NZ-style retail pricing; implementation must preserve historical invoice tax snapshots. |
| Conversational analytics | Analytics offers “Ask about this data” scoped to the selected period. | Reports already cover revenue, tender mix, invoice settlement, throughput, resolution time, products, refunds, and technician performance. The local AI assistant handles inventory and ticket lookup, not equivalent report questions. Lower priority than operational workflow improvements. CoreHub answer quality was not tested. |

## Features RepairPilot already has

Do not treat these as missing or rebuild them merely to imitate CoreHub:

- Tickets, customers, devices, estimates, invoices, POS, warranty handling, deposits, refunds, and store credit.
- Vendors, purchase orders, receiving, reorder thresholds, stock adjustments, and serialized inventory.
- Appointment scheduling, conflict handling, and automated reminders.
- Customer portal, estimate approval, public check-in, signatures, photos, attachments, and customer replies.
- Recurring invoices, time tracking, time clock, SLA jobs, marketing campaigns, and review requests.
- Branch locations, roles, audit logs, API keys, webhooks, saved views, search, and bulk actions.
- Stripe/Square payment and terminal implementations, plus QuickBooks/Xero integration code. These require configuration and validation; source presence does not prove they are live.
- Barcode scanning, camera/paired-phone scanning, and current local work on hardware scanning, voice inventory, photo identification, and an assistant. Uncommitted work is not necessarily deployed.

These are meaningful strengths in RepairPilot's implementation. The empty CoreHub demo did not establish that CoreHub lacks corresponding capabilities elsewhere.

## Usability assessment

CoreHub makes front-desk tasks prominent: Quick Sale and New Ticket are top-level navigation items, intake groups customer/device/job information in one place, and its main screen is immediately recognisable as a repair pipeline. The POS total and payment methods stay visible beside the sale, with today's sales nearby. These choices reduce navigation under counter pressure.

Its appearance should not be copied wholesale. The seven-column board is wide, the sidebar is long, and many empty states simply say “Nothing here.” Those observations do not prove a mobile defect; responsive behavior was not tested. RepairPilot already includes richer attention queues and more informative empty states in its components. Keep those strengths while improving task placement and continuity.

The subsequent authenticated review supports a more specific visual assessment: RepairPilot's neutral palette, grouped navigation, and consistent controls feel calmer than CoreHub's colourful rail. CoreHub's strongest advantage remains task placement and workflow continuity, rather than visual polish alone. Both shops were empty; this is not a comparison of dense, real-world workloads.

### Authenticated RepairPilot findings

- **New Ticket failure reproduced:** the dashboard's New Ticket action opened `/tickets/new` and displayed “We couldn't find that page.” This confirms the source finding in the deployed version for the current empty shop. The onboarding copy also says a customer can “arrive with a ticket,” which this staff path does not support.
- **Onboarding crowds out operations:** at the observed 1512 × 805 browser viewport, the expanded seven-step setup checklist occupies most of the dashboard's initial screen. Repair counts and attention queues are below it. Keep a compact setup-progress prompt on the dashboard and show the full checklist in the existing guide. The checklist is dismissible, but it was not dismissed during this read-only review.
- **POS payment actions below the fold:** at the same viewport, the drawer strip, large empty catalogue, and tall cart push Cash/Card/other tender buttons below the visible area. Reduce empty-cart vertical space and keep the total and payment actions visible together on counter-size displays. No claim is made about how a populated cart scrolls; that was not tested.
- **Ticket workflow confirmed:** the live screen exposes status tabs, Needs reply, search, filters, and saved views. It does not expose the proposed status-column board. The empty-state explanation is more useful than CoreHub's bare “Nothing here,” but its New Ticket action leads to the same first-customer blocker.
- **Local versus deployed features:** the live Inventory screen exposes scanning, vendors, purchase orders, import, and New Product. The local voice/photo/assistant additions were not visible on this screen or in the live shell. Do not present those local additions as verified deployed capabilities.

These observations strengthen the priority of fixing first-ticket intake, making onboarding compact, and keeping POS payment controls visible before adding specialised modules.

## Suggested implementation sequence

1. **Intake:** eliminate the zero-customer not-found case; add inline customer/device creation, device suggestions, promised date/time, and customer update preferences. Reuse public check-in logic and existing validation.
2. **Daily work:** add a repair Board view and a shared inbox backed by existing ticket/comment/communication data. Surface waiting-for-parts work directly; existing part orders are already implemented.
3. **Checkout:** favourites and recent sales, then split tender and a properly linked exchange flow. Test money, stock, refunds, and payment retries before enabling these.
4. **Customer arrival:** booking requests and optional courier receiving, tied to the existing appointment and check-in records.
5. **Specialised capabilities:** damage reports, product variants/images, print previews, and loyalty according to the shops being targeted.

Passcode cleanup deserves an early focused change alongside intake/pickup work. Tax-inclusive pricing becomes an early requirement if New Zealand retail is a launch market.

Separately, `docs/LAUNCH-STATUS.md` records that the test deployment's email sender and payment drivers still require production setup. That document was last reviewed September 12–13; live provider state was not rechecked. Configuration and end-to-end validation remain distinct from adding new features. CoreHub's demo also explicitly says its online Stripe payments are not switched on, so this review does not establish a working online-payment advantage for CoreHub.

## Local evidence map

- Intake: `app/(app)/tickets/new/page.tsx`, `components/tickets/ticket-form.tsx`, `components/customers/assets-card.tsx`, `app/checkin/[slug]/actions.ts`.
- Work queues: `app/(app)/dashboard/page.tsx`, `app/(app)/tickets/page.tsx`, `components/tickets/ticket-meta.ts`, `components/shell/nav-items.ts`.
- Inbox foundation: `app/api/inbound/_lib/inbound.ts`, `lib/needs-reply.ts`, `components/settings/inbound-card.tsx`.
- POS: `components/pos/register.tsx`, `components/pos/types.ts`, `components/pos/product-grid.tsx`, `components/pos/sale-complete.tsx`, `app/(app)/pos/checkout.ts`.
- Inventory/appointments: `prisma/schema.prisma`, `components/inventory/product-form.tsx`, `components/appointments/appointment-dialog.tsx`, `lib/jobs/appointments.ts`.
- Pickup: `app/(app)/tickets/actions.ts`, especially `markPickedUpAction`.
- Reporting/AI: `app/(app)/reports/page.tsx`, `app/(app)/assistant/actions.ts`, `lib/ai/assistant.ts`.
- Tax/printing/settings: `lib/money.ts`, `components/settings/shop-tab.tsx`, `components/billing/receipt-styles.ts`, `app/print/`.

No tests were run because this was a read-only product review with a documentation deliverable, not an implementation change.
