import type { Faq } from "@/lib/seo/schema";

import type { Point } from "./features";

/**
 * Guides under /guides/<slug>: practical answers for people running a repair
 * shop. Each opens with a short answer that stands on its own, so a reader (or
 * an answer engine) gets the point from the first paragraph.
 *
 * Rules for this file: no invented statistics or survey numbers, worked
 * examples are labelled as examples, legal topics say "check the law where you
 * operate", and the "In Repairs helper" part uses only product facts that also
 * appear on the feature pages.
 */

export type GuideSection = {
  /** The h2; its anchor id is derived from it. */
  heading: string;
  body: string[];
  /** A bulleted list after the paragraphs. */
  list?: string[];
  /** Numbered steps after the paragraphs. */
  steps?: Point[];
  /** Sample wording to copy, shown as a quote. */
  sample?: string;
};

export type Guide = {
  slug: string;
  /** Short name for cards and the breadcrumb. */
  name: string;
  /** One line for the /guides index card. */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  /** Search query this guide is written to answer. */
  query: string;
  h1: string;
  /** The short answer at the top of the page. */
  answer: string;
  /** ISO dates. */
  published: string;
  updated: string;
  sections: GuideSection[];
  inApp: string[];
  faqs: Faq[];
  /** Feature page slugs. */
  related: string[];
};

