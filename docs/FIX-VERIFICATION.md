# Independent verification of FIX-LIST.md

Started 4 October 2026. The owner stopped the other implementation sessions and
asked this session to take over every fix and build all section D features.
This report separates local evidence from release and physical-device checks.

**Latest local result:** 200 test files, **4,498 unit tests passed (no skips)**;
**8 real PostgreSQL integration checks passed**; TypeScript, lint, production build
and `git diff --check` passed. The isolated credential-free production build covers the real job instrumentation.
All 1,453 captured source-file hashes match the shared working tree.
Release status is recorded below. Historical runs follow for traceability.

## Initial checks

- Existing suite: 151 files passed, 6 failed; 3,867 tests passed, 19 failed, 1 skipped.
- TypeScript: the `tests/dashboard-render.test.ts` fixture lacks the new required
  `TodaySection.weekHref` property.
- Lint: passed.
- Diff whitespace check: passed at the time of inspection.
- No changes have been deployed by this verification session.

Several existing failures reflect intended UI changes (accessible pickup button
names, the weekly Reports link, contextual Back destinations). Update those tests
to check the new behavior; retain tests of visible labels and accessible repair context.
Purchase-order tests also need a shop-timezone database fixture. The dashboard
due-today test should check the exclusive next-shop-midnight boundary (`lt`), not `lte`.

## Reproduced issues and correction status

1. **Corrected: CSV and screen periods disagree.** `app/api/exports/_lib/report-range.ts`
   calls `resolveReportPeriod` without the shop timezone. For Edmonton's
   3 October, the CSV starts at `2026-10-03T00:00Z`; the corrected report screen
   should start at `2026-10-03T06:00Z`. Read `Shop.timezone` using the session
   shop ID and pass it to the resolver. The generic invoice/payment CSV range and
   transaction dates were also corrected (see finding 9).
2. **Corrected: Failed refunds reduce Reports revenue.** `components/reports/query.ts`
   includes failed refund rows. A $100 payment and a failed $20 refund reports
   $80 net, although no money was returned. Exclude failed rows, consistent
   with `refundAwareTotals`, and keep pending refunds accounted for consistently.
3. **Corrected: Failed refunds also reduce Home/Overview takings.** The same missing
   status filter exists in `lib/dashboard/money.ts:loadTakingsRows`.
4. **Corrected: Impossible dates become different dates.** Reporting and statement date
   parsers accept `2026-02-31` as 3 March. Compare the parsed date's calendar key
   to the supplied key, or use the strict `parseDayKey` helper.
5. **Corrected: Customer invoice screens and customer PDF still ignore refunds.**
   `app/portal/home/page.tsx`, `app/portal/tickets/[id]/page.tsx`,
   `app/portal/invoices/[id]/page.tsx`, and its `print/page.tsx` do not load refunds
   and use payment-only `invoiceTotals`. A $100 invoice paid $100 and then
   refunded $20 reads Paid/$0 due to the customer while staff and the corrected
   printed staff invoice show $20 owed. Load scoped refunds, use net-paid totals,
   and show the returned money on the customer copy. The same sweep needs
   payment-provider balance checks (`checkout`, card-on-file, terminal,
   Square online/terminal, and both settlement helpers), plus customer CSV balances.
   The verifier applied the refund-aware corrections to those provider paths and
   customer CSV balances. Customer PDF and online checkout now load refunds;
   Stripe and Square settlements use net paid when deciding PAID/PARTIAL.
6. **Corrected: charge removal needs a conditional write.** `removeChargeAction` reads
   `invoiceId: null`, then deletes by ID alone. If invoicing attaches the charge
   between those operations, removal still deletes a charge already billed.
   Use a delete constrained by `{ id, shopId, invoiceId: null }`, check its count,
   and return the already-billed error without an Undo snapshot when no row was deleted.
   The verifier applied this to removal, legacy deletion, and editing; all five
   new concurrency/scoping checks and the existing Undo checks pass.

7. **Corrected: Reports' overdue count still followed UTC.** The period already
   used shop midnight, but outstanding-debt aging omitted the zone. At Edmonton
   evening on 3 October, an invoice due 3 October was counted late because UTC
   was already 4 October. Report periods now carry their normalized timezone
   into debt aging. Two new checks reconcile balances, refunds, overpayments,
   and the Edmonton/UTC late counts; all 15 independent reporting checks pass.

