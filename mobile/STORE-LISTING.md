# Store listing drafts: Repairs helper

Draft text for App Store Connect and the Google Play Console. Everything here is based on what the code does on 2026-10-29. Re-check the privacy answers whenever a feature starts collecting something new.

Character limits are in brackets. Counts include spaces.

---

## Shared facts

| | |
| --- | --- |
| App name | Repairs helper |
| Bundle / application id | `com.repairshelper.app` |
| Developer / seller | Town Media Labs (Edmonton, Alberta, Canada) |
| Support URL | https://repairshelper.com/contact |
| Marketing URL | https://repairshelper.com |
| Privacy policy URL | https://repairshelper.com/privacy |
| Terms | https://repairshelper.com/terms |
| Account deletion URL (Play asks for it) | https://repairshelper.com/delete-account |
| Support email | support@repairshelper.com |
| Price | Free. No in-app purchases, no subscriptions, no ads |
| Category | Business (secondary on iOS: Productivity) |
| Age rating | 4+ (Apple), Everyone (IARC) |

---

## Apple App Store

**Name** [30]: `Repairs helper`

**Subtitle** [30]: `Repair shop tickets and POS` (27)

**Promotional text** [170]:

> Check in a repair, track it on the bench and hand it back paid. Tickets, invoices, stock and customer updates for phone and computer repair shops, free in early access.

**Keywords** [100, comma-separated, no spaces needed]:

```
repair shop,repair tickets,phone repair,computer repair,work order,invoice,pos,inventory,technician
```

(98 characters. Do not repeat words that are already in the name or subtitle; Apple indexes those anyway.)

**Description** [4000]:

> Repairs helper is shop software for phone, computer, tablet and console repair businesses. It keeps every job in one place, from the moment a device comes in to the moment it goes home.
>
> CHECK IN A REPAIR IN SECONDS
> • Find or add the customer, pick the device and describe the problem
> • Take photos of the device with your phone's camera
> • Scan serial numbers and barcodes
> • The customer signs on screen
>
> TRACK EVERY JOB ON THE BENCH
> • See what is new, in progress, waiting for parts and ready for pickup
> • Assign jobs to technicians and set due dates
> • Add notes and parts, and log time on the job
> • Get a notification when work needs you
>
> GET PAID
> • Turn a job into an invoice with parts and labour
> • Take cash, card or split payments at the counter
> • Send invoices and payment links by email or text
> • Print or save receipts, work orders and labels
>
> KEEP CUSTOMERS IN THE LOOP
> • Send status updates by text or email
> • Customers check their repair's status online, with no app needed
>
> RUN THE SHOP
> • Inventory with low-stock alerts
> • Appointments, enquiries and a public check-in form
> • Reports on revenue, tickets, products and technicians, with CSV export
> • Owner, technician and front-desk roles
> • Several locations under one shop
>
> Repairs helper is free during early access. Create your shop at repairshelper.com or in the app, and sign in with the same account on the web, on a counter tablet and on your phone.

**Category:** Business. Secondary: Productivity.

**Age rating questionnaire:** None of the content categories apply. Answer "No" to unrestricted web access: the app only opens repairshelper.com, and other links go to Safari. Result: 4+.

**Copyright:** `© 2026 Town Media Labs`

### App Review information

- **Sign-in required:** yes.
- **Demo account:** create it with `scripts/create-review-account.mjs` (see `mobile/README.md` → Reviewer account). Give the email and password here. The account has no 2FA.
- **Notes for the reviewer** (paste and adjust):

