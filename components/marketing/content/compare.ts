import type { Faq } from "@/lib/seo/schema";

import type { Point } from "./features";

/**
 * Comparison pages under /compare/<slug>.
 *
 * The competitor column paraphrases only what that company publishes on its
 * own website, read on the `checked` date and cited row by row. Where a detail
 * could not be confirmed it is left out rather than guessed. The Repairs
 * helper column uses the same product facts as the feature pages.
 */

export type CompareSource = { href: string; label: string };

export type CompareRow = {
  topic: string;
  ours: string;
  theirs: string;
  /** Keys into the page's `sources`. */
  source: string[];
};

export type ComparePage = {
  slug: string;
  competitor: string;
  /** One line for the /compare index card. */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  /** Search query this page is written to answer. */
  query: string;
  h1: string;
  lede: string;
  /** ISO date the competitor's pages were read. */
  checked: string;
  sources: Record<string, CompareSource>;
  rows: CompareRow[];
  /** "When <competitor> may suit you better", one paragraph per entry. */
  theirFit: string[];
  faqs: Faq[];
};

/** Repairs helper's side of every table, so all comparisons say the same thing. */
export const OURS = {
  price: "$0 per shop during early access. No credit card asked for.",
  staff: "Every staff account included during early access, with owner, technician and front-desk roles.",
  limits: "No plan tiers during early access.",
  locations: "Multiple locations with a location switcher and an all-locations view.",
  trying: "Free to use during early access.",
  portal:
    "Repair status, estimate approval with optional signature, online payment, new repair requests. Sign-in by link, no password.",
  pos: "Sell screen with barcode scanning, Stripe Terminal and Square Terminal, manual mode for other card machines, cash drawer sessions.",
  inventory: "Low-stock levels, serial numbers, vendors, purchase orders, barcode labels, CSV import.",
  payments: "Stripe and Square, connected with your own account.",
  accounting: "QuickBooks Online and Xero.",
  sms: "Through your own Twilio account; Twilio bills you directly.",
  marketing:
    "Follow-up campaigns triggered by resolved repairs, paid invoices or new customers, plus post-pickup review requests.",
  field: "Not available. Appointments are for visits to your shop.",
  api: "REST API (v1) with per-shop keys, plus signed webhooks for 12 events.",
  devices: "Runs in the browser on phones, tablets and computers, and can be added to the home screen.",
} as const;

/** What sets Repairs helper apart, shown on every comparison. */
export const OUR_DIFFERENCES: Point[] = [
  {
    title: "Built for a tablet on the counter",
    body: "Easy mode puts New repair and New sale on two big buttons, with picture boxes for devices and problems. Full view adds tables for the back office.",
  },
  {
    title: "An AI assistant in the app",
    body: "Ask about repairs, stock and sales, summarise ticket notes and draft customer replies, by typing or by voice. It asks before changing anything.",
  },
  {
    title: "Walk-in check-in and a shop page",
    body: "A public check-in form with a QR code or kiosk mode, and one shop link for status, booking, quotes and payment.",
  },
  {
    title: "Card machines either way",
    body: "Send the amount to a Stripe Terminal or Square Terminal reader, or keep your bank's machine and record the payment with one tap.",
  },
];

