import { SHOTS } from "@/components/landing/media";
import type { Faq } from "@/lib/seo/schema";

import type { ShotData } from "../parts";

/**
 * The feature pages under /features/<slug>.
 *
 * Every sentence here describes something the code does today. Where a
 * workflow needs a provider account (payments, SMS, email, accounting, AI),
 * the page says so in `setup`. When the product changes, change this file in
 * the same commit.
 */

export type Point = { title: string; body: string };

export type FeaturePage = {
  slug: string;
  /** Short name for links and cards. */
  name: string;
  /** One line for the /features index card. */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  /** Search query this page is written to answer. */
  query: string;
  h1: string;
  lede: string;
  shot: ShotData;
  shotCaption: string;
  phoneShot?: { shot: ShotData; caption: string };
  workflowTitle: string;
  workflowIntro: string;
  steps: Point[];
  pointsTitle: string;
  points: Point[];
  setup: string[];
  faqs: Faq[];
  related: string[];
};

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "repair-ticket-management",
    name: "Repair tickets",
    summary:
      "Check devices in, track every repair through its status steps, and see which jobs are late.",
    metaTitle: "Repair Ticket Software for Repair Shops | Repairs helper",
    metaDescription:
      "Check devices in with a signature, move repairs through status steps, track due times by priority, log time and parts, and hand over with a paid invoice.",
    query: "repair ticket software",
    h1: "Repair tickets that follow the job from check-in to pickup",
    lede:
      "A repair ticket in Repairs helper holds the customer, the device, what is wrong, the work done, the parts ordered and the money taken. Staff open it from the counter, the bench or a phone, and everyone sees the same status.",
    shot: SHOTS.job,
    shotCaption:
      "A repair ticket on a counter tablet, captured from the app with demo data: status steps across the middle, a due-time badge, and buttons for parts, photos, messages, notes and printing.",
    phoneShot: {
      shot: SHOTS.jobPhone,
      caption: "The same ticket on a phone, with the next action pinned above the tab bar.",
    },
    workflowTitle: "How a repair moves through the shop",
    workflowIntro:
      "The New repair check-in is four short steps, built for a tablet on the counter. Email, passcode and IMEI are optional, so a busy desk can check a device in without typing everything.",
    steps: [
      {
        title: "Find or add the customer",
        body: "Search by name or phone, or add a new customer on the spot. Their past devices and repairs come with them.",
      },
      {
        title: "Pick the device and the problem",
        body: "Picture boxes for phone, tablet, laptop, computer, game console, TV, watch and other. The shop can rename, hide or add boxes and problem types in settings.",
      },
      {
        title: "Record the details and sign",
        body: "Make, model, serial and unlock code are saved on the customer's device record. The customer can sign the intake on screen, and a deposit can be taken right there.",
      },
      {
        title: "Work it, then hand it over",
        body: "Start repair moves the ticket to In Progress. Add parts, photos and notes, mark it Ready for Pickup, invoice it, and hand it over once it is paid.",
      },
    ],
    pointsTitle: "What a ticket keeps track of",
    points: [
      {
        title: "Status steps you can edit",
        body: "Built-in steps are New, In Progress, Waiting for Parts, Waiting on Customer, Ready for Pickup and Resolved. Owners can add their own steps in the Workflow settings.",
      },
      {
        title: "Due times by priority",
        body: "Each priority has a response target. Defaults are 4 hours for urgent, 24 for high, 72 for normal and 120 for low, and you can change them. Late repairs are flagged on the ticket and counted on Home.",
      },
      {
        title: "Checklists",
        body: "Save checklist templates (for example a pre-repair inspection or a quality check) and attach one to a ticket. Each item records when it was ticked.",
      },
      {
        title: "Parts on order",
        body: "Order a part from inside the ticket with supplier, cost and expected date. The ticket shows what it is waiting for, and a part order can be linked to a purchase order.",
      },
      {
        title: "Time on the job",
        body: "Technicians log time against a ticket. Billable time turns into labour lines on the invoice at your labour rate.",
      },
      {
        title: "Notes, photos and updates",
        body: "Private notes stay with staff. Public updates are visible to the customer in their portal and, with a sender set up, go out by email or text.",
      },
      {
        title: "Warranty repairs",
        body: "Mark a repair as warranty work and link it to the invoice line it is covering. Warranty days set on a product are copied onto each sale, so you can check whether cover is still active.",
      },
      {
        title: "A board for the workshop",
        body: "The shop-floor board shows every open repair as a large tile, grouped by status, and refreshes itself every 30 seconds. Leave it running on a wall TV.",
      },
    ],
    setup: [
      "Customer updates by email or SMS only leave the building once an email or SMS provider is set up for your shop.",
      "Printing uses your browser's print dialog, so any printer your computer can reach will work.",
    ],
    faqs: [
      {
        q: "Can I change the repair statuses?",
        a: "Yes. Owners can edit the list of ticket statuses in Settings under Workflow. Resolved stays as the final step so reports and the customer portal know when a repair is finished.",
      },
      {
        q: "Does it track which repairs are late?",
        a: "Yes. Every priority has a target in hours (by default 4 for urgent, 24 for high, 72 for normal and 120 for low). A ticket past its due time is marked late, and owners can be alerted once when that happens.",
      },
      {
        q: "Where is the device passcode stored?",
        a: "On the customer's device record, next to make, model and serial number. It is optional, and the check-in does not require it.",
      },
      {
        q: "Can customers sign at check-in?",
        a: "Yes. The intake has an optional on-screen signature, and the signature is printed on the ticket sheet.",
      },
      {
        q: "Can two technicians share one counter tablet?",
        a: "Yes. Each person can set a six-digit staff PIN and switch from the account menu, so work is recorded under the right name without a full sign-in each time.",
      },
    ],
    related: ["estimates-and-invoices", "inventory-management", "customer-portal"],
  },
  {
    slug: "point-of-sale",
    name: "Point of sale",
    summary:
      "Ring up accessories and repairs, take cash or card, and close the drawer against what the system expects.",
    metaTitle: "Repair Shop POS with Card Terminal Support | Repairs helper",
    metaDescription:
      "A POS for repair counters: cash and card, Stripe Terminal or Square Terminal, any bank card machine, cash drawer counts, refunds and store credit.",
    query: "repair shop POS",
    h1: "A point of sale for the repair counter",
    lede:
      "The Sell screen is a till for the things a repair shop sells over the counter: screen protectors, cables, chargers, cases and the repairs themselves. It shares stock and customers with the rest of the app, so a sale here updates inventory and the customer's history.",
    shot: SHOTS.sell,
    shotCaption:
      "The Sell screen on a tablet, captured from the app with demo data: product pictures on the left, the current sale with Cash, Card and More on the right.",
    phoneShot: {
      shot: SHOTS.invoicePhone,
      caption: "An invoice on a phone with the amount due and a Take payment button.",
    },
    workflowTitle: "A sale, start to finish",
    workflowIntro:
      "Most counter sales take a few taps. The same payment options appear when a customer pays for a repair invoice.",
    steps: [
      {
        title: "Add items",
        body: "Tap product pictures, search, or scan a barcode with a USB scanner or a paired phone camera.",
      },
      {
        title: "Attach a customer if you want one",
        body: "Walk-in sales do not need a customer. Attach one to put the sale on their history or use their store credit.",
      },
      {
        title: "Take payment",
        body: "Cash, card, cheque, store credit or other. A sale can be split between cash and card.",
      },
      {
        title: "Print or send the receipt",
        body: "Print a receipt from the browser, or email it when a sender is set up.",
      },
    ],
    pointsTitle: "Money at the counter",
    points: [
      {
        title: "Two ways to use a card machine",
        body: "Connected mode sends the amount to a Stripe Terminal or Square Terminal reader and marks the sale paid when the card is approved. Manual mode works with any standalone bank terminal: you key the amount there and record the payment here with one tap.",
      },
      {
        title: "Cash drawer sessions",
        body: "Open a drawer with a float. At close, the app works out what should be there (float, cash payments and cash deposits, less cash refunds) and records what was counted.",
      },
      {
        title: "Deposits",
        body: "Take money up front on a repair. The deposit is held as the customer's store credit with a printed receipt and is applied to the invoice when the repair is billed.",
      },
      {
        title: "Refunds and store credit",
        body: "Refund part or all of a payment. Give store credit, and spend it later at the till or against an invoice.",
      },
      {
        title: "Card on file",
        body: "With Stripe connected, a customer's card can be saved on Stripe's hosted page and charged later. Only the brand, last four digits and expiry are kept in Repairs helper.",
      },
      {
        title: "Serial numbers at the till",
        body: "Products tracked by serial number ask which unit you sold, so the right serial leaves stock.",
      },
    ],
    setup: [
      "Stripe and Square need your own account and credentials, and should be tested before you rely on them.",
      "A generic bank terminal will not report payments to Repairs helper. Use manual mode and record each card payment.",
      "Card processors charge their own fees.",
    ],
    faqs: [
      {
        q: "Which card readers work with the POS?",
        a: "Readers used through Stripe Terminal or Square Terminal can receive the amount from Repairs helper and mark the sale paid. Any other card machine works in manual mode: the cashier enters the amount on the machine and records the payment in the app.",
      },
      {
        q: "Do I need a barcode scanner?",
        a: "No. A USB scanner works anywhere in the app, and you can also pair a phone as a scanner by scanning a QR code on the till screen. Searching and tapping product pictures works without either.",
      },
      {
        q: "Can I sell from more than one device?",
        a: "Yes. Staff can sell from any signed-in phone, tablet or computer, and cash drawer sessions are recorded per location.",
      },
      {
        q: "Can customers pay part now and part later?",
        a: "Yes. An invoice can be partly paid and shows the balance owing until it is settled.",
      },
    ],
    related: ["estimates-and-invoices", "inventory-management", "integrations-and-api"],
  },
  {
    slug: "estimates-and-invoices",
    name: "Estimates and invoices",
    summary:
      "Quote a repair, get the customer's approval and signature online, then invoice and collect payment.",
    metaTitle: "Repair Estimates and Invoicing Software | Repairs helper",
    metaDescription:
      "Repair estimates customers approve and sign online, invoices with labour from logged time, deposits, partial payments, recurring invoices and statements.",
    query: "repair shop invoicing software",
    h1: "Repair estimates and invoices customers can approve and pay",
    lede:
      "Write an estimate on the ticket, send the customer a link, and get a yes or no with a signature. Approved work becomes an invoice without retyping a line.",
    shot: SHOTS.pickup,
    shotCaption:
      "The Ready for pickup list, captured from the app with demo data: one repair still needs an invoice, the other is paid and ready to hand over.",
    phoneShot: {
      shot: SHOTS.invoicePhone,
      caption: "An invoice on a phone showing the amount due.",
    },
    workflowTitle: "From quote to paid",
    workflowIntro: "Each step keeps a record, so you can see who approved what and when.",
    steps: [
      {
        title: "Write the estimate",
        body: "Add parts from stock, labour and other charges, choose the tax rate and mark which lines are taxable. An estimate can carry an expiry date.",
      },
      {
        title: "Send it for approval",
        body: "The customer opens the estimate from a private link, reads the lines, and approves or declines. Approving asks for a confirmation and an optional signature.",
      },
      {
        title: "Convert it to an invoice",
        body: "An approved estimate converts into an invoice with the same lines. When you invoice from the ticket, deposits already taken are applied and billable time becomes labour lines.",
      },
      {
        title: "Collect payment",
        body: "Take payment at the counter, or send the invoice so the customer can pay online once Stripe or Square is connected.",
      },
    ],
    pointsTitle: "Billing details that come up every week",
    points: [
      {
        title: "Invoice statuses",
        body: "Draft, sent, partly paid, paid and void. Owners can void an invoice; the record stays for your books.",
      },
      {
        title: "Recurring invoices",
        body: "Bill a customer on a schedule, for example a monthly service plan, from a recurring invoice template.",
      },
      {
        title: "Statements",
        body: "Print a customer statement showing invoices and what is still owed.",
      },
      {
        title: "Tax rates",
        body: "Set up the tax rates your shop charges, pick one per estimate or invoice and mark lines taxable or not. The rate is saved on the document, so changing it later does not rewrite old paperwork.",
      },
      {
        title: "Warranty on what you sell",
        body: "Products can carry warranty days. The number is copied onto each invoice line at the time of sale, and the clock starts on the invoice date.",
      },
      {
        title: "Accounting sync",
        body: "Sent and paid invoices, their customers, items and payments can be pushed to QuickBooks Online or Xero.",
      },
    ],
    setup: [
      "Online payment needs a Stripe or Square account connected to your shop.",
      "Emailing estimates and invoices needs an email provider set up; you can always copy the link or print instead.",
      "QuickBooks Online and Xero each need to be connected from Settings before anything syncs.",
    ],
    faqs: [
      {
        q: "Can customers approve an estimate without an account?",
        a: "Yes. Each estimate has its own private link. The customer can approve or decline from it, with an optional signature, without a password.",
      },
      {
        q: "Can I turn an estimate into an invoice?",
        a: "Yes. An approved estimate converts into an invoice with the same lines. Invoicing from the ticket also applies any deposits taken on that repair.",
      },
      {
        q: "Does it handle partial payments?",
        a: "Yes. An invoice can take several payments by different methods. It shows as partly paid with the balance due until it is settled.",
      },
      {
        q: "Will it sync with QuickBooks?",
        a: "QuickBooks Online and Xero are supported. Customers, items, invoices that have been sent or paid, and payments are pushed to the connected company. Draft invoices are not pushed, and an invoice voided after syncing is voided there too.",
      },
    ],
    related: ["repair-ticket-management", "point-of-sale", "customer-portal"],
  },
  {
    slug: "inventory-management",
    name: "Inventory",
    summary:
      "Keep parts and accessories counted, track serial numbers, and order from vendors with purchase orders.",
    metaTitle: "Repair Shop Inventory Management Software | Repairs helper",
    metaDescription:
      "Repair shop inventory: low-stock alerts, serial numbers, vendors, purchase orders, parts ordered for repairs, barcode labels and spreadsheet import.",
    query: "repair shop inventory software",
    h1: "Inventory for parts, accessories and serialised stock",
    lede:
      "Screens, batteries, cables and refurbished handsets all live in one stock list. Every sale, repair and delivery changes the count, and each change is recorded as an adjustment you can look back on.",
    shot: SHOTS.stock,
    shotCaption:
      "The Stock screen on a tablet, captured from the app with demo data: product groups such as screen guards, screens and batteries with the number in stock.",
    workflowTitle: "Restocking without the spreadsheet",
    workflowIntro: "Purchase orders and parts ordered for repairs share the same vendor list, so you can see what is coming and who it is for.",
    steps: [
      {
        title: "Set a low-stock level",
        body: "Give a product a reorder threshold and a reorder quantity. Products that fall to the threshold are flagged.",
      },
      {
        title: "Raise a purchase order",
        body: "Pick a vendor, add lines with their SKU and cost, and print the purchase order.",
      },
      {
        title: "Receive the delivery",
        body: "Receive the order in full or in part. Stock goes up, and serialised products ask for each unit's serial number.",
      },
      {
        title: "Use it on a repair or sell it",
        body: "Parts added to a ticket or sold at the till leave stock automatically.",
      },
    ],
    pointsTitle: "What the stock list handles",
    points: [
      {
        title: "Serial numbers",
        body: "Turn on serial tracking for items where each unit matters, such as refurbished phones or batteries under warranty. The count is the number of serials in stock, and each unit can be sold, returned or marked defective.",
      },
      {
        title: "Barcodes and labels",
        body: "Store SKU and UPC, scan with a USB scanner or a paired phone, and print barcode labels for your shelves.",
      },
      {
        title: "Product pictures",
        body: "Products get a picture from a built-in library chosen from the name, or you can upload your own photo. The pictures make the Sell screen faster to read.",
      },
      {
        title: "Import from a spreadsheet",
        body: "Bring products in from a CSV or spreadsheet. You review a preview before anything is saved; when AI is available it suggests which column is which.",
      },
      {
        title: "Add by photo",
        body: "Take a photo of a part and the AI suggests a name and category for Quick Add. Nothing is saved until you press Add, and the photo is not kept.",
      },
      {
        title: "Stock history",
        body: "Every change to a count (sale, repair, delivery, manual correction) is saved as a stock adjustment with a reason.",
      },
    ],
    setup: [
      "Add-by-photo and AI column matching depend on the AI service being available; the manual forms always work.",
      "Labels print through your browser, so use a label printer your computer already knows.",
    ],
    faqs: [
      {
        q: "Can I track individual serial numbers?",
        a: "Yes. Mark a product as serialised and each unit becomes its own record. Stock on hand is the count of serials in stock, and the till asks which unit was sold.",
      },
      {
        q: "Can I import my existing product list?",
        a: "Yes, from a CSV or spreadsheet. You see a preview and confirm before anything is saved.",
      },
      {
        q: "Does it warn me when stock is low?",
        a: "Yes, for any product with a low-stock level set. Leave the level empty to turn the alert off for that product.",
      },
      {
        q: "Can I order a part for a specific repair?",
        a: "Yes. Order the part from the ticket with supplier, cost and expected date. The ticket shows the part is on order, and the order can be added to a purchase order.",
      },
    ],
    related: ["point-of-sale", "repair-ticket-management", "integrations-and-api"],
  },
  {
    slug: "customer-portal",
    name: "Customer portal and check-in",
    summary:
      "Let customers check in, follow their repair, approve estimates and pay without calling the shop.",
    metaTitle: "Repair Status Portal and Online Check-In | Repairs helper",
    metaDescription:
      "A password-free portal for repair status, estimate approval and online payment, plus a walk-in check-in kiosk and a shop page for your customers.",
    query: "repair status portal for customers",
    h1: "A customer portal, check-in desk and shop page for your repair business",
    lede:
      "Most calls to a repair shop are some version of “is it ready yet?”. Repairs helper gives customers their own place to check, approve and pay, and gives walk-ins a way to check themselves in.",
    shot: SHOTS.home,
    shotCaption:
      "The staff Home screen on a counter tablet, captured from the app with demo data. Repairs that customers check in themselves join the same repair list as the ones your staff check in.",
    workflowTitle: "Four ways customers reach you",
    workflowIntro: "The shop page and the check-in desk stay off until the owner switches them on in Settings.",
    steps: [
      {
        title: "Your shop page",
        body: "One link (/s/your-shop) with picture boxes for Check my repair, Book a visit, Get a price and Pay a bill. Put it on your website, Google listing or receipts.",
      },
      {
        title: "Check-in desk",
        body: "A public check-in form for your shop. Print the QR code for the counter, or run it on a tablet in kiosk mode, which clears itself after each customer.",
      },
      {
        title: "Customer portal",
        body: "Customers sign in with a link sent to them, with no password to remember, and see their repairs, estimates and invoices.",
      },
      {
        title: "Your own website",
        body: "Add one script tag and a button opens your shop page over your site. Website enquiries can also arrive as leads through Splitforms.",
      },
    ],
    pointsTitle: "What customers can do without phoning",
    points: [
      {
        title: "Follow the repair",
        body: "See the status and the updates you mark as public on the ticket.",
      },
      {
        title: "Approve or decline estimates",
        body: "Read the lines, approve with an optional signature, or say no thanks. Your ticket shows the answer.",
      },
      {
        title: "Pay online",
        body: "Pay an invoice by card from the portal when Stripe or Square is connected.",
      },
      {
        title: "Ask for a new repair",
        body: "Start a new request with the same device and problem boxes your counter uses.",
      },
      {
        title: "Reminders and follow-ups",
        body: "Appointment reminders go out in the 24 hours before the visit. After pickup, a review request can send customers to your Google review page or any link you choose.",
      },
      {
        title: "Campaigns",
        body: "Set up follow-up messages that go out a set number of days after a repair is resolved, an invoice is paid or a customer is added.",
      },
    ],
    setup: [
      "Portal sign-in links, reminders, review requests and campaigns are sent by email or SMS, so a sender must be set up for your shop before customers receive them.",
      "Online payment needs Stripe or Square connected.",
      "The shop page stays out of search engines unless the owner turns that on.",
    ],
    faqs: [
      {
        q: "Do customers need a password for the portal?",
        a: "No. They ask for a sign-in link and open it. The link expires after a while and opens their portal for that shop only.",
      },
      {
        q: "Can the check-in run on a tablet by the door?",
        a: "Yes. Kiosk mode uses bigger text, removes links off the page and resets after each check-in so the next customer starts fresh.",
      },
      {
        q: "Can I put a repair status button on my website?",
        a: "Yes. Paste one script tag from Settings into your site. It adds a button that opens your shop page in a panel, and it follows whatever you switch on in Repairs helper.",
      },
      {
        q: "Will customers get text messages?",
        a: "Once an SMS provider is connected for your shop. Twilio is supported. Customer replies by text can be added back onto their ticket.",
      },
    ],
    related: ["repair-ticket-management", "estimates-and-invoices", "ai-assistant"],
  },
  {
    slug: "ai-assistant",
    name: "AI assistant",
    summary:
      "Ask about repairs, stock and sales, summarise long tickets and draft customer replies, by typing or by voice.",
    metaTitle: "AI Assistant for Repair Shops | Repairs helper",
    metaDescription:
      "An AI helper that finds repairs, customers and stock, summarises ticket notes, drafts customer replies and takes voice input. It asks before changing data.",
    query: "AI repair shop software",
    h1: "An AI assistant that knows your repair shop's records",
    lede:
      "The shop helper answers everyday questions from your own data (what is ready for pickup, which repairs are late, how today went) and takes you to the right screen. On a ticket, AI tools summarise long notes and draft a reply to the customer.",
    shot: SHOTS.assistant,
    shotCaption:
      "The shop assistant open over Home, captured from the app with demo data: suggested questions, a text box and a microphone button.",
    workflowTitle: "Where the AI helps during the day",
    workflowIntro: "Each tool works on the shop you are signed into and respects your role's permissions.",
    steps: [
      {
        title: "Ask the helper",
        body: "Type or speak: “What's ready for pickup?”, “Which repairs are late?”, “How did we do today?”. It searches your repairs, customers, stock and sales.",
      },
      {
        title: "Summarise a ticket",
        body: "Long note threads become a short summary, useful when a repair changes hands or a customer calls.",
      },
      {
        title: "Draft a reply",
        body: "Get a draft customer message based on the ticket. You edit it and decide whether to send it.",
      },
      {
        title: "Add stock by voice or photo",
        body: "Say what arrived or photograph a part, and the assistant fills in the form for you to check.",
      },
    ],
    pointsTitle: "How it is kept safe",
    points: [
      {
        title: "It cannot run arbitrary actions",
        body: "The model only picks from a fixed set of intents, such as search, add or remove a product. The server checks the request before anything happens.",
      },
      {
        title: "It asks before it changes things",
        body: "Changes need your confirmation, and removals are written to the audit log.",
      },
      {
        title: "Daily limits",
        body: "Each shop has daily limits on AI requests (400 text, 200 voice and 100 photo requests a day), which a normal counter does not come close to.",
      },
      {
        title: "Works without AI too",
        body: "If the AI service is off, every screen still works the normal way. AI is a shortcut, not the only way in.",
      },
    ],
    setup: [
      "AI features run through a third-party AI provider. If no provider is available, AI tools are switched off and the rest of the app is unaffected.",
      "Voice input depends on your browser, your microphone permission and a speech-to-text provider being available.",
    ],
    faqs: [
      {
        q: "Which AI models does it use?",
        a: "The AI layer is provider-agnostic. It can run on Anthropic, OpenAI and several other hosted or self-hosted models, chosen by the service configuration.",
      },
      {
        q: "Can the assistant change my data on its own?",
        a: "No. It chooses from a fixed set of actions, the server validates them, and changes need your confirmation.",
      },
      {
        q: "Does it send replies to customers automatically?",
        a: "No. Reply drafts appear for you to edit. Nothing is sent until a person sends it.",
      },
      {
        q: "Does voice work on every device?",
        a: "Voice input depends on the browser and microphone access. Typing works everywhere.",
      },
    ],
    related: ["repair-ticket-management", "inventory-management", "customer-portal"],
  },
  {
    slug: "integrations-and-api",
    name: "Integrations and API",
    summary:
      "Sync with QuickBooks Online or Xero, take payments through Stripe or Square, and connect anything else through the REST API and webhooks.",
    metaTitle: "Repair Shop Software Integrations, API and Webhooks | Repairs helper",
    metaDescription:
      "Connect Repairs helper to QuickBooks Online, Xero, Stripe, Square and Twilio, export CSV, and build on a REST API with webhooks for 12 shop events.",
    query: "repair shop software QuickBooks integration",
    h1: "Integrations, a REST API and webhooks for your repair shop",
    lede:
      "Your shop's records should go where the rest of the business lives. Repairs helper pushes billing to your accounting software, takes payments through established processors, and gives developers an API with keys and webhooks.",
    shot: SHOTS.dashboard,
    shotCaption:
      "The Shop overview, captured from the app with demo data: takings today and over seven days, money owed and repairs by status.",
    workflowTitle: "Connecting a service",
    workflowIntro: "Every integration is connected by an owner from Settings and can be disconnected the same way.",
    steps: [
      {
        title: "Accounting",
        body: "Connect QuickBooks Online or Xero. Customers, items, invoices and payments are pushed on a schedule or with Sync now, and failures are retried on the next pass.",
      },
      {
        title: "Payments",
        body: "Connect Stripe or Square for online invoice payments and their card readers.",
      },
      {
        title: "Messages",
        body: "Email through Resend or SMTP, and SMS through Twilio, so updates, reminders and campaigns reach customers.",
      },
      {
        title: "Website leads",
        body: "Connect a Splitforms form to your Leads page with a webhook, or post enquiries from your own form to the public leads endpoint.",
      },
    ],
    pointsTitle: "For developers",
    points: [
      {
        title: "REST API",
        body: "Version 1 covers tickets, customers, estimates, invoices, payments, products, appointments and leads. Keys are created by an owner in Settings and are bound to one shop.",
      },
      {
        title: "Webhooks",
        body: "Get a signed POST when a ticket is created, changes status or is resolved, a customer is created, an invoice is created, paid or voided, a payment is recorded, an estimate is approved or declined, an appointment is created or a lead comes in.",
      },
      {
        title: "Pagination built for exports",
        body: "Lists support page numbers for browsing and cursors for walking a full export without skipped rows.",
      },
      {
        title: "CSV exports",
        body: "Owners can export customers, invoices, payments and report data (revenue, products, technicians, tickets) to CSV at any time.",
      },
    ],
    setup: [
      "Each integration needs an account with that provider. Providers may charge their own fees.",
      "API keys act with owner permissions in v1; issue one key per integration and revoke it when you stop using it.",
    ],
    faqs: [
      {
        q: "Does it work with QuickBooks Online and Xero?",
        a: "Yes, both. Connect one from Settings and Repairs helper pushes customers, items, sent and paid invoices, and payments.",
      },
      {
        q: "Is there an API?",
        a: "Yes. A REST API at /api/v1 with bearer keys covers tickets, customers, estimates, invoices, payments, products, appointments and leads. GET /api/v1 returns a description of the endpoints.",
      },
      {
        q: "Can I export my data?",
        a: "Owners can export customers, invoices, payments and report data to CSV. A single archive of every record is not available yet.",
      },
      {
        q: "Can I move from another repair system?",
        a: "Customers and products can be imported from a spreadsheet or CSV. A one-click migration of repair history from another system is not available yet.",
      },
    ],
    related: ["estimates-and-invoices", "point-of-sale", "customer-portal"],
  },
];

export function featureBySlug(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((page) => page.slug === slug);
}