> Repairs helper is a business tool for independent repair shops. Staff use it to check in devices, track repairs, invoice customers and manage stock.
>
> The demo login opens a sample shop with customers, open repair tickets, stock and invoices. To see native features: open a ticket and tap "Take photo" (camera), tap Scan on the Inventory or Point of sale screen (barcode camera), and allow notifications after sign-in (push). Downloads and print views (Reports → CSV, Print on an invoice) open in an in-app Safari sheet so you can save or print them.
>
> Sign-in options: email and password, or a one-time code sent by email. The iOS app offers no third-party login, so guideline 4.8 does not apply. The website and Android app also offer Google sign-in.
>
> Account deletion: menu (top right) → Account → "Delete my login", or "Delete this shop" for owners. Public instructions are at https://repairshelper.com/delete-account.
>
> Payments: shops charge their own customers for physical repair services (guideline 3.1.3(e)). The app itself is free, with no digital goods, subscriptions or in-app purchases.

### App Privacy ("nutrition label")

**Data used to track you:** none. The app has no ads, no ad SDKs and no third-party analytics. Microsoft Clarity runs only on the public website and is switched off inside the app (`components/analytics/clarity.tsx`).

**Data linked to you.** For every type below the purpose is **App Functionality**, it is linked to the user's identity, and it is not used for tracking:

| Apple category | Data type | Where it comes from in the app |
| --- | --- | --- |
| Contact Info | Name | Staff profile; customer records the shop enters |
| Contact Info | Email Address | Staff login; customer records |
| Contact Info | Phone Number | Customer records (texts and calls) |
| Contact Info | Physical Address | Customer and shop addresses on invoices |
| Financial Info | Payment Info | Card brand and last 4 digits, kept for saved customer cards (Stripe holds the card itself) |
| Financial Info | Purchase History | Invoices and payments for repairs |
| User Content | Photos or Videos | Ticket photos and attachments |
| User Content | Audio Data | Voice assistant and dictation. Sent to the speech-to-text provider to become text |
| User Content | Emails or Text Messages | Status updates the shop sends its customers are kept on the ticket |
| User Content | Customer Support | "Report an issue or idea" feedback |
| User Content | Other User Content | Ticket notes, signatures, inventory, appointments |
| Identifiers | User ID | Account id |
| Identifiers | Device ID | Push notification token (`NativePushDevice`) |

**Not collected:** Health & Fitness, Location, Sensitive Info, Contacts (the address book is never read), Browsing History, Search History, Usage Data, Diagnostics, Other Data.

> Judgement calls for the owner: (1) Server logs record IP addresses and security events. Apple counts data the *app* collects, and logs kept only for security are often left off the label. If you want to be conservative, add "Diagnostics → Other Diagnostic Data" for App Functionality. (2) If you ever add crash reporting or analytics to the app, update the label first.

### Screenshots (exact sizes)

Upload PNG or JPEG, RGB, no transparency, 1 to 10 per device size.

| Device | Required? | Portrait size (px) | Notes |
| --- | --- | --- | --- |
| iPhone 6.9" | **Required** | **1320 × 2868** (or 1290 × 2796) | Apple scales it down for smaller iPhones |
| iPad 13" | **Required** (the app supports iPad: `TARGETED_DEVICE_FAMILY = 1,2`) | **2064 × 2752** (or 2048 × 2732) | Landscape versions are the same sizes swapped |
| iPhone 6.5" | Optional | 1284 × 2778 or 1242 × 2688 | Only if you want different art there |

App icon: 1024 × 1024 PNG with no alpha channel. Xcode supplies it from `ios/App/App/Assets.xcassets/AppIcon.appiconset` (already 1024 × 1024 and opaque).

Suggested set, signed in to the reviewer shop: (1) Home / counter, (2) ticket list, (3) a ticket with photos, (4) check-in, (5) invoice / take payment, (6) inventory, (7) reports. Take them in the iOS Simulator (iPhone 16 Pro Max = 6.9", iPad Pro 13" (M4)) with File → Save Screen.

---

## Google Play

**App name** [30]: `Repairs helper`

**Short description** [80]:

> Repair shop software: check-ins, repair tickets, invoices, POS and stock. (72)

