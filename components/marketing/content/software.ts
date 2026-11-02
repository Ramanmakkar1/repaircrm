import { SHOTS } from "@/components/landing/media";
import type { Faq } from "@/lib/seo/schema";

import type { ShotData } from "../parts";
import type { Point } from "./features";

/**
 * Pages for a type of repair shop, under /software/<slug>. Each one is written
 * around how that kind of shop actually works, using only product facts that
 * also appear on the feature pages.
 */

export type SoftwarePage = {
  slug: string;
  name: string;
  metaTitle: string;
  metaDescription: string;
  query: string;
  h1: string;
  lede: string;
  shot: ShotData;
  shotCaption: string;
  dayTitle: string;
  dayIntro: string;
  day: Point[];
  fitTitle: string;
  fit: Point[];
  limits: string[];
  faqs: Faq[];
  related: string[];
};

export const SOFTWARE_PAGES: SoftwarePage[] = [
  {
    slug: "phone-repair-shop-software",
    name: "Phone repair shops",
    metaTitle: "Phone Repair Shop Software | Repairs helper",
    metaDescription:
      "For cell phone repair shops: fast check-in with IMEI and passcode, screen and battery stock, accessory sales, deposits on ordered parts and repair status.",
    query: "phone repair shop software",
    h1: "Software for phone repair shops",
    lede:
      "A phone repair counter runs on short jobs and a lot of walk-ins: a cracked screen at ten, a battery at eleven, a charger and a glass guard in between. Repairs helper is built around that pace, on the tablet or phone you already have behind the counter.",
    shot: SHOTS.newRepair,
    shotCaption:
      "Checking a device in, captured from the app with demo data: picture boxes for phone, tablet, laptop, computer, game console, TV, watch and other.",
    dayTitle: "A phone repair, the way it runs in Repairs helper",
    dayIntro: "These are the screens a front desk and a technician use for a typical screen replacement.",
    day: [
      {
        title: "Check the phone in",
        body: "Tap Phone, pick the problem (cracked screen, battery, charging port or one of your own), and record make, model, IMEI or serial and the unlock code. Only what you need is required.",
      },
      {
        title: "Take a deposit if the part is on order",
        body: "Take money up front and give the customer a printed deposit receipt. The deposit is applied when you invoice the repair.",
      },
      {
        title: "Order the screen from the ticket",
        body: "Order the part with supplier, cost and expected date. The ticket shows Waiting for Parts, so the desk can answer “when?” without asking the bench.",
      },
      {
        title: "Fix, test and tell the customer",
        body: "Tick off your post-repair checklist, mark it Ready for Pickup and send an update by text or email if a sender is set up.",
      },
      {
        title: "Sell the glass guard at pickup",
        body: "Add a screen protector or case to the same bill from the Sell screen, take payment and hand the phone over.",
      },
    ],
    fitTitle: "Details that matter in a phone shop",
    fit: [
      {
        title: "Urgent jobs stay visible",
        body: "Set priority on each repair. Urgent repairs have a 4-hour target by default and late ones are flagged on Home.",
      },
      {
        title: "Parts with serial numbers",
        body: "Track refurbished handsets or batteries by serial number, so you know exactly which unit went to which customer.",
      },
      {
        title: "Warranty on screens and batteries",
        body: "Put warranty days on a part or repair product. The cover is copied onto the invoice line and counted from the invoice date.",
      },
      {
        title: "Customers who check for themselves",
        body: "Customers can look up their repair from your shop page, approve an estimate if a second fault turns up, and pay online when Stripe or Square is connected.",
      },
    ],
    limits: [
      "There is no built-in parts catalogue from phone part suppliers. You add your own products or import them from a spreadsheet.",
      "There is no IMEI blacklist or carrier lookup.",
    ],
    faqs: [
      {
        q: "Do I need to enter the IMEI and passcode for every phone?",
        a: "No. Both are optional. When you do enter them, they are saved on the customer's device record, so a returning phone is already on file.",
      },
      {
        q: "Can I sell accessories and repairs on the same bill?",
        a: "Yes. Products and repair charges can sit on the same invoice or sale, and stock is updated for the products.",
      },
      {
        q: "Will it work on my phone behind the counter?",
        a: "Yes. Repairs helper runs in the browser on phones, tablets and computers, and can be added to the home screen. Easy mode uses large buttons for counter work.",
      },
      {
        q: "Can I bring my existing customer list?",
        a: "Yes. Import customers and products from a spreadsheet or CSV. Repair history from another system cannot be migrated in one step yet.",
      },
    ],
    related: ["repair-ticket-management", "point-of-sale", "customer-portal"],
  },
  {
    slug: "computer-repair-shop-software",
    name: "Computer repair shops",
    metaTitle: "Computer Repair Shop Software | Repairs helper",
    metaDescription:
      "For computer and laptop repair shops: diagnostic notes, bench time billed as labour, backup and test checklists, parts on order and recurring invoices.",
    query: "computer repair shop software",
    h1: "Software for computer and laptop repair shops",
    lede:
      "Computer repairs take longer and involve more back-and-forth than a phone screen: a diagnosis, a quote, a wait for parts, a data backup, hours on the bench. Repairs helper keeps that whole trail on one ticket, and bills the time you spent on it.",
    shot: SHOTS.job,
    shotCaption:
      "A laptop repair ticket, captured from the app with demo data: the status steps, a due-time badge and the buttons for parts, photos, messages and notes.",
    dayTitle: "A laptop repair, the way it runs in Repairs helper",
    dayIntro: "A typical diagnose-quote-repair job, with the customer kept in the loop.",
    day: [
      {
        title: "Check the laptop in",
        body: "Pick Laptop or Computer, note the fault, record make, model, serial and the login password if the customer wants you to test in Windows or macOS.",
      },
      {
        title: "Diagnose and log the time",
        body: "Write diagnostic notes on the ticket and log bench time. Billable time is kept until you invoice it.",
      },
      {
        title: "Quote and wait for the yes",
        body: "Send an estimate. The customer approves with an optional signature from a private link, and the ticket moves on without a phone call.",
      },
      {
        title: "Order parts and follow a checklist",
        body: "Order the SSD or battery from the ticket. Attach a checklist template, for example a backup and post-repair test routine, and tick it off as you go.",
      },
      {
        title: "Invoice parts and labour",
        body: "Raise the invoice from the ticket. Logged time becomes labour lines at your rate and any deposit is applied.",
      },
    ],
    fitTitle: "Details that matter in a computer shop",
    fit: [
      {
        title: "Customer devices on file",
        body: "Each customer's machines are saved with make, model and serial, so a repeat visit starts from the device record.",
      },
      {
        title: "Service plans and regular work",
        body: "Recurring invoices bill a business customer on a schedule, for example a monthly maintenance plan.",
      },
      {
        title: "Purchase orders for parts",
        body: "Order from vendors with purchase orders, receive deliveries in part or in full, and track serialised parts such as drives or graphics cards.",
      },
      {
        title: "Connect your other tools",
        body: "Push invoices and payments to QuickBooks Online or Xero, and connect other systems through the REST API and webhooks.",
      },
    ],
    limits: [
      "There is no remote-access or remote-monitoring tool built in.",
      "There is no field-job module with customer addresses or routing; appointments are booked at your shop's locations.",
    ],
    faqs: [
      {
        q: "Can I bill for my time on a repair?",
        a: "Yes. Technicians log time on the ticket. When you invoice from the ticket, billable time becomes labour lines at your labour rate.",
      },
      {
        q: "Can I keep a checklist for data backups and testing?",
        a: "Yes. Save checklist templates and attach one to any ticket. Each item records when it was ticked.",
      },
      {
        q: "Can I invoice business clients monthly?",
        a: "Yes. Recurring invoices bill a customer on a schedule you set.",
      },
      {
        q: "Is there an API?",
        a: "Yes. A REST API with per-shop keys covers tickets, customers, estimates, invoices, payments, products, appointments and leads, and webhooks notify your systems when things change.",
      },
    ],
    related: ["repair-ticket-management", "estimates-and-invoices", "integrations-and-api"],
  },
  {
    slug: "electronics-repair-shop-software",
    name: "Electronics repair shops",
    metaTitle: "Electronics Repair Shop Software | Repairs helper",
    metaDescription:
      "For shops that fix phones, laptops, consoles, TVs and more: your own device and problem boxes, estimates, parts on order, bench time and a workshop board.",
    query: "electronics repair shop software",
    h1: "Software for electronics repair shops",
    lede:
      "An electronics repair shop sees a bit of everything: a phone with a dead charging port, a laptop that will not boot, a console that overheats, a TV with no picture. Repairs helper puts every one of them on the same kind of ticket, so the counter and the bench follow one routine whatever the device.",
    shot: SHOTS.newRepair,
    shotCaption:
      "Checking a device in, captured from the app with demo data: picture boxes for phone, tablet, laptop, computer, game console, TV, watch and other.",
    dayTitle: "A mixed-device repair, the way it runs in Repairs helper",
    dayIntro: "The same steps work for a phone, a laptop or a TV, so new staff learn one way of working.",
    day: [
      {
        title: "Check any device in",
        body: "Tap the device box and pick the problem. If you fix things the list does not show, owners can rename, hide or add device boxes and problem types in settings.",
      },
      {
        title: "Record what came in",
        body: "Save make, model and serial on the customer's device record, add photos of its condition, and let the customer sign the intake on screen.",
      },
      {
        title: "Diagnose and quote",
        body: "Write your findings on the ticket and send an estimate. The customer approves or declines from a private link, with an optional signature.",
      },
      {
        title: "Order parts and do the work",
        body: "Order the part from the ticket with supplier, cost and expected date, log bench time, and tick off a test checklist before the device goes back.",
      },
      {
        title: "Invoice and hand over",
        body: "Invoice from the ticket: logged time becomes labour lines and any deposit is applied. Take payment and hand the device over.",
      },
    ],
    fitTitle: "Details that matter when you fix many kinds of device",
    fit: [
      {
        title: "Status steps you can edit",
        body: "Built-in steps run from New to Resolved, including Waiting for Parts and Waiting on Customer. Owners can add their own steps.",
      },
      {
        title: "A board for the workshop",
        body: "The shop-floor board shows every open repair as a large tile grouped by status and refreshes itself every 30 seconds. Leave it running on a wall TV.",
      },
      {
        title: "Due times by priority",
        body: "Urgent, high, normal and low each have a target in hours (4, 24, 72 and 120 by default). Late repairs are flagged on the ticket and counted on Home.",
      },
      {
        title: "Parts, accessories and refurbished units",
        body: "One stock list with low-stock levels, vendors and purchase orders, and serial numbers for the items where each unit matters.",
      },
    ],
    limits: [
      "There is no field-job module with customer addresses or routing; repairs and appointments happen at your shop's locations.",
      "There is no connection to manufacturer warranty programs or insurance claim systems.",
      "There is no built-in parts catalogue from suppliers. You add your own products or import them from a spreadsheet.",
    ],
    faqs: [
      {
        q: "Can I add device types that are not in the list?",
        a: "Yes. Owners can rename, hide or add device boxes and problem types in settings, and the counter check-in uses your list.",
      },
      {
        q: "Can I show the repair queue on a TV in the workshop?",
        a: "Yes. The shop-floor board shows every open repair as a large tile grouped by status and refreshes itself every 30 seconds.",
      },
      {
        q: "Can I charge for diagnosis or bench time?",
        a: "Yes. Add a diagnostic charge as a line on the estimate or invoice, or log time on the ticket: billable time becomes labour lines at your labour rate when you invoice.",
      },
      {
        q: "Does it work for more than one store?",
        a: "Yes. Open another location and switch between them, or view all locations together. Single-location shops never see the switcher.",
      },
    ],
    related: ["repair-ticket-management", "estimates-and-invoices", "inventory-management"],
  },
  {
    slug: "game-console-repair-software",
    name: "Game console repair shops",
    metaTitle: "Game Console Repair Shop Software | Repairs helper",
    metaDescription:
      "For console and controller repair shops: check-in with serials and photos, parts on order, test checklists, warranty days and accessory sales on one bill.",
    query: "game console repair software",
    h1: "Software for game console repair shops",
    lede:
      "Console repairs cover a lot of ground: a broken HDMI port, drifting controller sticks, a console that overheats or will not read discs. Repairs helper keeps each job, its parts and its test routine on one ticket, and sells the controllers and cables at the same counter.",
    shot: SHOTS.job,
    shotCaption:
      "A repair ticket, captured from the app with demo data: the status steps, a due-time badge and the buttons for parts, photos, messages and notes.",
    dayTitle: "A console repair, the way it runs in Repairs helper",
    dayIntro: "A typical port or drift repair, with the customer kept informed.",
    day: [
      {
        title: "Check the console in",
        body: "Tap Game console and pick the problem from your list (add your own, such as HDMI port or stick drift). Record make, model and serial, and photograph the condition before you open it.",
      },
      {
        title: "Note what came with it",
        body: "Write down controllers, cables and cases left with the console in the ticket notes, so what goes back at pickup matches what came in.",
      },
      {
        title: "Quote and get the yes",
        body: "Send an estimate. The customer approves from a private link with an optional signature, and the ticket moves on without a phone call.",
      },
      {
        title: "Order the part and test",
        body: "Order the port or stick module from the ticket with supplier, cost and expected date. Attach a test checklist and tick it off before the console goes back.",
      },
      {
        title: "Invoice and sell the extras",
        body: "Invoice the repair with warranty days on the part, and add a controller or cable to the same bill from the Sell screen.",
      },
    ],
    fitTitle: "Details that matter in a console shop",
    fit: [
      {
        title: "Serial numbers on file",
        body: "Each customer's console is saved with make, model and serial, so a repeat visit or a warranty question starts from the device record.",
      },
      {
        title: "Refurbished units in stock",
        body: "Track refurbished consoles and controllers by serial number, note where each unit came from, and see which unit was sold on which invoice.",
      },
      {
        title: "Photos before you open it",
        body: "Add photos to the ticket to record scratches, missing screws or liquid damage before work starts.",
      },
      {
        title: "Warranty you can check",
        body: "Warranty days on a part or repair product are copied onto the invoice line and counted from the invoice date. Warranty repairs can be linked to the line they cover.",
      },
    ],
    limits: [
      "There is no trade-in or buy-back screen. A console you buy in can be added to stock as a serialised unit with a note on where it came from.",
      "There is no built-in parts catalogue from suppliers. You add your own products or import them from a spreadsheet.",
    ],
    faqs: [
      {
        q: "Can I record the console's serial number?",
        a: "Yes. Make, model and serial are saved on the customer's device record, so the console is already on file the next time it comes in.",
      },
      {
        q: "Can I sell controllers and accessories with the repair?",
        a: "Yes. Products and repair charges can sit on the same invoice or sale, and stock is updated for the products.",
      },
      {
        q: "Can I charge a cleaning or diagnostic fee?",
        a: "Yes. Add it as a line on the estimate or invoice, or set it up as a repair product with its own price.",
      },
      {
        q: "Can customers check on their console without calling?",
        a: "Yes. With a sender set up, customers get a sign-in link to their portal, where they can follow the repair, approve estimates and pay online when Stripe or Square is connected.",
      },
    ],
    related: ["repair-ticket-management", "inventory-management", "point-of-sale"],
  },
];

export function softwareBySlug(slug: string): SoftwarePage | undefined {
  return SOFTWARE_PAGES.find((page) => page.slug === slug);
}
