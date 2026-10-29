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
];

export function softwareBySlug(slug: string): SoftwarePage | undefined {
  return SOFTWARE_PAGES.find((page) => page.slug === slug);
}