export const GUIDES: Guide[] = [
  {
    slug: "what-is-repair-shop-software",
    name: "What is repair shop software?",
    summary: "What it does, who uses it, how it is priced and a checklist for choosing one.",
    metaTitle: "What Is Repair Shop Software? Features, Costs, Choosing | Repairs helper",
    metaDescription:
      "Repair shop software explained: what it does for phone, computer and electronics repair shops, how it is priced, and a checklist for choosing one.",
    query: "what is repair shop software",
    h1: "What is repair shop software?",
    answer:
      "Repair shop software is the system a repair business uses to check devices in, track each repair from intake to pickup, quote and invoice, sell over the counter, keep parts in stock and keep customers updated. It replaces paper tickets, a separate till and spreadsheets with one record for each customer and device.",
    published: "2026-11-01",
    updated: "2026-11-01",
    sections: [
      {
        heading: "What it does",
        body: [
          "Most repair shop software is built around the repair ticket: one record that follows a device from the counter to the bench and back. Around it sit the other jobs a shop does every day.",
        ],
        list: [
          "Repair tickets: intake details, the fault, status steps, notes, photos, parts used and time spent.",
          "Estimates and invoices: quotes the customer approves, deposits, part payments and receipts.",
          "Point of sale: accessories and repairs on one bill, cash and card, and a cash drawer count at the end of the day.",
          "Inventory: parts and accessories with stock levels, suppliers, purchase orders and serial numbers.",
          "Customer updates: texts and emails when a repair changes status, and a page where customers can check for themselves.",
          "Reports: money in, repairs in and out, time to fix and best sellers.",
          "Connections: accounting software, card processors and, for developers, an API.",
        ],
      },
      {
        heading: "Who uses it",
        body: [
          "Independent phone repair shops, computer and laptop repair shops, electronics and game console repair shops, and chains with several locations. The front desk uses it to check devices in and take payment; technicians use it to see what to work on next and to record parts and time; owners use it to see what the shop earned and what is late.",
        ],
      },
      {
        heading: "How it is priced",
        body: [
          "Most products publish monthly plans that differ by the number of users, the number of locations or the features included, and some charge separately for text messages. Card processing is usually billed by the payment provider on top.",
          "For example, on their own pricing pages RepairShopr listed monthly plans from $69.99 to $149.99 USD (checked October 28, 2026), RepairDesk listed $99 and $149 per store per month for its two priced plans, and Orderry listed plans starting at $39, $69, $99 and $199 a month with fees for extra employees and locations (both checked November 1, 2026). Repairs helper is free during early access, with every staff account included and no credit card.",
          "To compare like with like, price each option for your own number of staff and locations, then add message and card fees.",
        ],
      },
      {
        heading: "How to choose repair shop software",
        body: ["Run through these checks before you commit, and test the shortlist with real repairs."],
        steps: [
          {
            title: "Match it to your devices",
            body: "Check the intake asks for what your repairs need: IMEI or serial, passcode, condition, accessories left, a signature.",
          },
          {
            title: "Count seats and locations",
            body: "Write down how many people sign in and how many stores you run, and price every plan for that number.",
          },
          {
            title: "Check your card machine",
            body: "Find out whether the POS can send the amount to your card reader, or whether staff will key it in twice.",
          },
          {
            title: "Price your messages",
            body: "Ask how texts and emails are sent and billed. Status updates are one of the main reasons shops buy this kind of software.",
          },
          {
            title: "Plan the move",
            body: "Ask what can be imported (customers, products, open repairs, history) and how you can export your data if you leave.",
          },
          {
            title: "Try it on a busy hour",
            body: "Check a device in, sell an accessory and hand over a paid repair on the tablet or phone you will really use.",
          },
        ],
      },
      {
        heading: "Signs you have outgrown paper and spreadsheets",
        body: ["If any of these happen every week, a system will pay for the time it takes to set up."],
        list: [
          "Customers call to ask whether their device is ready.",
          "A repair is late and nobody noticed until the customer did.",
          "A part was ordered twice, or not at all.",
          "The cash at closing does not match the day's sales.",
          "You cannot say which repairs make the shop money.",
        ],
      },
    ],
    inApp: [
      "Repairs helper is repair shop software for independent phone, computer and electronics repair shops, built by Town Media Labs in Edmonton, Canada. It covers repair tickets, estimates and invoices, a point of sale with card terminal support, inventory with serial numbers and purchase orders, a customer portal and check-in desk, and an AI assistant.",
      "It runs in the browser on a phone, tablet or computer, and is free during early access with no credit card.",
    ],
    faqs: [
      {
        q: "What is the difference between repair shop software and a POS?",
        a: "A POS rings up sales. Repair shop software also tracks each repair from check-in to pickup: the device, the fault, the status, parts on order, time spent and messages to the customer. Repair shop software usually includes a POS for counter sales as well.",
      },
      {
        q: "Is there free repair shop software?",
        a: "Repairs helper is free during early access, with every staff account included and no credit card. With any free option, check what it leaves out and what happens when a free period ends.",
      },
      {
        q: "Does a one-person repair shop need software?",
        a: "Not on day one, but even a single technician gains from keeping devices, promised dates, parts on order and payments in one place, and from customers checking status without calling.",
      },
      {
        q: "Can repair shop software run on a phone or tablet?",
        a: "Browser-based software runs on any device with a modern browser. Repairs helper works on phones, tablets and computers, and its Easy mode uses large buttons for counter work.",
      },
    ],
    related: ["repair-ticket-management", "point-of-sale", "inventory-management"],
  },
  {
    slug: "repair-intake-checklist",
    name: "Repair intake checklist",
    summary: "What to record when a customer drops a device off, so the bench has what it needs and pickup has no surprises.",
    metaTitle: "Repair Intake Checklist: What to Record at Check-In | Repairs helper",
    metaDescription:
      "A repair intake checklist for phone, computer and electronics shops: customer details, device condition, accessories, passcodes, spending limits and signature.",
    query: "repair intake checklist",
    h1: "Repair intake checklist: what to record when a device is dropped off",
    answer:
      "At check-in, record who the customer is and how to reach them, exactly which device it is (make, model, serial or IMEI), its condition before anyone works on it, the fault in the customer's words, what was left with it, whether you may unlock it to test, how much you may spend without asking, the deposit and the promised date. Then get a signature on your repair terms. Photos of the device take seconds and settle most disputes later.",
    published: "2026-11-01",
    updated: "2026-11-01",
    sections: [
      {
        heading: "Why intake matters",
        body: [
          "Check-in is the only moment you and the customer look at the device together. A dent, a lifted screen or a missing screw that is not written down then becomes your word against theirs at pickup.",
          "A good intake also saves the bench a phone call. The technician knows the fault, whether the device can be unlocked and how much they can spend before they open it.",
        ],
      },
      {
        heading: "The checklist",
        body: ["Ask in the same order every time, so nothing is skipped when the counter is busy."],
        steps: [
          {
            title: "Customer",
            body: "Name, mobile number, and how they would like to hear from you: text, email or a call.",
          },
          {
            title: "Device",
            body: "Type, make, model and colour, plus the serial number or IMEI. On most phones, dialling *#06# shows the IMEI.",
          },
          {
            title: "Condition before work",
            body: "Note and photograph cracks, dents, scratches, a bent frame, a swollen battery, missing screws and signs of liquid. Note whether it powers on.",
          },
          {
            title: "The fault, in the customer's words",
            body: "What happened, what they see, and what they have already tried. “Dropped it, screen black but it still vibrates” helps the bench more than “screen”.",
          },
          {
            title: "Quick tests at the counter",
            body: "If it powers on, check the screen and touch, buttons, cameras, speakers, microphone, charging and Wi-Fi, and write down what already fails.",
          },
          {
            title: "What came with it",
            body: "Cases, SIM and memory cards, chargers, cables, controllers and styluses. List them, or hand them back before the customer leaves.",
          },
          {
            title: "Passcode and data",
            body: "Ask whether you may have the passcode or login to test the device; if not, note that some tests wait until pickup. Ask whether the data is backed up and record the answer.",
          },
          {
            title: "Price and spending limit",
            body: "Agree the quoted price or a range, and the amount you may spend without asking. Anything above it waits for the customer's approval.",
          },
          {
            title: "Deposit and promised date",
            body: "Take a deposit if you are ordering a part, write down the promised date, and say how you will update the customer if it slips.",
          },
          {
            title: "Terms, signature and tag",
            body: "Have the customer sign your repair terms, give them a ticket number or receipt, and label the device and its bag with the same number.",
          },
        ],
      },
      {
        heading: "Keeping it fast at a busy counter",
        body: [
          "Make only the essentials required (name, phone number, device and fault) and keep everything else optional, so a queue does not form while someone types an email address.",
          "Record condition with photos rather than long notes, and use a fixed list of common problems, such as cracked screen, battery or charging port, so tickets read the same way and reports make sense later.",
        ],
      },
      {
        heading: "What your intake terms should cover",
        body: ["Short, plain terms printed on the ticket do more than a long contract nobody reads."],
        list: [
          "Existing damage: faults and damage noted at check-in were there before the repair.",
          "Data: back up before drop-off; say whether the repair could erase data.",
          "Approval: work above the agreed amount needs the customer's OK.",
          "Warranty: what is covered, for how long, and what voids it.",
          "Unclaimed devices: how long you keep a finished repair and what happens after your reminders.",
          "Payment: devices are released when the bill is paid.",
        ],
      },
      {
        heading: "Check your terms locally",
        body: [
          "Consumer protection rules differ between provinces, states and countries. Have a lawyer or your local business association check your terms against the rules where you operate.",
        ],
      },
    ],
    inApp: [
      "New repair in Repairs helper is four short steps: find or add the customer, pick the device and the problem from picture boxes, record make, model, serial and unlock code, and sign. Email, passcode and IMEI are optional, so a busy desk is not held up.",
      "The customer can sign on screen, a deposit can be taken at the same time, photos can be added to the ticket, and a checklist template such as a pre-repair inspection can be attached and ticked off. Walk-ins can also check themselves in from a QR code or a tablet in kiosk mode.",
    ],
    faqs: [
      {
        q: "Should I ask for the customer's passcode?",
        a: "Ask, but do not insist. With the passcode you can test the device fully before and after the repair. If the customer would rather not share it, note that on the ticket, test what you can, and check the rest with them at pickup.",
      },
      {
        q: "Do I need to take photos at check-in?",
        a: "It is the fastest way to record condition. A few photos of the front, back and edges, taken before any work, settle most disagreements about scratches and dents at pickup.",
      },
      {
        q: "What should a customer sign at drop-off?",
        a: "Your repair terms: existing damage, data, approval for extra work, warranty, how long you keep unclaimed devices, and payment before release. Keep a copy with the ticket.",
      },
      {
        q: "What is the minimum needed to check a device in?",
        a: "A name, a phone number, the device and the fault. Everything else is useful, but those four are enough to start the repair and reach the customer.",
      },
    ],
    related: ["repair-ticket-management", "customer-portal", "estimates-and-invoices"],
  },
  {
    slug: "how-to-price-repairs",
    name: "How to price repairs",
    summary: "Landed part cost, labour at a real shop rate and a margin, with a worked example.",
    metaTitle: "How to Price Phone and Computer Repairs | Repairs helper",
    metaDescription:
      "A simple way to price repairs: landed part cost, labour time at your shop rate and a margin, with a worked example and when to quote a range instead.",
    query: "how to price phone repairs",
    h1: "How to price phone and computer repairs",
    answer:
      "Price each repair from three pieces: the landed cost of the part (its price plus shipping, duties and an allowance for parts that fail), the time the job really takes multiplied by what an hour at your bench costs, and a margin on top. Check the result against what nearby shops charge, and quote a range instead of a fixed price until the fault is diagnosed.",
    published: "2026-11-01",
    updated: "2026-11-01",
    sections: [
      {
        heading: "Start from the landed cost of the part",
        body: [
          "The price on the supplier's website is not your cost. Add shipping, duties and payment fees, and allow for parts that arrive dead or fail early. If, say, one screen in twenty comes back under warranty, part of that cost belongs in the price of the other nineteen.",
        ],
      },
      {
        heading: "Work out what an hour at the bench costs",
        body: [
          "Add up a month of costs: wages (including your own), rent, tools, software, insurance and utilities. Divide by the hours actually spent repairing in that month, not the hours the shop is open. That is your bench cost per hour.",
          "Then time your common repairs from start to finish, including testing, cleaning and paperwork, not just the part swap.",
        ],
      },
      {
        heading: "A worked example",
        body: ["These numbers are an example to show the method, not a suggested price."],
        steps: [
          {
            title: "Landed part cost: $44",
            body: "A $38 screen, plus $4 shipping and duties, plus a $2 allowance for parts that fail.",
          },
          {
            title: "Labour cost: $50",
            body: "40 minutes at a bench cost of $75 an hour (for example, $7,500 of monthly costs over 100 repair hours).",
          },
          {
            title: "Total cost: $94",
            body: "What this repair costs you before any profit.",
          },
          {
            title: "Price at a 30% margin: $135",
            body: "Divide cost by 1 minus the margin: $94 ÷ 0.70 = $134.29, rounded up to $135.",
          },
        ],
      },
      {
        heading: "Markup and margin are not the same",
        body: [
          "Markup is profit as a share of cost; margin is profit as a share of the price. A part that costs $100 and sells for $150 has a 50% markup but a 33% margin. Decide which one your targets mean, or prices slowly drift too low.",
        ],
      },
      {
        heading: "Quote a range until you have diagnosed",
        body: [
          "For faults that need the device opened (no power, liquid damage, board faults), quote a diagnostic fee and a price range, then get approval for the final number before you go ahead.",
          "Agree an amount you may spend without asking, so a small surprise does not stop the job while you wait for a call back.",
        ],
      },
      {
        heading: "Price part grades separately",
        body: [
          "If you stock more than one grade of a part, such as original and aftermarket screens, price each on its own landed cost and warranty, let the customer choose, and write the grade on the invoice.",
        ],
      },
      {
        heading: "Check the market, then review regularly",
        body: [
          "Look at what shops near you publish for common repairs, but do not copy a price that does not cover your own costs. Review prices whenever a part's cost changes noticeably, and go through the full list every few months.",
        ],
      },
    ],
    inApp: [
      "In Repairs helper, repairs can be set up as products with a cost and a price, and added to an estimate, invoice or counter sale. Technicians log time on a ticket, and billable time becomes labour lines at your labour rate when you invoice.",
      "Estimates go to the customer by private link for approval with an optional signature, and Reports show money in, best-selling products and time to fix.",
    ],
    faqs: [
      {
        q: "How much should a repair shop charge per hour?",
        a: "Enough to cover what an hour at the bench costs you (wages, rent, tools, software, insurance and utilities, divided by the hours actually spent repairing) plus your profit. There is no single right number; work it out from your own costs, then compare with local shops.",
      },
      {
        q: "Should I charge for diagnosis?",
        a: "You can charge a diagnostic fee for faults that need the device opened, and take it off the repair price if the customer goes ahead. Say so before you start and put it on the estimate.",
      },
      {
        q: "What is the difference between markup and margin?",
        a: "Markup is profit divided by cost; margin is profit divided by price. A part that costs $100 and sells for $150 has a 50% markup and a 33% margin.",
      },
      {
        q: "How often should I change my repair prices?",
        a: "Whenever a part's landed cost changes noticeably, plus a full review of the price list every few months.",
      },
    ],
    related: ["estimates-and-invoices", "repair-ticket-management", "inventory-management"],
  },
  {
    slug: "repair-warranty-policy",
    name: "Repair warranty policy",
    summary: "What a repair warranty should cover, how long it lasts, what voids it, and sample wording.",
    metaTitle: "Repair Warranty Policy: What to Cover, With a Sample | Repairs helper",
    metaDescription:
      "How to write a repair warranty for a phone, computer or electronics shop: what it covers, how long it lasts, what voids it, and sample wording to adapt.",
    query: "repair shop warranty policy",
    h1: "How to write a repair warranty policy (with a sample)",
    answer:
      "A repair warranty should say what is covered (the part you fitted and your workmanship), for how long (counted from the invoice date), what is not covered (new physical or liquid damage, other faults, someone else opening the device, software and data), and what the customer gets if a claim is accepted: a repair, a replacement part or a refund. Print it on the invoice so the dates are never in doubt.",
    published: "2026-11-01",
    updated: "2026-11-01",
    sections: [
      {
        heading: "What to cover",
        body: [
          "Cover the part you fitted and the work you did, not the whole device. A warranty on a new charging port should not turn into free repairs for an unrelated camera fault.",
        ],
      },
      {
        heading: "How long it should last",
        body: [
          "Choose a period you can stand behind for the grade of part you use; some shops give longer cover on premium parts than on economy ones. Count it from the invoice or pickup date and print the end date if you can.",
          "Consumer law where you operate may give customers rights beyond your written warranty, and your policy cannot take those away. Check the rules for your province, state or country.",
        ],
      },
      {
        heading: "What voids it",
        body: ["List the exclusions plainly, so the conversation at the counter is short."],
        list: [
          "New physical damage, such as drops, cracks or pressure marks.",
          "Liquid exposure after the repair.",
          "The device being opened or repaired by someone else afterwards.",
          "Software, data and settings.",
          "Faults in parts you did not replace.",
          "Normal battery wear, as opposed to a defective battery.",
        ],
      },
      {
        heading: "How claims work",
        body: [
          "Ask the customer to bring the device and the invoice. Test it, confirm the fault is in the part or work you covered, then repair or replace it, or refund the repair if you cannot.",
          "Record the claim against the original repair, so you can see which parts and suppliers cause the most returns.",
        ],
      },
      {
        heading: "Sample warranty wording to adapt",
        body: [
          "Change the period and the details to suit your shop, and have the final wording checked against the consumer rules where you operate.",
        ],
        sample:
          "We guarantee the parts we fit and our workmanship for 90 days from the invoice date. If the repaired part fails in normal use during that time, we will repair or replace it at no charge, or refund the repair if we cannot. This warranty does not cover new physical or liquid damage, faults in parts we did not replace, devices opened or repaired by anyone else after our repair, software or data, or normal battery wear. Please bring the device and your invoice. This warranty does not affect your rights under consumer law.",
      },
    ],
    inApp: [
      "In Repairs helper, warranty days can be set on a product, including repair products. The number is copied onto each invoice line at the time of sale and counted from the invoice date, so you can check whether cover is still active.",
      "A repair can be marked as warranty work and linked to the invoice line it covers.",
    ],
    faqs: [
      {
        q: "How long should a repair warranty be?",
        a: "Long enough that you can stand behind the part you used, and never shorter than local consumer law requires. Whatever you choose, state the period and count it from the invoice date.",
      },
      {
        q: "Does a repair warranty cover the whole device?",
        a: "Normally no. It covers the part you fitted and the work you did. A different fault is a new repair.",
      },
      {
        q: "What voids a repair warranty?",
        a: "Common exclusions are new physical or liquid damage, someone else opening or repairing the device after you, software and data problems, and normal battery wear. List them in the policy.",
      },
      {
        q: "Do I have to give a warranty on repairs?",
        a: "Consumer protection law in many places gives customers rights whether or not you offer a written warranty. A clear written policy sets expectations and makes claims quicker to settle.",
      },
    ],
    related: ["estimates-and-invoices", "repair-ticket-management", "point-of-sale"],
  },
  {
    slug: "unclaimed-repairs-policy",
    name: "Unclaimed repairs",
    summary: "How to prevent devices being left behind, a reminder schedule, and what to check before disposing of anything.",
    metaTitle: "What to Do When Customers Don't Pick Up Repairs | Repairs helper",
    metaDescription:
      "How repair shops prevent and handle unclaimed devices: clear terms at drop-off, deposits, a reminder schedule, a final notice and checking local law.",
    query: "customer not picking up repaired device",
    h1: "What to do when customers don't pick up their repairs",
    answer:
      "Prevent it at drop-off: put a pickup period and what happens after it in the terms the customer signs, take a deposit on ordered parts, and confirm a working phone number. When the repair is ready, send reminders on a fixed schedule, log every attempt, then send a final written notice. What you may do with the device after that depends on the law where you operate, so check it before you sell, recycle or dispose of anything.",
    published: "2026-11-01",
    updated: "2026-11-01",
    sections: [
      {
        heading: "Prevent it at drop-off",
        body: ["Most unclaimed repairs are easier to prevent than to resolve."],
        list: [
          "State a pickup period in the terms the customer signs, such as 30, 60 or 90 days after you tell them it is ready, and what happens after it.",
          "If you charge storage after that period, say so in the terms before the work starts.",
          "Take a deposit that covers any part you order.",
          "Confirm the phone number at the counter, and ask how the customer prefers to be contacted.",
        ],
      },
      {
        heading: "An example reminder schedule",
        body: ["Pick a schedule, write it down and follow it for every customer, so nobody is treated differently."],
        steps: [
          { title: "Ready", body: "Tell the customer the repair is ready, with the amount due and your opening hours." },
          { title: "After 3 days", body: "Send a friendly reminder by the same channel." },
          { title: "After 7 days", body: "Phone the customer, and try email if they do not answer." },
          { title: "After 14 days", body: "Remind them of the pickup period in your terms and the date it ends." },
          {
            title: "Final notice",
            body: "Send a written notice that gives a last date to collect and says what will happen after it, as your terms and local law allow.",
          },
        ],
      },
      {
        heading: "Keep a record of every attempt",
        body: [
          "Write down the date, the channel and the result of every reminder on the repair ticket. If the customer turns up months later, or disputes what happened, that record is what you will rely on.",
        ],
      },
      {
        heading: "Before you sell, recycle or dispose of a device",
        body: [
          "Rules on goods left with a business, often called unclaimed, uncollected or abandoned goods, differ between provinces, states and countries. Some require written notice, a waiting period, or a sale process that credits the customer with any money raised. Check the rules where you operate, or ask a lawyer, and follow your signed terms.",
          "Never go through the customer's data. If a device is eventually disposed of, erase it or use a recycler that destroys data.",
        ],
      },
      {
        heading: "Keep the pickup shelf moving",
        body: [
          "Keep finished repairs on their own shelf, in order of the date they were ready, so old ones stand out. Go through it once a week and send whatever reminder is due.",
        ],
      },
    ],
    inApp: [
      "Repairs helper lists finished repairs on the Ready for pickup screen, showing whether each one is invoiced and paid. When you mark a ticket Ready for Pickup you can send the customer an update by text or email if a sender is set up, and public updates on the ticket keep a record of what was sent.",
      "A deposit taken at check-in is held as the customer's store credit and applied to the invoice when the repair is billed.",
    ],
    faqs: [
      {
        q: "How long should I keep an unclaimed repair?",
        a: "Long enough to be fair and to meet the rules where you operate, and stated in the terms the customer signs. Pick a period, such as 30, 60 or 90 days after you tell the customer it is ready, and apply it to everyone.",
      },
      {
        q: "Can I sell a device that was never picked up?",
        a: "Only if the law where you operate allows it and you have followed its steps, which can include written notice and a waiting period. Check before you do, and keep a record of every reminder.",
      },
      {
        q: "Can I charge storage fees?",
        a: "Only if your terms said so before the work started and local consumer rules allow it. A clear fee in the terms also gives customers a reason to collect on time.",
      },
      {
        q: "What should I do with the data on an abandoned device?",
        a: "Do not look at it. If the device is eventually disposed of under your terms and local law, erase it or use a recycler that destroys data.",
      },
    ],
    related: ["customer-portal", "point-of-sale", "repair-ticket-management"],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

/** "Why intake matters" → "why-intake-matters", for in-page links. */
export function sectionId(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