export const COMPARE_PAGES: ComparePage[] = [
  {
    slug: "repairshopr-alternative",
    competitor: "RepairShopr",
    summary: "Published pricing, user and location limits, portal, POS, inventory and integrations, side by side.",
    metaTitle: "RepairShopr Alternative: Repairs helper Compared | Repairs helper",
    metaDescription:
      "Repairs helper and RepairShopr side by side: published pricing, users, locations, portal, POS, inventory and integrations. Checked October 2026, with sources.",
    query: "RepairShopr alternative",
    h1: "Repairs helper as a RepairShopr alternative",
    lede:
      "RepairShopr is a long-established repair shop platform. Repairs helper is a newer one in early access. This page puts the two side by side using only what RepairShopr publishes on its own website (checked October 28, 2026), so you can see where each fits.",
    checked: "2026-10-28",
    sources: {
      pricing: { href: "https://www.repairshopr.com/pricing", label: "RepairShopr pricing page" },
      features: { href: "https://www.repairshopr.com/features", label: "RepairShopr features page" },
      home: { href: "https://www.repairshopr.com/", label: "RepairShopr home page" },
    },
    rows: [
      {
        topic: "Published price",
        ours: OURS.price,
        theirs:
          "Three plans: Starter $69.99 USD, Repair Shop $139.99 USD and Big Chain $149.99 USD on the monthly option; $59.99, $129.99 and $139.99 USD on the annual “Buy & Save” option.",
        source: ["pricing"],
      },
      {
        topic: "Staff accounts",
        ours: OURS.staff,
        theirs: "Starter lists 1 user account; Repair Shop and Big Chain list 10 user accounts.",
        source: ["pricing"],
      },
      {
        topic: "Tickets and invoices",
        ours: OURS.limits,
        theirs: "Starter lists 75 tickets and invoices per month; the other plans list unlimited.",
        source: ["pricing"],
      },
      {
        topic: "Locations",
        ours: OURS.locations,
        theirs: "Starter and Repair Shop list one location; Big Chain lists 2+ locations.",
        source: ["pricing"],
      },
      {
        topic: "Trying it",
        ours: OURS.trying,
        theirs: "Offers a free trial.",
        source: ["home"],
      },
      {
        topic: "Customer portal",
        ours: OURS.portal,
        theirs:
          "Customers can check status, see invoice history and approve or decline estimates; access by login or email link.",
        source: ["features"],
      },
      {
        topic: "Point of sale",
        ours: OURS.pos,
        theirs: "POS linked to inventory; Cash Registers listed on all plans.",
        source: ["features", "pricing"],
      },
      {
        topic: "Inventory",
        ours: OURS.inventory,
        theirs: "Stock levels with reorder reminders, barcode labels, CSV import and export, purchase order history.",
        source: ["features"],
      },
      {
        topic: "Online payments",
        ours: OURS.payments,
        theirs: "Stripe, PayPal and Authorize.net listed as online payment integrations.",
        source: ["features"],
      },
      {
        topic: "Accounting",
        ours: OURS.accounting,
        theirs: "QuickBooks integration listed on all plans; Xero named among integrations on the home page.",
        source: ["pricing", "home"],
      },
      {
        topic: "Text messages",
        ours: OURS.sms,
        theirs: "An SMS allowance per month that varies by plan.",
        source: ["pricing"],
      },
      {
        topic: "Marketing",
        ours: OURS.marketing,
        theirs: "Marketr automated marketing listed on all plans.",
        source: ["pricing"],
      },
      {
        topic: "Field jobs and mail",
        ours: OURS.field,
        theirs: "Field Jobs listed on all plans; Snail Mail in the U.S. with stamp credits bought separately.",
        source: ["pricing"],
      },
      {
        topic: "API",
        ours: OURS.api,
        theirs: "Mentions an app center of integrations and an API.",
        source: ["home"],
      },
    ],
    theirFit: [
      "RepairShopr lists field jobs, mailed letters in the U.S., a customer map, localization and a large app center with integrations such as Slack, Google Calendar and PayPal. If your business depends on any of those, Repairs helper does not offer them today.",
      "Repairs helper is also in early access. One-click migration of repair history is not available, and Stripe, Square, email and SMS each need setting up and testing before customers rely on them.",
    ],
    faqs: [
      {
        q: "Is Repairs helper a good RepairShopr alternative for a small shop?",
        a: "It can be if you run an in-shop repair counter and want tickets, POS, inventory and a customer portal without per-user pricing during early access. If you rely on field jobs, mailed letters or a specific RepairShopr integration, check that first: those are not in Repairs helper.",
      },
      {
        q: "Can I import my data from RepairShopr?",
        a: "Customers and products can be imported from a spreadsheet or CSV export. Repair history cannot be migrated in one step yet.",
      },
      {
        q: "Where did the RepairShopr details come from?",
        a: "From RepairShopr's own public pricing, features and home pages, checked on October 28, 2026. Plans and prices change, so confirm on their site before deciding.",
      },
      {
        q: "Is Repairs helper affiliated with RepairShopr?",
        a: "No. Repairs helper is an independent product operated by Town Media Labs in Edmonton, Canada. RepairShopr is a trademark of its owner.",
      },
    ],
  },
  {
    slug: "repairdesk-alternative",
    competitor: "RepairDesk",
    summary: "Per-store pricing, users per location, SMS credits, card terminals and integrations, side by side.",
    metaTitle: "RepairDesk Alternative: Repairs helper Compared | Repairs helper",
    metaDescription:
      "Repairs helper and RepairDesk side by side: per-store pricing, users, SMS credits, card terminals, portal, inventory and integrations. Checked November 2026.",
    query: "RepairDesk alternative",
    h1: "Repairs helper as a RepairDesk alternative",
    lede:
      "RepairDesk is an established repair shop POS, priced per store. Repairs helper is a newer one in early access. This page puts the two side by side using only what RepairDesk publishes on its own website (checked November 1, 2026), so you can see where each fits.",
    checked: "2026-11-01",
    sources: {
      pricing: { href: "https://www.repairdesk.co/pricing/", label: "RepairDesk pricing page" },
      integrations: { href: "https://www.repairdesk.co/integrations/", label: "RepairDesk integrations page" },
      payments: { href: "https://www.repairdesk.co/features/repairdesk-payments/", label: "RepairDesk Payments page" },
      inventory: {
        href: "https://www.repairdesk.co/features/inventory-management-software/",
        label: "RepairDesk inventory page",
      },
      marketing: { href: "https://www.repairdesk.co/features/marketing-automation-tool/", label: "RepairDesk marketing page" },
      multiLocation: {
        href: "https://www.repairdesk.co/multi-location-pos-system-for-repair-shops/",
        label: "RepairDesk multi-location page",
      },
      mailIn: { href: "https://www.repairdesk.co/mail-in-repair/", label: "RepairDesk mail-in repair page" },
      portal: {
        href: "https://help.repairdesk.co/portal/en/kb/articles/customer-portal",
        label: "RepairDesk help: customer portal",
      },
      sms: { href: "https://help.repairdesk.co/portal/en/kb/articles/repairdesk-sms", label: "RepairDesk help: RepairDesk SMS" },
      api: { href: "https://help.repairdesk.co/portal/en/kb/api", label: "RepairDesk help: API" },
    },
    rows: [
      {
        topic: "Published price",
        ours: OURS.price,
        theirs:
          "Essential $99 and Growth $149 per store per month, or $79 and $119 per store per month billed annually; Advanced is a custom quote. The page shows “$” without naming the currency.",
        source: ["pricing"],
      },
      {
        topic: "Staff accounts",
        ours: OURS.staff,
        theirs: "5 users per location on Essential, 8 on Growth and unlimited on Advanced.",
        source: ["pricing"],
      },
      {
        topic: "Tickets and invoices",
        ours: OURS.limits,
        theirs: "Unlimited tickets on every plan.",
        source: ["pricing"],
      },
      {
        topic: "Locations",
        ours: OURS.locations,
        theirs: "Priced per store, with multiple locations and stock transfers between stores.",
        source: ["pricing", "multiLocation"],
      },
      {
        topic: "Trying it",
        ours: OURS.trying,
        theirs: "The pricing page's Free Trial button leads to a demo request; no free plan is listed.",
        source: ["pricing"],
      },
      {
        topic: "Customer portal",
        ours: OURS.portal,
        theirs: "Customers log in to create tickets, see estimates, invoices and messages, and pay online.",
        source: ["portal"],
      },
      {
        topic: "Point of sale",
        ours: OURS.pos,
        theirs: "Card terminals through Square, Paymentsense (UK and Ireland), Tyro (Australia) and RepairDesk's own payments service.",
        source: ["integrations", "payments"],
      },
      {
        topic: "Inventory",
        ours: OURS.inventory,
        theirs: "Serial and IMEI tracking, purchase orders, supplier returns, transfers between stores, barcode labels and spreadsheet import.",
        source: ["inventory"],
      },
      {
        topic: "Online payments",
        ours: OURS.payments,
        theirs: "Pay Now links on invoices sent by email or text; Stripe, PayPal and Square listed.",
        source: ["payments", "integrations"],
      },
      {
        topic: "Accounting",
        ours: OURS.accounting,
        theirs: "QuickBooks Online and Xero listed on every plan.",
        source: ["pricing"],
      },
      {
        topic: "Text messages",
        ours: OURS.sms,
        theirs: "RepairDesk SMS, sold as credit packs (1 credit per 160 characters), with a recurring fee for a local number.",
        source: ["sms"],
      },
      {
        topic: "Marketing",
        ours: OURS.marketing,
        theirs:
          "Email and SMS campaigns, automated follow-ups and review requests; Email Campaigns, Loyalty and Gift Cards are marked paid on Essential.",
        source: ["marketing", "pricing"],
      },
      {
        topic: "Field jobs and mail-in",
        ours: OURS.field,
        theirs: "A Mail-in Suite add-on with ShipStation shipping labels and a portal for business customers.",
        source: ["mailIn"],
      },
      {
        topic: "API",
        ours: OURS.api,
        theirs: "API access listed on every plan, with an API key or OAuth 2.0; Zapier listed among integrations.",
        source: ["pricing", "api", "integrations"],
      },
    ],
    theirFit: [
      "RepairDesk lists features Repairs helper does not have today: a buyback and trade-in widget, a Mail-in Suite, prepaid PIN sales for US carriers, an AI receptionist and phone system, a shared inbox for Messenger, Google Business and web chat, integrations with parts suppliers, and an interface that can be translated into many languages. If your shop depends on any of those, check them first.",
      "RepairDesk also says it migrates data from other systems for free. Repairs helper is in early access: repair history cannot be migrated in one step, and Stripe, Square, email and SMS each need setting up and testing before customers rely on them.",
    ],
    faqs: [
      {
        q: "Is Repairs helper a good RepairDesk alternative?",
        a: "It can be if you run an in-shop repair counter and want tickets, POS, inventory and a customer portal without per-store or per-user pricing during early access. If you rely on buyback, mail-in repairs, carrier PIN sales or a specific integration, check that first: those are not in Repairs helper.",
      },
      {
        q: "How does pricing compare for a shop with two stores?",
        a: "RepairDesk prices per store, so two stores on Essential start at $198 a month billed monthly, or $158 a month billed annually, before paid add-ons and SMS credits. Repairs helper is $0 for any number of locations during early access.",
      },
      {
        q: "Can I import my data from RepairDesk?",
        a: "Customers and products can be imported from a spreadsheet or CSV export. Repair history cannot be migrated in one step yet.",
      },
      {
        q: "Where did the RepairDesk details come from?",
        a: "From RepairDesk's own pricing, features, integrations and help pages, checked on November 1, 2026. Plans and prices change, so confirm on their site before deciding.",
      },
      {
        q: "Is Repairs helper affiliated with RepairDesk?",
        a: "No. Repairs helper is an independent product operated by Town Media Labs in Edmonton, Canada. RepairDesk is a trademark of its owner.",
      },
    ],
  },
  {
    slug: "orderry-alternative",
    competitor: "Orderry",
    summary: "Plans with per-employee and per-location fees, card terminals, field service and integrations, side by side.",
    metaTitle: "Orderry Alternative: Repairs helper Compared | Repairs helper",
    metaDescription:
      "Repairs helper and Orderry side by side: plans, per-employee and per-location fees, card terminals, inventory and integrations. Checked November 2026.",
    query: "Orderry alternative",
    h1: "Repairs helper as an Orderry alternative",
    lede:
      "Orderry is a work-order and POS platform for repair shops and other service businesses, with plans priced in US dollars. Repairs helper is a newer repair shop app in early access. This page puts the two side by side using only what Orderry publishes on its own website (checked November 1, 2026), so you can see where each fits.",
    checked: "2026-11-01",
    sources: {
      pricing: { href: "https://orderry.com/pricing/", label: "Orderry pricing page" },
      plansHelp: {
        href: "https://help.orderry.com/en/articles/9148864-orderry-subscription-plans-features-and-benefits",
        label: "Orderry help: subscription plans",
      },
      integrations: { href: "https://orderry.com/integrations/", label: "Orderry integrations page" },
      statusWidget: {
        href: "https://help.orderry.com/en/articles/9139796-work-order-status-widget",
        label: "Orderry help: work order status widget",
      },
      publicPages: {
        href: "https://help.orderry.com/en/articles/10079097-how-to-set-up-public-pages-for-work-orders-and-estimates",
        label: "Orderry help: public work order and estimate pages",
      },
      square: {
        href: "https://help.orderry.com/en/articles/12166156-how-do-i-connect-and-set-up-integration-with-square",
        label: "Orderry help: Square integration",
      },
      purchaseOrders: { href: "https://orderry.com/purchase-order-software-20379/", label: "Orderry purchase order page" },
      twilio: { href: "https://help.orderry.com/en/articles/9134669-integration-with-twilio", label: "Orderry help: Twilio integration" },
      notifications: {
        href: "https://orderry.com/customer-notification-system-20411/",
        label: "Orderry customer notifications page",
      },
      fieldService: {
        href: "https://orderry.com/field-service-management-software-20172/",
        label: "Orderry field service page",
      },
      api: { href: "https://orderry.readme.io/reference/getting-started-page", label: "Orderry API reference" },
      app: { href: "https://orderry.com/work-order-app-20197/", label: "Orderry app page" },
    },
    rows: [
      {
        topic: "Published price",
        ours: OURS.price,
        theirs: "Hobby $39 a month; Startup from $69, Business from $99 and Enterprise from $199 a month, in USD. Paying annually saves 10%.",
        source: ["pricing"],
      },
      {
        topic: "Staff accounts",
        ours: OURS.staff,
        theirs:
          "Hobby includes 2 employees. Startup, Business and Enterprise include 3, with extra employees at $6, $9 or $19 a month each, up to 15, 150 or 1,500.",
        source: ["pricing"],
      },
      {
        topic: "Work orders",
        ours: OURS.limits,
        theirs: "Hobby is limited to 100 work orders per 30 days; the other plans are not limited.",
        source: ["pricing", "plansHelp"],
      },
      {
        topic: "Locations",
        ours: OURS.locations,
        theirs: "Hobby is one location and cannot be extended; on the other plans each extra location costs $49, $79 or $179 a month.",
        source: ["pricing"],
      },
      {
        topic: "Trying it",
        ours: OURS.trying,
        theirs: "A 7-day free trial with no credit card required; no free plan.",
        source: ["pricing"],
      },
      {
        topic: "Customer portal",
        ours: OURS.portal,
        theirs:
          "A website widget where customers check work-order status by phone number (Startup and up), and public pages where clients view, approve and pay work orders and estimates.",
        source: ["statusWidget", "publicPages"],
      },
      {
        topic: "Point of sale",
        ours: OURS.pos,
        theirs: "Card terminals through Stripe, Square and SumUp, including Square Terminal and Stripe's readers, plus Tap to Pay.",
        source: ["integrations", "square"],
      },
      {
        topic: "Inventory",
        ours: OURS.inventory,
        theirs: "Serial tracking, purchase orders with reorder suggestions, barcode labels, stocktaking and bulk product import.",
        source: ["pricing", "purchaseOrders"],
      },
      {
        topic: "Online payments",
        ours: OURS.payments,
        theirs: "Stripe, Square and SumUp for payment links, scan-to-pay QR codes and invoice payments.",
        source: ["integrations"],
      },
      {
        topic: "Accounting",
        ours: OURS.accounting,
        theirs: "QuickBooks Online and Xero, with two-way sync of invoices and payments.",
        source: ["integrations"],
      },
      {
        topic: "Text messages",
        ours: OURS.sms,
        theirs: "Sent through your own Twilio, BulkSMS or Zadarma account, which you open and fund.",
        source: ["twilio"],
      },
      {
        topic: "Marketing",
        ours: OURS.marketing,
        theirs: "Bulk SMS campaigns, review requests, gift cards, loyalty points and online booking.",
        source: ["notifications", "pricing"],
      },
      {
        topic: "Field jobs",
        ours: OURS.field,
        theirs: "A dispatch calendar, and a mobile app for technicians to update jobs, capture photos and signatures and take payment on site.",
        source: ["fieldService"],
      },
      {
        topic: "Apps",
        ours: OURS.devices,
        theirs: "A free Orderry app for iOS and Android, and a separate dashboard app for owners.",
        source: ["app"],
      },
      {
        topic: "API",
        ours: OURS.api,
        theirs: "REST API with API keys, webhooks and an MCP server on Startup and up; Zapier, Make and n8n listed.",
        source: ["api", "pricing"],
      },
    ],
    theirFit: [
      "Orderry covers more than repair: it is also sold to service businesses such as HVAC and cleaning, and lists field service with on-site payments, payroll with commissions, phone calls through Aircall or Twilio Voice, one inbox for WhatsApp, Instagram and Messenger, online store sync with Shopify and WooCommerce, VIN and IMEI lookups, and native mobile apps. If your business depends on any of those, Repairs helper does not offer them today.",
      "Repairs helper is in early access: repair history cannot be migrated in one step, and Stripe, Square, email and SMS each need setting up and testing before customers rely on them.",
    ],
    faqs: [
      {
        q: "Is Repairs helper a good Orderry alternative?",
        a: "It can be if you run an in-shop repair counter and want tickets, POS, inventory and a customer portal without per-employee or per-location fees during early access. If you rely on field service, payroll, phone calls in the app or a specific integration, check that first: those are not in Repairs helper.",
      },
      {
        q: "How does pricing compare for a shop with five staff?",
        a: "On Orderry's Startup plan, five employees means the plan price from $69 a month plus two extra employees at $6 each, so from $81 a month before add-ons. Repairs helper includes every staff account at $0 during early access.",
      },
      {
        q: "Can I import my data from Orderry?",
        a: "Customers and products can be imported from a spreadsheet or CSV export. Repair history cannot be migrated in one step yet.",
      },
      {
        q: "Where did the Orderry details come from?",
        a: "From Orderry's own pricing, features, integrations and help pages, checked on November 1, 2026. Its prices are in US dollars. Plans change, so confirm on their site before deciding.",
      },
      {
        q: "Is Repairs helper affiliated with Orderry?",
        a: "No. Repairs helper is an independent product operated by Town Media Labs in Edmonton, Canada. Orderry is a trademark of its owner.",
      },
    ],
  },
  {
    slug: "mygadgetrepairs-alternative",
    competitor: "MyGadgetRepairs",
    summary: "Plans in pounds with user, ticket and shop limits, the free plan, portal, card terminals and integrations, side by side.",
    metaTitle: "MyGadgetRepairs Alternative: Repairs helper Compared | Repairs helper",
    metaDescription:
      "Repairs helper and MyGadgetRepairs side by side: published plans and limits, free options, portal, POS, inventory and integrations. Checked November 2026.",
    query: "MyGadgetRepairs alternative",
    h1: "Repairs helper as a MyGadgetRepairs alternative",
    lede:
      "MyGadgetRepairs is an established repair shop platform based in London, with plans priced in pounds sterling. Repairs helper is a newer one in early access. This page puts the two side by side using only what MyGadgetRepairs publishes on its own website (checked November 1, 2026), so you can see where each fits.",
    checked: "2026-11-01",
    sources: {
      pricing: { href: "https://www.mygadgetrepairs.com/pricing", label: "MyGadgetRepairs pricing page" },
      integrations: { href: "https://www.mygadgetrepairs.com/app-integration/", label: "MyGadgetRepairs integrations page" },
      features: { href: "https://www.mygadgetrepairs.com/features/", label: "MyGadgetRepairs features page" },
      inventory: {
        href: "https://www.mygadgetrepairs.com/features/robust-inventory-management/",
        label: "MyGadgetRepairs inventory page",
      },
      ticketing: {
        href: "https://www.mygadgetrepairs.com/features/repair-ticketing-management/",
        label: "MyGadgetRepairs ticketing page",
      },
      marketing: {
        href: "https://www.mygadgetrepairs.com/features/marketing-campaigns/",
        label: "MyGadgetRepairs marketing page",
      },
      portal: {
        href: "https://docs.mygadgetrepairs.com/customers/what-is-a-customer-portal/",
        label: "MyGadgetRepairs help: customer portal",
      },
      fieldJobs: {
        href: "https://docs.mygadgetrepairs.com/field-jobs/field-jobs-module-work/",
        label: "MyGadgetRepairs help: field jobs",
      },
      api: { href: "https://docs.mygadgetrepairs.com/api/public-api/", label: "MyGadgetRepairs help: public API" },
      webhooks: {
        href: "https://docs.mygadgetrepairs.com/system-settings/how-to-push-notifications-via-webhook/",
        label: "MyGadgetRepairs help: webhooks",
      },
    },
    rows: [
      {
        topic: "Published price",
        ours: OURS.price,
        theirs:
          "Four plans in GBP: Free for Life £0, Regular £30, Enterprise £60 (£54 billed yearly) and Premium £270 (£243 billed yearly) a month. Extra shops cost £40, £75 or £90 each, depending on the plan.",
        source: ["pricing"],
      },
      {
        topic: "Staff accounts",
        ours: OURS.staff,
        theirs: "Users per location: 1 on Free for Life, 2 on Regular, 10 on Enterprise and unlimited (fair usage) on Premium.",
        source: ["pricing"],
      },
      {
        topic: "Tickets and invoices",
        ours: OURS.limits,
        theirs: "25 a month on Free for Life and 75 on Regular; Enterprise and Premium list unlimited, with fair usage.",
        source: ["pricing"],
      },
      {
        topic: "Locations",
        ours: OURS.locations,
        theirs: "Free for Life is one shop only; Regular and Enterprise include one, with more at extra cost; Premium includes three.",
        source: ["pricing"],
      },
      {
        topic: "Trying it",
        ours: OURS.trying,
        theirs: "A Free for Life plan, and a 7-day free trial with no payment details required.",
        source: ["pricing"],
      },
      {
        topic: "Customer portal",
        ours: OURS.portal,
        theirs:
          "On all plans: customers follow tickets, accept or reject estimates, pay invoices (with a payment integration) and see warranties; access by email invitation.",
        source: ["pricing", "portal"],
      },
      {
        topic: "Point of sale",
        ours: OURS.pos,
        theirs: "Card terminal integrations listed for Dojo (Payment Sense) and the SumUp Solo reader, and card swiping through Authorize.net.",
        source: ["integrations"],
      },
      {
        topic: "Inventory",
        ours: OURS.inventory,
        theirs: "Serialised stock, purchase orders with partial receipts, barcode labels, transfers between locations, and spreadsheet import and export.",
        source: ["inventory"],
      },
      {
        topic: "Online payments",
        ours: OURS.payments,
        theirs: "Many gateways listed, including Stripe, Square, PayPal, Worldpay, Klarna and Authorize.net.",
        source: ["integrations"],
      },
      {
        topic: "Accounting",
        ours: OURS.accounting,
        theirs:
          "Xero and QuickBooks, each needing an extra recurring subscription, plus Sage Accounting, FreeAgent, MYOB AccountRight and Yuki.",
        source: ["integrations"],
      },
      {
        topic: "Text messages",
        ours: OURS.sms,
        theirs: "Through a third-party SMS gateway you connect, such as Twilio, ClickSend, textlocal or Vonage.",
        source: ["integrations"],
      },
      {
        topic: "Marketing",
        ours: OURS.marketing,
        theirs: "Email and SMS campaigns, coupons, loyalty rewards, gift cards, feedback surveys and a reviews widget.",
        source: ["marketing", "features"],
      },
      {
        topic: "Field jobs and mail-in",
        ours: OURS.field,
        theirs:
          "A field service module with a calendar, technician assignment and map view; mail-in repairs at intake, with courier integrations listed.",
        source: ["fieldJobs", "ticketing", "integrations"],
      },
      {
        topic: "API",
        ours: OURS.api,
        theirs: "A REST API with a key from the shop settings, and outgoing webhooks.",
        source: ["api", "webhooks"],
      },
    ],
    theirFit: [
      "MyGadgetRepairs lists a lot that Repairs helper does not have today: buyback and trade-in, loan devices, RMA returns, field service, mail-in repairs with courier integrations, an Apple GSX integration, device checks such as CheckMEND, gift cards and loyalty rewards, and many interface languages and currencies. If your shop depends on any of those, check them first.",
      "Its Free for Life plan also stays free, within its limits of one user, one shop and 25 tickets and invoices a month. Repairs helper is in early access: repair history cannot be migrated in one step, and Stripe, Square, email and SMS each need setting up and testing before customers rely on them.",
    ],
    faqs: [
      {
        q: "Is Repairs helper a good MyGadgetRepairs alternative?",
        a: "It can be if you run an in-shop repair counter and want tickets, POS, inventory and a customer portal with every staff account included during early access. If you rely on buyback, field service, mail-in repairs, Apple GSX or a specific integration, check that first: those are not in Repairs helper.",
      },
      {
        q: "MyGadgetRepairs has a free plan. How is Repairs helper different?",
        a: "MyGadgetRepairs' Free for Life plan lists one user, one shop and 25 tickets and invoices a month. Repairs helper has no plan tiers during early access, so every staff account and location is included. Its paid plans have not been announced and will be announced well before anything changes.",
      },
      {
        q: "Can I import my data from MyGadgetRepairs?",
        a: "Customers and products can be imported from a spreadsheet or CSV export. Repair history cannot be migrated in one step yet.",
      },
      {
        q: "Where did the MyGadgetRepairs details come from?",
        a: "From MyGadgetRepairs' own pricing, features, integrations and help pages, checked on November 1, 2026. Its prices are listed in pounds sterling. Plans change, so confirm on their site before deciding.",
      },
      {
        q: "Is Repairs helper affiliated with MyGadgetRepairs?",
        a: "No. Repairs helper is an independent product operated by Town Media Labs in Edmonton, Canada. MyGadgetRepairs is a trademark of its owner.",
      },
    ],
  },
];

export function compareBySlug(slug: string): ComparePage | undefined {
  return COMPARE_PAGES.find((page) => page.slug === slug);
}