**Full description** [4000]: use the App Store description above. It contains no iOS-only claims. Play does not allow emoji or "best"/"#1" claims in the title, and the text above uses neither.

**App category:** Business. **Tags:** Business management, Point of sale, Productivity.

**Contact details:** support@repairshelper.com, website https://repairshelper.com.

**Store listing graphics:**

| Asset | Size | Format |
| --- | --- | --- |
| App icon | **512 × 512** | 32-bit PNG, max 1 MB (resize `assets/icon-only.png`) |
| Feature graphic | **1024 × 500** | JPEG or 24-bit PNG, no transparency |
| Phone screenshots | **2 to 8**. Recommended **1080 × 1920** portrait | Each side 320 to 3840 px, and the long side at most twice the short side. At least 4 at 1080 px or more makes the app eligible for featuring |
| 7" tablet screenshots | Optional, up to 8. Recommended **1200 × 1920** | Same rules |
| 10" tablet screenshots | Optional, up to 8. Recommended **1600 × 2560** | Same rules |

Note that a 1080 × 2400 phone capture (20:9) is wider than 2:1 and gets rejected. Crop or pad it to 1080 × 1920.

### App content declarations

- **Privacy policy:** https://repairshelper.com/privacy
- **Ads:** No ads.
- **App access:** "All or some functionality is restricted". Add the reviewer email and password, plus "Sign in with email and password on the first screen."
- **Content rating (IARC):** a business/productivity utility. No violence, sexuality, language, drugs or gambling. On user-generated content: staff can send texts and emails to their own customers and upload photos inside their shop, and nothing is public. Answer accordingly. Expected rating: Everyone.
- **Target audience:** 18+ (business users). Not designed for children.
- **News app:** No. **Government app:** No. **Financial features:** none of the listed ones (no loans, banking or crypto. Shops take payments for their repairs through Stripe).
- **Health apps:** No.
- **Advertising ID:** the app does not use it (no ads or analytics SDKs; Firebase Messaging does not add `AD_ID`). Answer "No".
- **Account deletion:** in the app (menu → Account) and on the web at https://repairshelper.com/delete-account.

### Data safety

**Does the app collect or share user data?** Yes, it collects. **Shared:** No. OpenAI (speech-to-text and AI features), Stripe, Cloudflare, Hostinger mail and APNs/FCM process data for us as service providers, which Play does not count as sharing.

**Security practices:** data is encrypted in transit (HTTPS only, `cleartext: false`). Users can request deletion (in-app and at /delete-account). Do not claim an independent security review.

| Play category | Data type | Collected | Required / optional | Purposes |
| --- | --- | --- | --- | --- |
| Personal info | Name | Yes | Required | App functionality, Account management |
| Personal info | Email address | Yes | Required | App functionality, Account management, Developer communications |
| Personal info | Phone number | Yes | Optional | App functionality |
| Personal info | Address | Yes | Optional | App functionality |
| Personal info | User IDs | Yes | Required | App functionality, Account management |
| Financial info | Purchase history | Yes | Optional | App functionality |
| Financial info | Other financial info (card brand and last 4 digits of saved cards) | Yes | Optional | App functionality |
| Messages | Emails | Yes | Optional | App functionality (updates sent to the shop's customers) |
| Messages | SMS or MMS | Yes | Optional | App functionality |
| Photos and videos | Photos | Yes | Optional | App functionality |
| Audio | Voice or sound recordings | Yes | Optional | App functionality (processed into text) |
| Files and docs | Files and docs | Yes | Optional | App functionality (ticket attachments, imports) |
| Device or other IDs | Device or other IDs | Yes | Optional | App functionality (push token) |

**Not collected:** Location, Web browsing, Contacts, Calendar, Health and fitness, App activity, App info and performance.

None of the data is processed only ephemerally, except the audio: it is transcribed and not stored. You may mark "Voice or sound recordings" as "processed ephemerally" if `lib/ai/transcribe.ts` stays that way.