8. **Corrected: same-amount repayments could replay a completed checkout.**
   Checkout, card-on-file, Stripe Terminal and Square Terminal used invoice ID
   and amount as their request key. After a payment and another refund reopened
   the same amount, a new payment could reuse that earlier request. Keys now
   include append-only payment/refund counts and are SHA-256 hashes (64 characters).
   Unchanged retries retain their key; a changed ledger gets a new one. A failing
   reproduction and four key checks now pass, along with 72 provider/settlement checks.
   Provider behavior/limits were checked against the official
   [Stripe idempotency documentation](https://docs.stripe.com/api/idempotent_requests)
   and [Square Terminal API](https://developer.squareup.com/reference/square/terminal-api/create-terminal-checkout).

9. **Corrected: generic accounting CSVs still used UTC.** Invoice/payment CSV
   exports now read the scoped shop timezone for transaction dates and range
   boundaries. Stored invoice due dates remain calendar days rather than being
   shifted as instants. Independent checks cover shop midnight, the 23/25-hour
   daylight-saving days, default dates, impossible dates, and due-date preservation.
   All seven accounting-calendar checks pass.

Independent executable reproductions are in
`/private/tmp/repairshelper-verification-20261004/tests/verification-fix-list.test.ts`.
Run them from that directory with
`npx vitest run tests/verification-fix-list.test.ts --reporter=verbose`.
Initial result: 9 passed, 4 failed.

### Tested correction patch

The verifier prepared `/private/tmp/repairshelper-verification-corrections.patch`.
It adds the timezone to report exports, excludes failed refunds from Reports and
Home/Overview, strictly validates report/statement date inputs, and adds the
13 independent regression checks. **All 13 pass with that patch in the isolated
snapshot.** `git apply --check` also passed against the shared working tree when
the patch was created. It was applied to the shared project after checking that
its original contents still matched.

The second patch, `/private/tmp/repairshelper-verification-refunds.patch`, fixes
customer portal/PDF totals, the seven payment-provider/settlement paths, and
customer CSV balances. Three initial reproductions failed before the patch.
Seven cross-surface regression checks now pass, including pending/failed refunds,
reopened checkout, tenant scoping, and partial repayment via both settlement paths.
**All 121 targeted money/reporting checks pass in the shared project** (8 files).
No real card charge was attempted; payment-provider requests were mocked.

The verifier also reconciled customer list/detail/activity balances, invoice
API/webhook totals, and assistant invoice lookup. The API retains gross `paidCents`
and additionally supplies `refundedCents` and `netPaidCents`. Five new checks and
92 related existing checks passed in the isolated snapshot before integration.

The initial production-build snapshot caught an incomplete Settings component.
The shared component was subsequently completed, so that initial parse error
is not a current finding. Subsequent production snapshots built successfully.

## Behavior independently confirmed in the snapshot

- Completed and pending refunds restore the receipt balance; failed refunds do not.
- Cash receipt reprints recover tender and change from the stored payment reference.
- This-month reporting uses September during Edmonton's evening of 30 September,
  even though UTC is already in October.
- Edmonton's spring/fall clock-change report days span 23/25 hours, with exclusive
  end boundaries and correct chart-bucket membership.
- Repairs' due-today range ends at the next shop midnight.
- Technician reports never issue the invoice/payment/refund/deposit queries.

## Responsive component verification

The real `PublicShell`, `RepairStages`, `LineRows`, `TotalsBlock`, and `ColumnChart`
components were rendered in an isolated fixture route using synthetic records.
At widths 320, 390, 768, and 1024 pixels:

- No page horizontal overflow; all four repair stages, including Ready/Now, stay visible.
- Invoice amounts stay within the viewport, including a long description and serial.
- Report bars have real proportional heights (126, 63, 32 pixels for 100/50/25),
  rather than collapsing to the 3-pixel minimum.
- **Corrected target size:** Reports' “Show the numbers” summary was 26.75px
  high. The verifier added a 48px minimum and confirmed an actual 48px target at
  the 390px phone viewport, with no overflow. Contact/legal links meet that floor.

The fixture server disables database job instrumentation and uses no application
credentials. These checks validate component layout, not authenticated workflows
or physical-device keyboard/microphone behavior.

## Full checks (implementation still active)

The 11:27 run had 157 test files passing and 11 failing: 4,052 tests passed,
36 failed, and 1 was skipped. Most failures are expectations/mocks for the old
layouts and labels, including Settings and edit-invoice step flows.
The subsequent 11:30 TypeScript run passed after the remaining fixture typing
issues were corrected. An isolated production build completed successfully
(compilation, TypeScript and route generation) with network access for fonts.
This verifies the 11:30 source snapshot, not later concurrent edits.

The 11:48 isolated snapshot passed **193 test files, 4,413 tests (1 skipped)**,
TypeScript, lint and the production build. Concurrent changes after that capture
were included in the final 11:52 refresh, which passed the checks listed above.
The final build includes the real production instrumentation, excludes application
credentials, and has no verification-only routes.

Final logs are `/private/tmp/repairshelper-verification-{tests,types,lint,build}-current.log`.
The tested source manifest is `/private/tmp/repairshelper-verification-source-manifest.json`;
the isolated production source is `/private/tmp/repairshelper-final-verification-20261004`.

TypeScript had caught a missing vendor field in purchase-order card data and the
missing dashboard test fixture week link. Inventory helper exports were
temporarily missing during a concurrent write and were restored by the next read.
Lint caught a statement render-time `Date.now()` fallback; the verifier removed
that fallback and made the already-supplied request clock required.

The actual new purchase-order builder was exercised with synthetic suppliers and
products, without submitting the form. At 320/390/768/1024px: no overflow, no
visible interactive control below 48px, no silently selected supplier, and the
review correctly showed 5 × $45 = $225. Focus moved to the review heading.

The actual work-order print component was checked with synthetic contact, repair
and charge data. It showed the correct $147 total, signatures, terms, barcode and
masked passcode. **PDF page count remains unverified:** automatic approval review
rejected the PDF export because permission for Chrome's debugging interface was
declined. No PDF was exported, and no alternate export path was attempted.

## Takeover corrections and section D implementation

- CI found six test expectations assuming an Alberta fall-back in November 2026. The Mac had Node 22.22.3 / tz2026a; production and CI have Node 22.23.3 / tz2026c. Alberta stays at UTC-6 from November 2026. Historical DST checks now use November 2025, with explicit November 2026 permanent-time regressions. Verification uses an official SHA-256-checked temporary Node 22.23.3 installation; CI and `.nvmrc` pin the same version, and the package documents the minimum runtime. Sources: [Government of Alberta](https://www.alberta.ca/albertas-new-time-system-abt), [IANA 2026c](https://www.iana.org/time-zones/releases/2026c). Earlier local passes on the older runtime did not certify those future dates.
- Completed the shop-time sweep through assistant lookups, document emails, POS drawer labels, labour charges, recurring calendar dates, accounting exports and promised pickup. Date-only billing fields remain calendar dates. Existing DST and Edmonton/UTC boundary checks pass.
- Fixed invoice creation claims for repair charges and stopped billable time. Conditional writes prevent a competing cashier from billing a charge twice; a real PostgreSQL reproduction confirms rollback of the losing invoice.
- Added split cash/card payments to POS and invoice payments. Both rows commit together; the real database suite proves a failed second tender rolls back the first cash row and the POS invoice. A successful POS sale stores one PAID invoice, two tender rows and cash-only change.
- Added normalized phone duplicate warnings, password-confirmed six-digit PIN setup and scoped switching, decoded/resized owner logo uploads, and opt-in encrypted phone push. Unit coverage checks ownership, tenant boundaries, PIN/session invalidation, invalid image files, cleanup on storage/database failure, push provider endpoints, role-aware counts and inactive/expired devices.
- Added live PIN-session validation to nullable read-only API guards as well as page/action guards. Seven regressions cover role changes, PIN removal/version changes, inactive accounts, password changes and two-step/setup requirements.
- Fixed Node-only job instrumentation so the push dependency does not enter the Edge build graph.
- Enabled the catalog image-on-disk check in CI and verified the complete local suite with CHECK_CATALOG_IMAGES=1.
- Added the independent PostgreSQL suite and CI step. It refuses databases outside a local `verification` database and tests real transactions; authentication/cookie/event infrastructure is mocked, not browser-authenticated end to end.
- Updated Next.js and its ESLint config to 16.3.8 and applied compatible dependency patches. `npm audit --omit=dev` reports zero vulnerabilities. Five high-severity development dependency findings remain in the braces/micromatch ESLint chain; the registry has no compatible patched braces release, and the suggested forced fix downgrades Next’s ESLint config to 14.2.35. No forced downgrade was applied. Advisory: [Next.js ImageResponse](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).

### Authenticated local browser checks

An isolated PostgreSQL database on port 55439 and an isolated app on port 3033
used synthetic demo records, log-only mail/text drivers and no payment-provider credentials.
The new customer form found Sofia Kaur from a differently formatted phone number,
blocked creation, and created the separate synthetic customer only after checking
the explicit override. The resulting customer page was visibly confirmed.
The split dialog showed a $95 total, $30 cash part, $50 handed over, $20 change
and a $65 card remainder. Profile PIN and push controls and the owner logo form
rendered correctly. The dark-theme Talk control is 48px high, with dark text
on a light background (rgb(17,18,20) / rgb(241,242,243)). No browser card confirmation, personal notification permission,
new staff credential or owner logo upload was submitted.
Screenshots: `/private/tmp/repairshelper-{customer,profile,split}-browser-check.jpg`.

### Development seed incident and correction

The first isolated seed command resolved the shared Prisma client’s environment
and reseeded the shared **local development demo shop** instead of the isolated
database. Its old demo records were replaced; they were not restored. The user
was informed immediately. Production was not targeted. All following database
commands passed an explicit isolated URL. The seed entry point now loads the
working directory’s environment, requires `DATABASE_URL` and constructs Prisma
with that explicit URL, preventing the generated-client fallback. The URL is captured before dynamically importing Prisma, because importing its generated client can itself populate environment variables. A subprocess regression proves an absent caller URL exits before that import; the independent production seed guard also prevents writes if the URL guard regresses. The first guard check encountered the old development schema on its initial read and made no changes.

## Release and remaining verification

Commit/CI/deployment/live smoke results are pending. Source manifests and logs
are under `/private/tmp/repairshelper-verification-*`; the isolated production
source is `/private/tmp/repairshelper-final-verification-20261004`.

Real card-provider payments, email placement, off-server backup restore,
physical-device keyboard/microphone/scanner behavior and actual phone push
delivery remain owner checks. All section D features are implemented; they are
not certified on physical devices by unit tests. Authenticated local browser
checks cover the workflows named above, not every screen.

PDF page count remains unverified: automatic approval review rejected the export
because Chrome debugging permission was declined. No alternate export was attempted.
