# Full list: what is missing, what is not working, what is being fixed

Written 4 Oct 2026. Sources: a page-by-page audit of 109 screens (tablet and phone),
the independent reviews of every finished package, and checks on the live server.
Status words: **Fixed** (done and live), **Fixing now** (being built and reviewed),
**You** (only the owner can do it), **Built locally** (implemented and checked; release pending).

## A. Fixed and live (repairshelper.com, release 7a2d6fc)

| Item | Status |
|---|---|
| New Home, Sell terminal, New repair check-in, repair job screen, pickup counter, invoices, customers, stock in the POS look | Fixed |
| Shop overview dashboard + Today strip on Home | Fixed |
| Picture library (168 pictures) + "glass guard" style auto-matching + picture picker in Add / Edit product | Fixed |
| Your own devices and problems (Settings → Workflow) with pictures, used in New repair | Fixed |
| New invoice / estimate, New customer, Book a visit as step flows | Fixed |
| Website front page with the new hero; hero video shrunk from 33 MB to 3.4 MB and hosted on your server | Fixed |
| **Live server ran on UTC time while all 5 shops are in Edmonton**: dates, "due today" and server-rendered times could be 6 hours off in the evening | Fixed for now (server set to Edmonton time); proper per-shop fix in the packages below |

## B. Seven fix packages completed locally

The other implementation sessions were stopped and this session took over the remaining work.
Independent findings, corrections and evidence are in [FIX-VERIFICATION.md](FIX-VERIFICATION.md).
All seven packages are implemented locally. The latest checks pass 4,496 unit tests
(no skips), 8 real PostgreSQL integration checks, types, lint and a production build.
The list below records the original problems addressed by these packages.
Deployment and live smoke verification will be recorded separately below.

### 1. What customers see (portal, self check-in, shop page, sign-in, error pages)
- Repair status tracker is cut off on phones; the current step is hidden.
- Invoice / estimate pages cut off the Amount column on phones.
- A paid invoice shows "Sent" next to "Paid in full"; internal words (In Progress, Converted) shown to customers.
- No shop phone number, hours or directions on any customer page; three different brand looks.
- Self check-in kiosk is plain forms: rebuild with picture tiles and steps.
- New repair request and the public shop page: same picture-tile look.
- Buttons under 48px on public pages; mixed button colours.
- No branded 404 / error page: dead links show the bare browser error.
- Expired payment links show a confusing sign-in error.
- Jargon (ticket, Qty / Rate, IMEI) on customer screens; Privacy and Terms not linked where data is collected.
- Sign-in pages polish; email-code page breaks in dark mode.

### 2. Money, paperwork and reports
- **Printed invoice, receipt and statement ignore refunds** (show $0.00 due while the app shows money owed).
- **Reports "Outstanding" $773.19 vs $838.12** on the invoice list and overview; Reports days cut at UTC midnight; Reports bars collapse to 3px.
- Edit invoice / Edit estimate / repeat bills still use the old dense form.
- "From repair" on a new invoice does not add the repair's charges (and must never double-bill).
- No "Print receipt" from a paid invoice; the printed work order spills onto 2 pages.
- Take payment lacks cash change and quick amounts; Refund uses a dropdown instead of tiles.
- Statement and cash-drawer history in the old look; accounting jargon (Z-report, Net 14).
- Small: Send receipt tile wraps; 24px links on the invoice Customer tab.

### 3. Stock, purchasing and imports
- New purchase order is unusable on a phone; first supplier is pre-selected silently.
- Receiving a delivery is a plain form: needs "Everything arrived" in one tap, photos, scan counter.
- Purchase order detail clips columns at tablet width; list has 7 tabs and jargon.
- No path from "running low" to "order it" in Easy mode; wrong "Out of stock" empty state.
- Supplier detail, adjust-stock dialog, serial numbers, import wizard and shelf labels in the old look; small dialog buttons.

### 4. App shell, search and notifications
- **Back goes to the top of the area**, not where you came from.
- **Search looks like a developer tool** and cannot find "#1012" / "INV-1012".
- **No notifications**: nothing tells you something needs you while on another screen.
- Buttons inside menus and dialogs are 23–40px (the 48px rule does not reach them).
- **Assistant bar covers totals and Save buttons** at the bottom of tablet screens; toasts overlap.
- **Log out only works if you hit a tiny inner button.**
- Easy / Full switch hidden; keyboard pops over picture choices on tablets.
- Loading screens jump; no tap feedback; Money hub tiles repeat pictures and show no numbers.
- Dead old shell code to delete; old words (Ticket, Lead, Inventory) in search and menus.

### 5. Settings and first-run setup
- Settings menu eats 40% of a tablet screen: replace with a picture-tile hub.
- Owners see developer settings (environment variable names, webhook URLs).
- Three different ways of saving; switches with no On / Off word; raw links instead of Copy / QR / Print buttons.
- First-run setup in the old look; remaining panels restyled.
- Devices-and-problems editor leftovers (faded tabs, audit log spam, focus).
- New repair: "Other" hidden behind "More devices"; keyboard opens over the pictures.

### 6. Visits, enquiries, marketing, time clock, shop display, overview
- Appointments calendar in the old look; times must follow the shop's time zone.
- "Book a visit" from a customer does not pick that customer.
- Enquiry, marketing, time clock and shop display screens in the old look.
- Overview: day bars too small to tap; "Collect payments" shows even when nothing is owed; "3 days late" vs "Overdue 4d".

### 7. Repairs and customers leftovers
- **"Due today" / "Overdue" on Repairs use server time**, not the shop's.
- Repair screen: tabs cut off at tablet width; Enter can trigger "Mark ready" by accident; skipped steps shown as "Done"; one-tap charge delete with no undo.
- Pickup counter: contrast, screen-reader names, focus after hand-over.
- Customer screen: header wraps at portrait tablet; small links in Payments / Warranties; old loading screen on Edit.

## C. Only you can do (details in docs/OWNER-TODO.md)

| Item | Status |
|---|---|
| Off-server copy of the daily database backups, and one test restore | You |
| AI key (OpenAI) on the server, then test the assistant and microphone on a real phone | You |
| Card payments: Stripe or Square keys and webhooks, a test payment in test mode | You |
| Welcome emails landing in Junk: check sender domain records | You |
| Try it on a real iPad, iPhone and Android phone | You |
| Decisions: voice language default; text-message consent default (safe = off); negative stock; assistant stock changes without a confirm tap; internet photo look-up on/off; which Figma file is the real design; brand orange vs blue on the website | You |

## D. Additional features requested on 4 October — built locally

| Feature | Implemented behavior |
|---|---|
| Split payment | Cash + card on one sale or invoice; two tender rows in one transaction, cash-only change. The cashier approves the card on a separate machine before recording it. |
| Duplicate customer warning | Normalized phone matching within the current shop; open the existing customer or explicitly confirm a separate one. |
| Quick staff switch with a PIN | Six-digit personal PIN, password-confirmed setup, scoped staff roster, attempt limits and an eight-hour session. Two-step accounts use full sign-in. |
| Shop logo upload | Owner-only PNG/JPEG/WebP upload, decoded/resized PNG storage, displayed on customer pages and paperwork. |
| Per-shop time zone | Final sweep includes exports, assistant, email paperwork, time charges, recurring billing, accounting integrations and promised pickup. Stored calendar dates retain their calendar meaning. |
| Large customer picker | Book a visit searches the server, including customers beyond the first 500. |
| Phone push notifications | Per-device opt-in and test notification in My profile, encrypted push, role-aware attention counts, stopped on logout/staff switch. Alerts run on the automation interval, not instantly. |

Physical phone delivery, real payment-provider transactions, backup restore and email
placement remain owner checks in [OWNER-TODO.md](OWNER-TODO.md).
Work-order PDF page count remains unverified because browser debugging permission was declined.

## Release

Local validation complete; commit, CI, deployment and live smoke results pending.
