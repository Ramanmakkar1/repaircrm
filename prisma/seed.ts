/**
 * Demo data for RepairPilot.
 *
 * Idempotent: drops and rebuilds the `demo` shop on every run (every tenant-owned
 * table cascades from Shop), so it is safe to re-run at any time.
 *
 *   npm run db:seed
 *
 * Logins (all use the password `demo1234`):
 *   demo@repairpilot.app       OWNER
 *   tech@repairpilot.app       TECH
 *   frontdesk@repairpilot.app  FRONT_DESK
 */

import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const SHOP_SLUG = "demo";
const PASSWORD = "demo1234";
const TAX_BPS = 825; // 8.25%
/** A second jurisdiction, so the tax picker has something to pick between. */
const COUNTY_TAX_BPS = 675; // 6.75%

/** The two keys lib/labour.ts actually reads out of `Shop.settings`. */
const LABOUR_RATE_CENTS = 9500;
const LABOUR_ROUNDING_MINUTES = 15;

/** Response targets in CALENDAR hours, by priority — see lib/sla.ts readSla(). */
const SLA_HOURS = { LOW: 96, NORMAL: 48, HIGH: 24, URGENT: 6 } as const;

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now - n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const daysAhead = (n: number, hour = 17) => daysAgo(-n, hour);
const hoursAgo = (n: number) => new Date(now - n * HOUR);

/**
 * A moment later today that is always still in the future — what the tickets
 * list's "Due today" filter (dueDate >= now AND <= end of day) matches, however
 * late in the evening the seed happens to run.
 */
const laterToday = () => {
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return new Date(Math.min(endOfDay.getTime(), now + 3 * HOUR));
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** date-fns `format(d, "MMM d")` — the date label on a billed labour line. */
const monthDay = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

// The three helpers below mirror lib/labour.ts at this shop's settings. They
// are duplicated rather than imported because the seed runs under tsx with no
// bundler resolving the "@/" alias — and a labour line whose wording drifts
// from the app's would make the "Bill time" banner look like it double-billed.
const roundSecondsUp = (seconds: number) => {
  const step = LABOUR_ROUNDING_MINUTES * 60;
  return seconds <= 0 ? 0 : Math.ceil(seconds / step) * step;
};
const labourAmountCents = (seconds: number) =>
  Math.round((roundSecondsUp(seconds) / 3600) * LABOUR_RATE_CENTS);
const formatHm = (seconds: number) => {
  const total = roundSecondsUp(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (minutes === 60) return `${hours + 1}:00`;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
};
const labourDescription = (techName: string, startedAt: Date, seconds: number) =>
  `Labour — ${techName}, ${monthDay(startedAt)} (${formatHm(seconds)})`;

/** Where lib/storage's local driver writes: public/uploads/<shopId>/<name>. */
const uploadsRoot = path.join(process.cwd(), "public", "uploads");

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed demo accounts and data in production. Use a non-production database.",
    );
  }

  console.log("Seeding RepairPilot demo data…");

  // ---------------------------------------------------------------- reset ---
  // Deleting the Shop cascades almost everything, but not quite everything:
  // PurchaseOrder -> Vendor is onDelete: Restrict, and Postgres does not
  // promise it will clear the orders before it clears the vendors. So the
  // rows that could deadlock a cascade — and every child that is cheaper to
  // name than to reason about — go first, in FK-safe order (children before
  // parents), and the shop delete mops up the rest.
  const existing = await db.shop.findUnique({ where: { slug: SHOP_SLUG } });
  if (existing) {
    const shopId = existing.id;
    await db.webhookDelivery.deleteMany({ where: { shopId } });
    await db.webhook.deleteMany({ where: { shopId } });
    await db.productSerial.deleteMany({ where: { shopId } });
    await db.partOrder.deleteMany({ where: { shopId } });
    await db.purchaseOrderLine.deleteMany({
      where: { purchaseOrder: { shopId } },
    });
    await db.purchaseOrder.deleteMany({ where: { shopId } });
    await db.vendor.deleteMany({ where: { shopId } });
    await db.deposit.deleteMany({ where: { shopId } });
    await db.refund.deleteMany({ where: { shopId } });
    await db.creditAdjustment.deleteMany({ where: { shopId } });
    await db.stockAdjustment.deleteMany({ where: { shopId } });
    await db.campaignSend.deleteMany({ where: { shopId } });
    await db.campaign.deleteMany({ where: { shopId } });
    await db.appointment.deleteMany({ where: { shopId } });
    await db.lead.deleteMany({ where: { shopId } });
    await db.timeClockEntry.deleteMany({ where: { shopId } });
    await db.cashDrawerSession.deleteMany({ where: { shopId } });
    await db.auditLog.deleteMany({ where: { shopId } });
    await db.apiKey.deleteMany({ where: { shopId } });
    await db.integrationLink.deleteMany({ where: { shopId } });
    await db.integrationConnection.deleteMany({ where: { shopId } });
    await db.attachment.deleteMany({ where: { shopId } });
    await db.recurringInvoiceLine.deleteMany({
      where: { recurringInvoice: { shopId } },
    });
    await db.recurringInvoice.deleteMany({ where: { shopId } });
    await db.ticket.updateMany({
      where: { shopId },
      data: { checklistTemplateId: null, warrantyInvoiceLineId: null },
    });
    await db.checklistTemplate.deleteMany({ where: { shopId } });
    await db.taxRate.deleteMany({ where: { shopId } });
    await db.shop.delete({ where: { id: shopId } });
    // The uploads the previous run wrote are addressed by the OLD shop id, so
    // nothing will ever reference them again.
    await rm(path.join(uploadsRoot, shopId), { recursive: true, force: true });
    console.log("  · removed previous demo shop");
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ----------------------------------------------------------------- shop ---
  const shop = await db.shop.create({
    data: {
      name: "Demo Repair Shop",
      slug: SHOP_SLUG,
      address1: "1420 E 6th Street",
      address2: "Suite 200",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
      country: "US",
      phone: "(512) 555-0142",
      email: "hello@demorepair.shop",
      timezone: "America/Chicago",
      taxRateBps: TAX_BPS,
      settings: {
        ticketStatuses: [
          "New",
          "In Progress",
          "Waiting for Parts",
          "Waiting on Customer",
          "Ready for Pickup",
          "Resolved",
        ],
        problemTypes: [
          "Screen Repair",
          "Battery Replacement",
          "Water Damage",
          "Data Recovery",
          "Software / Virus",
          "Diagnostic",
          "Board Repair",
        ],
        defaultLabourRateCents: LABOUR_RATE_CENTS,
        labourRoundingMinutes: LABOUR_ROUNDING_MINUTES,
        invoiceTerms: "Net 15. Devices left over 30 days may be recycled.",
        // Response targets, in calendar hours (lib/sla.ts). Every open ticket
        // below gets its due date from its priority and this block.
        sla: { ...SLA_HOURS },
        // The public intake form at /checkin/demo, and what it asks for.
        checkin: {
          enabled: true,
          terms: [
            "By signing below you authorise diagnosis of the device described above.",
            "We will contact you with an estimate before any chargeable work begins.",
            "Devices left more than 30 days after completion may be recycled.",
          ].join("\n\n"),
          fields: { make: true, model: true, serial: true, unlockCode: false },
        },
        // The post-pickup review request (lib/jobs/reviews.ts).
        reviews: {
          enabled: true,
          url: "https://g.page/r/demo-repair-shop-austin/review",
          delayHours: 24,
          template:
            "Hi {customer}, thanks for choosing {shop}! If we did right by you, a quick review would mean a lot: {link}",
        },
        // The address customers reply to; app/api/inbound matches on it.
        inboundEmail: "support@demorepair.shop",
        // A demo shop is not a new shop: the wizard is done and the dashboard
        // checklist has been dismissed, so neither nags on first sign-in.
        onboarding: {
          completed: ["shop", "team", "payments", "items", "ready"],
          skipped: [],
          current: "ready",
          finishedAt: daysAgo(58, 16).toISOString(),
          dismissed: true,
        },
      },
    },
  });

  // ------------------------------------------------------------- tax rates ---
  // The starred rate mirrors `Shop.taxRateBps`, which is what every screen
  // written before named rates existed still reads (lib/tax.ts).
  const salesTax = await db.taxRate.create({
    data: {
      shopId: shop.id,
      name: "Texas sales tax",
      rateBps: TAX_BPS,
      isDefault: true,
    },
  });

  const countyTax = await db.taxRate.create({
    data: {
      shopId: shop.id,
      name: "Williamson County",
      rateBps: COUNTY_TAX_BPS,
    },
  });

  await db.taxRate.create({
    data: { shopId: shop.id, name: "No tax", rateBps: 0 },
  });

  const mainLocation = await db.location.create({
    data: {
      shopId: shop.id,
      name: "Main",
      address1: "1420 E 6th Street",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
      phone: "(512) 555-0142",
      isDefault: true,
    },
  });

  const kiosk = await db.location.create({
    data: {
      shopId: shop.id,
      name: "Northside Kiosk",
      address1: "9200 Burnet Rd",
      city: "Austin",
      state: "TX",
      postalCode: "78758",
      phone: "(512) 555-0177",
    },
  });

  // ---------------------------------------------------------------- users ---
  const owner = await db.user.create({
    data: {
      shopId: shop.id,
      email: "demo@repairpilot.app",
      passwordHash,
      defaultLocationId: mainLocation.id,
      name: "Dana Ortiz",
      role: "OWNER",
      lastLoginAt: hoursAgo(2),
    },
  });

  const tech = await db.user.create({
    data: {
      shopId: shop.id,
      email: "tech@repairpilot.app",
      passwordHash,
      defaultLocationId: mainLocation.id,
      name: "Marcus Webb",
      role: "TECH",
      lastLoginAt: hoursAgo(5),
    },
  });

  const frontDesk = await db.user.create({
    data: {
      shopId: shop.id,
      email: "frontdesk@repairpilot.app",
      passwordHash,
      defaultLocationId: kiosk.id,
      name: "Priya Shah",
      role: "FRONT_DESK",
      lastLoginAt: daysAgo(1, 9),
    },
  });

  // -------------------------------------------------------------- vendors ---
  // Suppliers first: products point at them, and the purchase orders further
  // down point at both.
  const partsDepot = await db.vendor.create({
    data: {
      shopId: shop.id,
      name: "Southwest Parts Depot",
      email: "orders@swpartsdepot.example",
      phone: "(214) 555-0301",
      website: "https://swpartsdepot.example",
      accountNumber: "SWD-40118",
      address: "2200 Valwood Pkwy, Farmers Branch, TX 75234",
      notes: "Displays and batteries. Cut-off 3pm CT for next-day.",
    },
  });

  const lonestar = await db.vendor.create({
    data: {
      shopId: shop.id,
      name: "Lone Star Cell Supply",
      email: "sales@lonestarcell.example",
      phone: "(713) 555-0288",
      website: "https://lonestarcell.example",
      accountNumber: "LSC-2277",
      address: "915 Hempstead Rd, Houston, TX 77008",
      notes: "Flexes and connectors. Will split case packs.",
    },
  });

  const meridian = await db.vendor.create({
    data: {
      shopId: shop.id,
      name: "Meridian Component Group",
      email: "purchasing@meridiancomponent.example",
      phone: "(602) 555-0164",
      website: "https://meridiancomponent.example",
      accountNumber: "MCG-88431",
      address: "4750 S 44th Pl, Phoenix, AZ 85040",
      notes: "Laptop assemblies and storage. Net 30 on the shop account.",
    },
  });

  const accessoryWholesale = await db.vendor.create({
    data: {
      shopId: shop.id,
      name: "Austin Accessory Wholesale",
      email: "hello@atxaccessory.example",
      phone: "(512) 555-0233",
      accountNumber: "AAW-119",
      address: "6301 Airport Blvd, Austin, TX 78752",
      notes: "Local pickup — cases, glass, cables.",
    },
  });

  // ------------------------------------------------------------- products ---
  const productSeed: Prisma.ProductCreateManyInput[] = [
    {
      shopId: shop.id,
      name: "iPhone 14 Screen Assembly",
      sku: "SCR-IP14",
      upc: "0810001100011",
      description: "OEM-pull OLED display with frame, tested.",
      priceCents: 21900,
      costCents: 12400,
      stockQty: 6,
      lowStockAt: 3,
      category: "Parts / Displays",
      vendorId: partsDepot.id,
      vendorSku: "SWD-IP14-OLED-BLK",
      reorderQty: 10,
      warrantyDays: 90,
    },
    {
      shopId: shop.id,
      name: "iPhone 12 Battery",
      sku: "BAT-IP12",
      description: "2815 mAh replacement cell, adhesive included.",
      priceCents: 8900,
      costCents: 3200,
      stockQty: 14,
      lowStockAt: 5,
      category: "Parts / Batteries",
      vendorId: partsDepot.id,
      vendorSku: "SWD-BAT-IP12",
      reorderQty: 20,
      warrantyDays: 180,
    },
    {
      shopId: shop.id,
      name: "MacBook Pro 13\" Keyboard Assembly",
      sku: "KB-MBP13",
      priceCents: 32900,
      costCents: 19500,
      stockQty: 2,
      lowStockAt: 2,
      category: "Parts / Input",
      vendorId: meridian.id,
      vendorSku: "MCG-A2338-TOPCASE",
      reorderQty: 4,
      warrantyDays: 90,
    },
    {
      shopId: shop.id,
      name: "1TB NVMe SSD",
      sku: "SSD-1TB",
      upc: "0810001100288",
      priceCents: 12900,
      costCents: 7100,
      stockQty: 9,
      lowStockAt: 4,
      category: "Parts / Storage",
      vendorId: meridian.id,
      vendorSku: "MCG-NVME-1T-G4",
      reorderQty: 10,
      warrantyDays: 365,
    },
    {
      shopId: shop.id,
      name: "Samsung S22 Charge Port Flex",
      sku: "PORT-S22",
      priceCents: 6900,
      costCents: 2400,
      stockQty: 11,
      lowStockAt: 4,
      category: "Parts / Connectors",
      vendorId: lonestar.id,
      vendorSku: "LSC-S22-CPFLEX",
      reorderQty: 15,
      warrantyDays: 90,
    },
    {
      shopId: shop.id,
      name: "Bench Diagnostic (per hour)",
      sku: "LAB-DIAG",
      description: "Standard bench labour rate.",
      priceCents: 9500,
      taxable: false,
      stockQty: 0,
      category: "Labour",
    },
    {
      shopId: shop.id,
      name: "Data Recovery — Level 1",
      sku: "LAB-DR1",
      description: "Logical recovery, no clean room.",
      priceCents: 17500,
      taxable: false,
      stockQty: 0,
      category: "Labour",
    },
    {
      shopId: shop.id,
      name: "Tempered Glass Protector",
      sku: "ACC-TG",
      upc: "0810001100455",
      priceCents: 2499,
      costCents: 480,
      stockQty: 48,
      lowStockAt: 12,
      category: "Accessories",
      vendorId: accessoryWholesale.id,
      vendorSku: "AAW-TG-UNI",
      reorderQty: 50,
    },
    {
      shopId: shop.id,
      name: "USB-C to Lightning Cable (1m)",
      sku: "ACC-CBL-CL",
      upc: "0810001100622",
      priceCents: 2499,
      costCents: 690,
      stockQty: 27,
      lowStockAt: 8,
      category: "Accessories",
      vendorId: accessoryWholesale.id,
      vendorSku: "AAW-CBL-CL1M",
      reorderQty: 25,
    },
    {
      shopId: shop.id,
      name: "Silicone Case — iPhone 14 Pro",
      sku: "ACC-CASE-IP14P",
      priceCents: 3499,
      costCents: 1100,
      stockQty: 16,
      lowStockAt: 6,
      category: "Accessories",
      vendorId: accessoryWholesale.id,
      vendorSku: "AAW-CASE-IP14P",
      reorderQty: 20,
    },
    // Serialized: every unit is its own ProductSerial row and `stockQty` is a
    // CACHE of how many of them are IN_STOCK (lib/serials.ts). The counts
    // below are set to match the serials created after the invoices exist.
    {
      shopId: shop.id,
      name: "iPhone 13 128GB — Refurbished",
      sku: "REF-IP13-128",
      description: "Grade A refurbished handset, new battery, unlocked.",
      priceCents: 42900,
      costCents: 28500,
      stockQty: 3,
      lowStockAt: 2,
      category: "Refurbished / Phones",
      vendorId: partsDepot.id,
      vendorSku: "SWD-REF-IP13-128",
      reorderQty: 5,
      warrantyDays: 365,
      serialized: true,
    },
    {
      shopId: shop.id,
      name: 'MacBook Air 13" M1 — Refurbished',
      sku: "REF-MBA-M1",
      description: "8GB / 256GB, cycle count under 200, 90-day bench tested.",
      priceCents: 64900,
      costCents: 44000,
      stockQty: 2,
      lowStockAt: 1,
      category: "Refurbished / Laptops",
      vendorId: meridian.id,
      vendorSku: "MCG-REF-MBA-M1",
      reorderQty: 3,
      warrantyDays: 365,
      serialized: true,
    },
  ];
  await db.product.createMany({ data: productSeed });
  const products = await db.product.findMany({ where: { shopId: shop.id } });
  const bySku = (sku: string) => products.find((p) => p.sku === sku)!;

  const screenIp14 = bySku("SCR-IP14");
  const batIp12 = bySku("BAT-IP12");
  const kbMbp = bySku("KB-MBP13");
  const ssd1tb = bySku("SSD-1TB");
  const portS22 = bySku("PORT-S22");
  const labDiag = bySku("LAB-DIAG");
  const labDr1 = bySku("LAB-DR1");
  const glass = bySku("ACC-TG");
  const cable = bySku("ACC-CBL-CL");
  const caseIp14 = bySku("ACC-CASE-IP14P");
  const refurbIp13 = bySku("REF-IP13-128");
  const refurbMba = bySku("REF-MBA-M1");

  // ------------------------------------------------------ canned responses ---
  await db.cannedResponse.createMany({
    data: [
      {
        shopId: shop.id,
        title: "Ready for pickup",
        body:
          "Good news — your device is repaired and ready for pickup at our Main location. " +
          "We're open 9am-6pm Mon-Sat. Please bring your ticket number and a photo ID.",
      },
      {
        shopId: shop.id,
        title: "Waiting on part",
        body:
          "Quick update: the part for your repair is on order and expected within 2-3 business days. " +
          "We'll message you the moment it lands on the bench.",
      },
      {
        shopId: shop.id,
        title: "Estimate approval needed",
        body:
          "We've finished the diagnostic and sent over an estimate. " +
          "Work starts as soon as you approve it — just tap the link in the estimate email.",
      },
    ],
  });

  // --------------------------------------------------- checklist templates ---
  // `items` is a plain string[]; attaching a template COPIES those strings onto
  // the ticket as `Ticket.checklist` (lib/checklist.ts), so the snapshots below
  // are free to disagree with the template that produced them.
  /** A template's items copied onto a ticket, with the first `done` ticked. */
  const checklistSnapshot = (items: string[], done: number, when: Date) =>
    items.map((label, index) => ({
      label,
      done: index < done,
      doneAt:
        index < done
          ? new Date(when.getTime() + index * 11 * 60_000).toISOString()
          : null,
    }));

  const PHONE_CHECKLIST_ITEMS = [
    "Photograph all four corners and the back glass",
    "Record IMEI and confirm it matches the box",
    "Test charging port with a known-good cable",
    "Check Face ID / fingerprint before teardown",
    "Confirm passcode works and note it on the ticket",
    "Test speakers, mic and both cameras",
    "Check for prior liquid damage indicators",
  ];

  const LAPTOP_CHECKLIST_ITEMS = [
    "Note visible damage and photograph the lid and base",
    "Record serial number and service tag",
    "Confirm the charger came in with the machine",
    "Boot to firmware and record the model and RAM",
    "Run a 10-minute SMART check on the drive",
    "Test keyboard, trackpad and every port",
    "Check battery health and cycle count",
    "Back up before any destructive step",
  ];

  const RECOVERY_CHECKLIST_ITEMS = [
    "Customer signed the no-guarantee acknowledgement",
    "Photograph the drive label and record the serial",
    "Attach write blocker before the first read",
    "Image with ddrescue — forward pass",
    "Second pass over the slow zones",
    "Verify the image mounts read-only",
    "Copy the agreed folders to the delivery drive",
    "Checksum the delivery against the image",
  ];

  const phoneChecklist = await db.checklistTemplate.create({
    data: {
      shopId: shop.id,
      name: "Phone intake",
      problemType: "Screen Repair",
      items: PHONE_CHECKLIST_ITEMS,
    },
  });

  const laptopChecklist = await db.checklistTemplate.create({
    data: {
      shopId: shop.id,
      name: "Laptop intake",
      problemType: "Diagnostic",
      items: LAPTOP_CHECKLIST_ITEMS,
    },
  });

  const recoveryChecklist = await db.checklistTemplate.create({
    data: {
      shopId: shop.id,
      name: "Data recovery",
      problemType: "Data Recovery",
      items: RECOVERY_CHECKLIST_ITEMS,
    },
  });

  // ------------------------------------------------------------ customers ---
  type CustomerSpec = {
    firstName: string;
    lastName: string;
    businessName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    city: string;
    state: string;
    postalCode: string;
    address1: string;
    notes?: string;
    smsOptIn?: boolean;
    emailOptIn?: boolean;
    creditBalanceCents?: number;
    referredBy?: string;
    taxExempt?: boolean;
    taxRateId?: string;
    createdAt?: Date;
    stripe?: {
      customerId: string;
      paymentMethodId: string;
      cardBrand: string;
      cardLast4: string;
      cardExpMonth: number;
      cardExpYear: number;
    };
    contacts?: { name: string; email?: string; phone?: string; label?: string }[];
    assets: {
      type: string;
      make?: string;
      model?: string;
      serial?: string;
      password?: string;
      notes?: string;
    }[];
  };

  const customerSpecs: CustomerSpec[] = [
    {
      firstName: "Elena",
      createdAt: daysAgo(118, 11),
      lastName: "Marquez",
      email: "elena.marquez@example.com",
      phone: "(512) 555-0110",
      mobile: "(512) 555-0111",
      address1: "88 Rainey St",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      smsOptIn: true,
      notes: "Prefers texts. Usually picks up after 5pm.",
      assets: [
        {
          type: "Phone",
          make: "Apple",
          model: "iPhone 14 Pro",
          serial: "F2LX7A9QJKL1",
          password: "440219",
          notes: "Screen cracked corner-to-corner.",
        },
      ],
    },
    {
      firstName: "Ray",
      createdAt: daysAgo(104, 11),
      lastName: "Okonkwo",
      businessName: "Okonkwo Dental Group",
      email: "ray@okonkwodental.example",
      phone: "(512) 555-0122",
      address1: "3110 Guadalupe St",
      city: "Austin",
      state: "TX",
      postalCode: "78705",
      creditBalanceCents: 5000,
      taxExempt: true,
      notes:
        "Commercial account — invoices go to the office manager. Texas exemption certificate on file, so new work is untaxed.",
      stripe: {
        customerId: "cus_demo_okonkwo",
        paymentMethodId: "pm_demo_okonkwo_visa",
        cardBrand: "visa",
        cardLast4: "4242",
        cardExpMonth: 11,
        cardExpYear: new Date(now).getFullYear() + 2,
      },
      contacts: [
        {
          name: "Bea Nunez",
          email: "bea@okonkwodental.example",
          phone: "(512) 555-0123",
          label: "Office Manager",
        },
        {
          name: "Tom Reyes",
          email: "tom@okonkwodental.example",
          label: "IT Contact",
        },
      ],
      assets: [
        {
          type: "Laptop",
          make: "Apple",
          model: 'MacBook Pro 13" (2020)',
          serial: "C02ZK1TXQ05N",
          password: "dentaloffice1",
        },
        {
          type: "Tablet",
          make: "Apple",
          model: "iPad Air 4",
          serial: "DMPXK99QJ1MD",
        },
      ],
    },
    {
      firstName: "Sofia",
      createdAt: daysAgo(76, 11),
      lastName: "Kaur",
      email: "sofia.kaur@example.com",
      mobile: "(512) 555-0134",
      address1: "1201 Barton Springs Rd",
      city: "Austin",
      state: "TX",
      postalCode: "78704",
      smsOptIn: true,
      referredBy: "Elena Marquez",
      assets: [
        {
          type: "Phone",
          make: "Samsung",
          model: "Galaxy S22",
          serial: "R58T30JQPXA",
          password: "swipe-L",
          notes: "Won't charge unless cable is wiggled.",
        },
        {
          type: "Laptop",
          make: "HP",
          model: "Envy x360 13",
          serial: "5CD2419KX7",
          password: "sofia2024",
          notes: "Dropped off through the online check-in form.",
        },
      ],
    },
    {
      firstName: "Daniel",
      createdAt: daysAgo(61, 11),
      lastName: "Brooks",
      email: "d.brooks@example.com",
      phone: "(512) 555-0145",
      address1: "7500 Manchaca Rd",
      city: "Austin",
      state: "TX",
      postalCode: "78745",
      emailOptIn: false,
      notes: "Do not email — call only.",
      assets: [
        {
          type: "Desktop",
          make: "Custom Build",
          model: "Ryzen 5600 / RTX 3060",
          notes: "No POST, no beep codes.",
        },
        {
          type: "Laptop",
          make: "Dell",
          model: "Latitude 5420",
          serial: "JK4LM72",
          password: "brooks-work",
          notes: "Work machine — fan roars under any load.",
        },
      ],
    },
    {
      firstName: "Amara",
      createdAt: daysAgo(44, 11),
      lastName: "Nwosu",
      email: "amara.nwosu@example.com",
      mobile: "(512) 555-0156",
      address1: "4400 Duval St",
      city: "Austin",
      state: "TX",
      postalCode: "78751",
      smsOptIn: true,
      assets: [
        {
          type: "Laptop",
          make: "Dell",
          model: "XPS 13 9310",
          serial: "8JQ2XM3",
          password: "xps-2024",
          notes: "Drive failing SMART. Customer wants data first.",
        },
      ],
    },
    {
      firstName: "Tomas",
      createdAt: daysAgo(37, 11),
      lastName: "Rivera",
      businessName: "Rivera Landscaping LLC",
      email: "tomas@riveraland.example",
      phone: "(512) 555-0167",
      address1: "1701 Chisholm Trail",
      city: "Round Rock",
      state: "TX",
      postalCode: "78681",
      taxRateId: countyTax.id,
      notes: "Yard is in Williamson County — billed at the county rate.",
      contacts: [
        {
          name: "Luz Rivera",
          phone: "(512) 555-0168",
          label: "Billing",
        },
      ],
      assets: [
        {
          type: "Tablet",
          make: "Samsung",
          model: "Galaxy Tab A8",
          serial: "RF8N90QKPZ",
          notes: "Field tablet — heavy dust.",
        },
        {
          type: "Phone",
          make: "Apple",
          model: "iPhone 12",
          serial: "G6TZ22XLPN1",
          password: "112233",
        },
      ],
    },
    {
      firstName: "Priscilla",
      createdAt: daysAgo(23, 11),
      lastName: "Adeyemi",
      email: "p.adeyemi@example.com",
      mobile: "(512) 555-0178",
      address1: "600 Congress Ave",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      smsOptIn: true,
      assets: [
        {
          type: "Console",
          make: "Sony",
          model: "PlayStation 5",
          serial: "PS5-QK7734",
          notes: "HDMI port pushed in.",
        },
        {
          type: "Phone",
          make: "Apple",
          model: "iPhone 13",
          serial: "H9KP41LQ7RT2",
          password: "778812",
        },
      ],
    },
    {
      firstName: "Owen",
      createdAt: daysAgo(12, 11),
      lastName: "Fitzgerald",
      email: "owen.fitz@example.com",
      phone: "(512) 555-0189",
      address1: "2525 W Anderson Ln",
      city: "Austin",
      state: "TX",
      postalCode: "78757",
      creditBalanceCents: 1250,
      assets: [
        {
          type: "Laptop",
          make: "Lenovo",
          model: "ThinkPad T14 Gen 3",
          serial: "PF3XK99A",
          password: "thinkpad!",
        },
      ],
    },
  ];

  const customers = [];
  for (const spec of customerSpecs) {
    const customer = await db.customer.create({
      data: {
        shopId: shop.id,
        firstName: spec.firstName,
        lastName: spec.lastName,
        businessName: spec.businessName,
        email: spec.email,
        phone: spec.phone,
        mobile: spec.mobile,
        address1: spec.address1,
        city: spec.city,
        state: spec.state,
        postalCode: spec.postalCode,
        notes: spec.notes,
        smsOptIn: spec.smsOptIn ?? false,
        emailOptIn: spec.emailOptIn ?? true,
        creditBalanceCents: spec.creditBalanceCents ?? 0,
        referredBy: spec.referredBy,
        taxExempt: spec.taxExempt ?? false,
        taxRateId: spec.taxRateId,
        createdAt: spec.createdAt,
        stripeCustomerId: spec.stripe?.customerId,
        stripePaymentMethodId: spec.stripe?.paymentMethodId,
        cardBrand: spec.stripe?.cardBrand,
        cardLast4: spec.stripe?.cardLast4,
        cardExpMonth: spec.stripe?.cardExpMonth,
        cardExpYear: spec.stripe?.cardExpYear,
        contacts: spec.contacts ? { create: spec.contacts } : undefined,
        assets: {
          create: spec.assets.map((a) => ({ ...a, shopId: shop.id })),
        },
      },
      include: { assets: true, contacts: true },
    });
    customers.push(customer);
  }

  const [elena, ray, sofia, daniel, amara, tomas, priscilla, owen] = customers;

  // ---------------------------------------------------------------- tickets ---
  type ChargeSpec = {
    productId?: string;
    description: string;
    quantity?: number;
    unitPriceCents: number;
    taxable?: boolean;
  };
  type CommentSpec = {
    authorId?: string;
    body: string;
    isPublic?: boolean;
    subject?: string;
    updateType?: string;
    channel?: "NOTE" | "EMAIL" | "SMS";
    createdAt: Date;
  };
  type TicketSpec = {
    number: number;
    customerId: string;
    assetId?: string;
    locationId?: string;
    subject: string;
    problemType: string;
    status: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    assignedToId?: string;
    dueDate?: Date;
    diagnosticNotes?: string;
    customFields?: Prisma.InputJsonValue;
    intakeSigned?: boolean;
    resolvedAt?: Date;
    createdAt: Date;
    /** "staff" | "checkin" | "portal" | "email" | "sms" | "api" */
    source?: string;
    isWarranty?: boolean;
    checklistTemplateId?: string;
    checklist?: Prisma.InputJsonValue;
    /** Last customer-originated message; newer than the last public staff
     *  reply is exactly what "Needs reply" means (lib/needs-reply.ts). */
    lastInboundAt?: Date;
    pickedUpAt?: Date;
    reviewRequestedAt?: Date;
    slaBreachedAt?: Date;
    slaNotifiedAt?: Date;
    comments?: CommentSpec[];
    charges?: ChargeSpec[];
    time?: {
      userId: string;
      startedAt: Date;
      minutes?: number;
      note?: string;
      billable?: boolean;
    }[];
  };

  // Bench time on ticket #1016 that has already been billed. The entries and
  // the invoice lines they became are generated from ONE list, so the wording
  // and the money match what lib/time-billing.ts would have produced.
  const billedTime = [
    {
      userId: tech.id,
      userName: tech.name,
      startedAt: daysAgo(6, 10),
      minutes: 75,
      note: "Windows reinstall, drivers and updates",
    },
    {
      userId: tech.id,
      userName: tech.name,
      startedAt: daysAgo(5, 13),
      minutes: 40,
      note: "Restore documents from the recovery image",
    },
  ];

  const ticketSpecs: TicketSpec[] = [
    {
      number: 1001,
      customerId: elena.id,
      assetId: elena.assets[0].id,
      locationId: mainLocation.id,
      subject: "iPhone 14 Pro — cracked screen, touch dead on left edge",
      problemType: "Screen Repair",
      status: "Ready for Pickup",
      priority: "NORMAL",
      assignedToId: tech.id,
      createdAt: daysAgo(9),
      intakeSigned: true,
      // Finished and on the shelf — no promise is still running, so no due
      // date. `pickedUpAt` stays null, which is what "Awaiting pickup" means.
      checklistTemplateId: phoneChecklist.id,
      checklist: checklistSnapshot(PHONE_CHECKLIST_ITEMS, 7, daysAgo(9, 11)),
      diagnosticNotes:
        "Digitizer failure confirmed with tester. Frame straight, no board damage.",
      customFields: { "Case removed": "Yes", "Loaner issued": "No" },
      comments: [
        {
          authorId: frontDesk.id,
          body: "Device checked in. Customer removed case and screen protector at the counter.",
          createdAt: daysAgo(9, 11),
        },
        {
          authorId: tech.id,
          body: "Replaced display assembly, True Tone transferred, touch verified across full panel.",
          createdAt: daysAgo(7, 14),
        },
        {
          authorId: frontDesk.id,
          body: "Your iPhone is repaired and ready for pickup. We're open until 6pm today!",
          isPublic: true,
          channel: "SMS",
          updateType: "Ready for Pickup",
          createdAt: daysAgo(7, 15),
        },
      ],
      charges: [
        {
          productId: screenIp14.id,
          description: "iPhone 14 Screen Assembly",
          unitPriceCents: 21900,
        },
        {
          productId: labDiag.id,
          description: "Screen replacement labour",
          unitPriceCents: 6500,
          taxable: false,
        },
      ],
      time: [
        { userId: tech.id, startedAt: daysAgo(7, 13), minutes: 55, note: "Display swap" },
      ],
    },
    {
      number: 1002,
      customerId: ray.id,
      assetId: ray.assets[0].id,
      locationId: mainLocation.id,
      subject: 'MacBook Pro 13" — sticky keys after coffee spill',
      problemType: "Water Damage",
      status: "Waiting for Parts",
      priority: "HIGH",
      assignedToId: tech.id,
      dueDate: daysAhead(2),
      createdAt: daysAgo(6),
      intakeSigned: true,
      checklistTemplateId: laptopChecklist.id,
      checklist: checklistSnapshot(LAPTOP_CHECKLIST_ITEMS, 5, daysAgo(6, 11)),
      diagnosticNotes:
        "Corrosion on keyboard flex only; logic board clean under scope. Top case assembly on order.",
      comments: [
        {
          authorId: tech.id,
          body: "Board cleaned in ultrasonic, no shorts. Keyboard membrane is the failure point.",
          createdAt: daysAgo(5, 12),
        },
        {
          authorId: frontDesk.id,
          subject: "Part on order for ticket #1002",
          body: "Quick update: the keyboard assembly is on order and expected within 2-3 business days. We'll email you the moment it lands on the bench.",
          isPublic: true,
          channel: "EMAIL",
          updateType: "Waiting for Parts",
          createdAt: daysAgo(5, 13),
        },
      ],
      charges: [
        {
          productId: kbMbp.id,
          description: 'MacBook Pro 13" Keyboard Assembly',
          unitPriceCents: 32900,
        },
        {
          productId: labDiag.id,
          description: "Liquid damage cleaning + labour (2 hrs)",
          quantity: 2,
          unitPriceCents: 9500,
          taxable: false,
        },
      ],
      time: [
        { userId: tech.id, startedAt: daysAgo(5, 10), minutes: 95, note: "Ultrasonic clean + inspect" },
      ],
    },
    {
      number: 1003,
      customerId: sofia.id,
      assetId: sofia.assets[0].id,
      locationId: mainLocation.id,
      subject: "Galaxy S22 — intermittent charging",
      problemType: "Board Repair",
      status: "In Progress",
      priority: "NORMAL",
      assignedToId: tech.id,
      dueDate: laterToday(),
      createdAt: daysAgo(3),
      intakeSigned: true,
      checklistTemplateId: phoneChecklist.id,
      checklist: checklistSnapshot(PHONE_CHECKLIST_ITEMS, 4, daysAgo(3, 15)),
      diagnosticNotes: "Charge port flex pins worn. Port replacement scheduled.",
      comments: [
        {
          authorId: tech.id,
          body: "Confirmed with USB tester — drops below 0.4A when cable is moved. Ordering flex from bin stock.",
          createdAt: daysAgo(3, 15),
        },
        {
          authorId: tech.id,
          body: "Port desoldered, pads intact. Reassembly next.",
          createdAt: daysAgo(1, 11),
        },
      ],
      charges: [
        {
          productId: portS22.id,
          description: "Samsung S22 Charge Port Flex",
          unitPriceCents: 6900,
        },
        {
          productId: labDiag.id,
          description: "Micro-solder labour",
          unitPriceCents: 9500,
          taxable: false,
        },
      ],
      time: [
        { userId: tech.id, startedAt: daysAgo(1, 10), minutes: 70, note: "Port rework" },
        { userId: tech.id, startedAt: daysAgo(0, 9), note: "Still on the bench" },
      ],
    },
    {
      number: 1004,
      customerId: daniel.id,
      assetId: daniel.assets[0].id,
      locationId: mainLocation.id,
      subject: "Custom desktop — no POST after power outage",
      problemType: "Diagnostic",
      status: "Waiting on Customer",
      priority: "NORMAL",
      assignedToId: owner.id,
      // Ran past its target while the voicemail went unanswered.
      dueDate: daysAgo(1, 11),
      slaBreachedAt: daysAgo(1, 12),
      slaNotifiedAt: daysAgo(1, 12),
      createdAt: daysAgo(5),
      // The customer wrote back last night and nobody has answered — which is
      // exactly the comparison lib/needs-reply.ts makes.
      lastInboundAt: hoursAgo(19),
      diagnosticNotes:
        "PSU dead on the bench (no 12V). Board and GPU test fine on donor PSU. Waiting for the go-ahead on a replacement PSU.",
      comments: [
        {
          authorId: owner.id,
          body: "Called customer — no answer, left voicemail about PSU quote.",
          createdAt: daysAgo(2, 16),
        },
        {
          authorId: owner.id,
          body: "Diagnostic complete: the power supply failed. Let us know if you'd like us to install a replacement.",
          isPublic: true,
          channel: "NOTE",
          updateType: "Waiting on Customer",
          createdAt: daysAgo(2, 16),
        },
        {
          body: "Sorry for the slow reply — go ahead with the power supply. Can you also check why it kept restarting before the outage?",
          isPublic: true,
          channel: "EMAIL",
          createdAt: hoursAgo(19),
        },
      ],
      charges: [
        {
          productId: labDiag.id,
          description: "Bench diagnostic",
          unitPriceCents: 9500,
          taxable: false,
        },
      ],
    },
    {
      number: 1005,
      customerId: amara.id,
      assetId: amara.assets[0].id,
      locationId: mainLocation.id,
      subject: "XPS 13 — failing SSD, recover documents first",
      problemType: "Data Recovery",
      status: "In Progress",
      priority: "URGENT",
      assignedToId: tech.id,
      // Past its four-hour urgent target and already stamped by the SLA job,
      // so the overdue pill has something to match.
      dueDate: hoursAgo(9),
      slaBreachedAt: hoursAgo(8),
      slaNotifiedAt: hoursAgo(8),
      createdAt: daysAgo(2),
      intakeSigned: true,
      checklistTemplateId: recoveryChecklist.id,
      checklist: checklistSnapshot(RECOVERY_CHECKLIST_ITEMS, 5, daysAgo(2, 13)),
      diagnosticNotes:
        "SMART reallocated sector count climbing. Imaging with ddrescue, 71% complete, ~40 slow sectors.",
      customFields: { "Recovery priority": "Documents + photos", "Encrypted": "BitLocker off" },
      comments: [
        {
          authorId: tech.id,
          body: "Image started. Do not power-cycle the drive — passing through slow zone.",
          createdAt: daysAgo(2, 13),
        },
        {
          authorId: frontDesk.id,
          body: "We've started the recovery and it's going well so far. We'll text you as soon as we have a full copy.",
          isPublic: true,
          channel: "SMS",
          updateType: "In Progress",
          createdAt: daysAgo(1, 9),
        },
      ],
      charges: [
        {
          productId: labDr1.id,
          description: "Data Recovery — Level 1",
          unitPriceCents: 17500,
          taxable: false,
        },
        {
          productId: ssd1tb.id,
          description: "1TB NVMe SSD (replacement)",
          unitPriceCents: 12900,
        },
      ],
      time: [
        { userId: tech.id, startedAt: daysAgo(2, 12), minutes: 45, note: "Imaging setup" },
      ],
    },
    {
      number: 1006,
      customerId: tomas.id,
      assetId: tomas.assets[1].id,
      locationId: kiosk.id,
      subject: "iPhone 12 — battery health 71%, shuts down in the field",
      problemType: "Battery Replacement",
      status: "Resolved",
      priority: "NORMAL",
      assignedToId: tech.id,
      dueDate: daysAgo(18, 17),
      createdAt: daysAgo(21),
      resolvedAt: daysAgo(19),
      pickedUpAt: daysAgo(19, 16),
      reviewRequestedAt: daysAgo(18, 16),
      intakeSigned: true,
      diagnosticNotes: "Battery swapped, cycle count reset, 100% health reported.",
      comments: [
        {
          authorId: tech.id,
          body: "Battery replaced and calibrated. No other faults found.",
          createdAt: daysAgo(19, 14),
        },
        {
          authorId: frontDesk.id,
          subject: "Ticket #1006 complete",
          body: "All done — your iPhone 12 has a fresh battery and is ready whenever you are.",
          isPublic: true,
          channel: "EMAIL",
          updateType: "Resolved",
          createdAt: daysAgo(19, 15),
        },
      ],
      charges: [
        {
          productId: batIp12.id,
          description: "iPhone 12 Battery",
          unitPriceCents: 8900,
        },
        {
          productId: labDiag.id,
          description: "Battery replacement labour",
          unitPriceCents: 4500,
          taxable: false,
        },
      ],
      time: [
        { userId: tech.id, startedAt: daysAgo(19, 13), minutes: 35, note: "Battery swap" },
      ],
    },
    {
      number: 1007,
      customerId: priscilla.id,
      assetId: priscilla.assets[0].id,
      locationId: mainLocation.id,
      subject: "PS5 — HDMI port pushed in, no video",
      problemType: "Board Repair",
      status: "New",
      priority: "NORMAL",
      dueDate: daysAhead(1),
      createdAt: daysAgo(1),
      comments: [
        {
          authorId: frontDesk.id,
          body: "Dropped off at the counter. Customer says a cable was yanked while plugged in.",
          createdAt: daysAgo(1, 17),
        },
      ],
    },
    {
      number: 1008,
      customerId: owen.id,
      assetId: owen.assets[0].id,
      locationId: mainLocation.id,
      subject: "ThinkPad T14 — pop-ups and browser redirects",
      problemType: "Software / Virus",
      status: "New",
      priority: "LOW",
      dueDate: daysAhead(4),
      createdAt: daysAgo(0, 9),
      comments: [
        {
          authorId: frontDesk.id,
          body: "Intake taken over the phone; device arriving this afternoon.",
          createdAt: daysAgo(0, 9),
        },
      ],
    },
    {
      number: 1009,
      customerId: ray.id,
      assetId: ray.assets[1].id,
      locationId: kiosk.id,
      subject: "iPad Air 4 — will not hold a charge overnight",
      problemType: "Battery Replacement",
      status: "Waiting on Customer",
      priority: "LOW",
      assignedToId: tech.id,
      dueDate: daysAgo(4, 11),
      slaBreachedAt: daysAgo(4, 12),
      slaNotifiedAt: daysAgo(4, 12),
      createdAt: daysAgo(8),
      diagnosticNotes: "Battery at 78% health. Estimate #1003 sent for approval.",
      comments: [
        {
          authorId: tech.id,
          body: "Estimate sent; holding the device on the shelf until we hear back.",
          createdAt: daysAgo(7, 10),
        },
      ],
    },
    {
      number: 1010,
      customerId: elena.id,
      locationId: mainLocation.id,
      subject: "Walk-in — tempered glass fitting",
      problemType: "Screen Repair",
      status: "Resolved",
      priority: "LOW",
      assignedToId: frontDesk.id,
      dueDate: daysAgo(6, 17),
      createdAt: daysAgo(7, 15),
      resolvedAt: daysAgo(7, 16),
      comments: [
        {
          authorId: frontDesk.id,
          body: "Applied glass protector at pickup, bubble-free.",
          createdAt: daysAgo(7, 16),
        },
      ],
      charges: [
        {
          productId: glass.id,
          description: "Tempered Glass Protector",
          unitPriceCents: 2499,
        },
      ],
    },
    {
      // Arrived through the public check-in form at /checkin/demo — hence the
      // source, and hence the signature captured on the customer's own phone.
      number: 1011,
      customerId: sofia.id,
      assetId: sofia.assets[1].id,
      locationId: mainLocation.id,
      subject: "HP Envy x360 — will not get past the HP logo",
      problemType: "Software / Virus",
      status: "In Progress",
      priority: "NORMAL",
      assignedToId: tech.id,
      source: "checkin",
      intakeSigned: true,
      dueDate: daysAhead(1, 14),
      createdAt: daysAgo(1, 14),
      checklistTemplateId: laptopChecklist.id,
      checklist: checklistSnapshot(LAPTOP_CHECKLIST_ITEMS, 3, daysAgo(1, 15)),
      diagnosticNotes:
        "Boots to recovery. Winload signed but the ESP is half-written — likely a failed feature update rather than the drive.",
      comments: [
        {
          authorId: frontDesk.id,
          body: "Checked in online at 2:04pm; customer dropped the machine at the counter twenty minutes later.",
          createdAt: daysAgo(1, 14),
        },
        {
          authorId: tech.id,
          body: "SMART clean, 3% used. Rebuilding the boot configuration before considering a reinstall.",
          createdAt: daysAgo(1, 16),
        },
      ],
      charges: [
        {
          productId: labDiag.id,
          description: "Bench diagnostic",
          unitPriceCents: 9500,
          taxable: false,
        },
      ],
      time: [
        {
          userId: tech.id,
          startedAt: daysAgo(1, 16),
          minutes: 50,
          note: "Boot repair attempts",
        },
      ],
    },
    {
      // Collected this morning: `pickedUpAt` set, `reviewRequestedAt` still
      // null, so lib/jobs/reviews.ts has exactly one request pending.
      number: 1012,
      customerId: priscilla.id,
      assetId: priscilla.assets[1].id,
      locationId: mainLocation.id,
      subject: "iPhone 13 — cracked screen after a drop",
      problemType: "Screen Repair",
      status: "Resolved",
      priority: "NORMAL",
      assignedToId: tech.id,
      intakeSigned: true,
      // Missed its date by a day — the shop's On-time % should not read 100%.
      dueDate: daysAgo(2, 17),
      slaBreachedAt: daysAgo(2, 18),
      slaNotifiedAt: daysAgo(2, 18),
      createdAt: daysAgo(4, 10),
      resolvedAt: daysAgo(1, 15),
      pickedUpAt: hoursAgo(6),
      checklistTemplateId: phoneChecklist.id,
      checklist: checklistSnapshot(PHONE_CHECKLIST_ITEMS, 7, daysAgo(4, 11)),
      diagnosticNotes: "Display swapped, Face ID retained, water seal replaced.",
      comments: [
        {
          authorId: tech.id,
          body: "Screen replaced and sealed. Face ID and True Tone both survived the transfer.",
          createdAt: daysAgo(1, 15),
        },
        {
          authorId: frontDesk.id,
          body: "Your iPhone 13 is repaired and ready for pickup whenever suits you.",
          isPublic: true,
          channel: "SMS",
          updateType: "Ready for Pickup",
          createdAt: daysAgo(1, 16),
        },
      ],
      charges: [
        {
          productId: screenIp14.id,
          description: "iPhone 13 Screen Assembly",
          unitPriceCents: 18900,
        },
        {
          productId: labDiag.id,
          description: "Screen replacement labour",
          unitPriceCents: 6500,
          taxable: false,
        },
      ],
      time: [
        {
          userId: tech.id,
          startedAt: daysAgo(1, 14),
          minutes: 50,
          note: "Display swap",
        },
      ],
    },
    {
      // Warranty rework on a line sold nine days ago. `warrantyInvoiceLineId`
      // is stapled on once the invoices exist, further down.
      number: 1013,
      customerId: elena.id,
      assetId: elena.assets[0].id,
      locationId: mainLocation.id,
      subject: "iPhone 14 Pro — touch dropping out again (warranty)",
      problemType: "Screen Repair",
      status: "In Progress",
      priority: "HIGH",
      assignedToId: tech.id,
      isWarranty: true,
      dueDate: laterToday(),
      createdAt: daysAgo(1, 11),
      diagnosticNotes:
        "Same edge as the original repair. Display connector reseated; running a soak test before deciding on a replacement panel.",
      comments: [
        {
          authorId: frontDesk.id,
          body: "Back within warranty on invoice #1001 — no charge. Customer is not happy but was reasonable about it.",
          createdAt: daysAgo(1, 11),
        },
        {
          authorId: tech.id,
          body: "Connector had lifted a fraction. Reseated and soak testing for 24 hours before I sign it off.",
          createdAt: daysAgo(1, 13),
        },
      ],
      time: [
        {
          userId: tech.id,
          startedAt: daysAgo(1, 13),
          minutes: 40,
          note: "Warranty rework — not billed",
          billable: false,
        },
      ],
    },
    {
      // Kiosk job with money taken up front — the deposit rows land further
      // down and this ticket's cached `depositCents` is set from them.
      number: 1014,
      customerId: tomas.id,
      assetId: tomas.assets[0].id,
      locationId: kiosk.id,
      subject: "Galaxy Tab A8 — digitizer dead across the top third",
      problemType: "Screen Repair",
      status: "Waiting for Parts",
      priority: "NORMAL",
      assignedToId: tech.id,
      intakeSigned: true,
      dueDate: daysAhead(1),
      createdAt: daysAgo(3, 11),
      checklistTemplateId: phoneChecklist.id,
      checklist: checklistSnapshot(PHONE_CHECKLIST_ITEMS, 5, daysAgo(3, 12)),
      diagnosticNotes:
        "Digitizer only; LCD and board fine. Aftermarket panel ordered, nothing in bin stock.",
      comments: [
        {
          authorId: frontDesk.id,
          body: "Took $75 deposit against the panel — customer signed for it at the kiosk.",
          createdAt: daysAgo(3, 11),
        },
        {
          authorId: frontDesk.id,
          subject: "Part on order for ticket #1014",
          body: "The replacement panel is on order and should reach us in the next few days. We'll message you as soon as it lands.",
          isPublic: true,
          channel: "EMAIL",
          updateType: "Waiting for Parts",
          createdAt: daysAgo(2, 10),
        },
      ],
      charges: [
        {
          description: "Galaxy Tab A8 digitizer (aftermarket)",
          unitPriceCents: 11900,
        },
        {
          productId: labDiag.id,
          description: "Digitizer replacement labour",
          unitPriceCents: 7500,
          taxable: false,
        },
      ],
    },
    {
      // The second device sitting on the pickup shelf.
      number: 1015,
      customerId: daniel.id,
      assetId: daniel.assets[1].id,
      locationId: mainLocation.id,
      subject: "Latitude 5420 — fan roars, throttling under any load",
      problemType: "Diagnostic",
      status: "Ready for Pickup",
      priority: "NORMAL",
      assignedToId: tech.id,
      intakeSigned: true,
      createdAt: daysAgo(3, 9),
      checklistTemplateId: laptopChecklist.id,
      checklist: checklistSnapshot(LAPTOP_CHECKLIST_ITEMS, 8, daysAgo(3, 10)),
      diagnosticNotes:
        "Heatsink packed solid with dust, paste chalky. Cleaned, repasted, package temp down 24°C under load.",
      comments: [
        {
          authorId: tech.id,
          body: "Stripped, cleaned and repasted. Ran a 20-minute stress test — holds 71°C now, no throttling.",
          createdAt: daysAgo(2, 15),
        },
        {
          authorId: frontDesk.id,
          body: "All finished — the laptop runs quiet again and is ready for pickup. Call only, per your preference.",
          isPublic: true,
          channel: "NOTE",
          updateType: "Ready for Pickup",
          createdAt: daysAgo(2, 16),
        },
      ],
      charges: [
        {
          productId: labDiag.id,
          description: "Thermal service — strip, clean, repaste",
          unitPriceCents: 9500,
          taxable: false,
        },
      ],
      time: [
        {
          userId: tech.id,
          startedAt: daysAgo(2, 13),
          minutes: 80,
          note: "Thermal service",
        },
      ],
    },
    {
      // Carries the time that HAS been billed, and the deposit that has been
      // consumed by invoice #1010.
      number: 1016,
      customerId: amara.id,
      assetId: amara.assets[0].id,
      locationId: mainLocation.id,
      subject: "XPS 13 — rebuild Windows once the recovery is verified",
      problemType: "Software / Virus",
      status: "Resolved",
      priority: "NORMAL",
      assignedToId: tech.id,
      intakeSigned: true,
      dueDate: daysAgo(5, 17),
      createdAt: daysAgo(7, 10),
      resolvedAt: daysAgo(5, 16),
      pickedUpAt: daysAgo(5, 17),
      reviewRequestedAt: daysAgo(4, 17),
      checklistTemplateId: recoveryChecklist.id,
      checklist: checklistSnapshot(RECOVERY_CHECKLIST_ITEMS, 8, daysAgo(7, 11)),
      diagnosticNotes:
        "Clean install on the new drive, documents restored from the verified image, BitLocker left off at the customer's request.",
      comments: [
        {
          authorId: tech.id,
          body: "Image verified, checksums match. Clean install done and the documents folder restored.",
          createdAt: daysAgo(5, 16),
        },
        {
          authorId: frontDesk.id,
          subject: "Ticket #1016 complete",
          body: "Your XPS is rebuilt and your documents are back where you left them. The $120 deposit has been applied to the final invoice.",
          isPublic: true,
          channel: "EMAIL",
          updateType: "Resolved",
          createdAt: daysAgo(5, 17),
        },
      ],
      time: billedTime,
    },
  ];

  const tickets: { id: string; number: number; customerId: string }[] = [];
  for (const spec of ticketSpecs) {
    const ticket = await db.ticket.create({
      data: {
        shopId: shop.id,
        number: spec.number,
        customerId: spec.customerId,
        assetId: spec.assetId,
        locationId: spec.locationId,
        subject: spec.subject,
        problemType: spec.problemType,
        status: spec.status,
        priority: spec.priority ?? "NORMAL",
        assignedToId: spec.assignedToId,
        dueDate: spec.dueDate,
        diagnosticNotes: spec.diagnosticNotes,
        customFields: spec.customFields,
        intakeSignatureDataUrl: spec.intakeSigned ? SIGNATURE_DATA_URL : null,
        intakeSignedAt: spec.intakeSigned ? spec.createdAt : null,
        resolvedAt: spec.resolvedAt,
        createdAt: spec.createdAt,
        source: spec.source ?? "staff",
        isWarranty: spec.isWarranty ?? false,
        checklistTemplateId: spec.checklistTemplateId,
        checklist: spec.checklist,
        lastInboundAt: spec.lastInboundAt,
        pickedUpAt: spec.pickedUpAt,
        reviewRequestedAt: spec.reviewRequestedAt,
        slaBreachedAt: spec.slaBreachedAt,
        slaNotifiedAt: spec.slaNotifiedAt,
        comments: spec.comments
          ? {
              create: spec.comments.map((c) => ({
                shopId: shop.id,
                authorId: c.authorId,
                body: c.body,
                isPublic: c.isPublic ?? false,
                subject: c.subject,
                updateType: c.updateType,
                channel: c.channel ?? "NOTE",
                createdAt: c.createdAt,
              })),
            }
          : undefined,
        charges: spec.charges
          ? {
              create: spec.charges.map((c) => ({
                shopId: shop.id,
                productId: c.productId,
                description: c.description,
                quantity: c.quantity ?? 1,
                unitPriceCents: c.unitPriceCents,
                taxable: c.taxable ?? true,
              })),
            }
          : undefined,
        timeEntries: spec.time
          ? {
              create: spec.time.map((t) => ({
                shopId: shop.id,
                userId: t.userId,
                startedAt: t.startedAt,
                endedAt: t.minutes
                  ? new Date(t.startedAt.getTime() + t.minutes * 60_000)
                  : null,
                seconds: t.minutes ? t.minutes * 60 : null,
                note: t.note,
                billable: t.billable ?? true,
              })),
            }
          : undefined,
      },
    });
    tickets.push(ticket);
  }

  const ticketByNumber = (n: number) => tickets.find((t) => t.number === n)!;

  // -------------------------------------------------------------- estimates ---
  await db.estimate.create({
    data: {
      shopId: shop.id,
      number: 1001,
      customerId: daniel.id,
      ticketId: ticketByNumber(1004).id,
      status: "SENT",
      taxRateBps: TAX_BPS,
      taxRateId: salesTax.id,
      notes: "Replaces the failed power supply with an 80+ Gold 650W unit.",
      expiresAt: daysAhead(10),
      createdAt: daysAgo(2, 17),
      lines: {
        create: [
          {
            description: "650W 80+ Gold ATX Power Supply",
            quantity: 1,
            unitPriceCents: 10900,
            taxable: true,
            sortOrder: 0,
          },
          {
            productId: labDiag.id,
            description: "Install + cable management",
            quantity: 1,
            unitPriceCents: 4750,
            taxable: false,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await db.estimate.create({
    data: {
      shopId: shop.id,
      number: 1002,
      customerId: priscilla.id,
      ticketId: ticketByNumber(1007).id,
      status: "DRAFT",
      taxRateBps: TAX_BPS,
      taxRateId: salesTax.id,
      notes: "Pending teardown — port may be salvageable.",
      createdAt: daysAgo(0, 12),
      lines: {
        create: [
          {
            description: "HDMI port replacement (part)",
            quantity: 1,
            unitPriceCents: 4500,
            taxable: true,
            sortOrder: 0,
          },
          {
            productId: labDiag.id,
            description: "Micro-solder labour (1.5 hrs)",
            quantity: 2,
            unitPriceCents: 9500,
            taxable: false,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await db.estimate.create({
    data: {
      shopId: shop.id,
      number: 1003,
      customerId: ray.id,
      ticketId: ticketByNumber(1009).id,
      status: "APPROVED",
      taxRateBps: TAX_BPS,
      taxRateId: salesTax.id,
      approvedAt: daysAgo(6, 11),
      approvalSignatureDataUrl: SIGNATURE_DATA_URL,
      expiresAt: daysAhead(4),
      createdAt: daysAgo(7, 10),
      lines: {
        create: [
          {
            description: "iPad Air 4 Battery (OEM)",
            quantity: 1,
            unitPriceCents: 11900,
            taxable: true,
            sortOrder: 0,
          },
          {
            productId: labDiag.id,
            description: "Battery replacement labour",
            quantity: 1,
            unitPriceCents: 7500,
            taxable: false,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const convertedEstimate = await db.estimate.create({
    data: {
      shopId: shop.id,
      number: 1004,
      customerId: elena.id,
      ticketId: ticketByNumber(1001).id,
      status: "CONVERTED",
      taxRateBps: TAX_BPS,
      taxRateId: salesTax.id,
      approvedAt: daysAgo(8, 12),
      approvalSignatureDataUrl: SIGNATURE_DATA_URL,
      createdAt: daysAgo(9, 12),
      lines: {
        create: [
          {
            productId: screenIp14.id,
            description: "iPhone 14 Screen Assembly",
            quantity: 1,
            unitPriceCents: 21900,
            taxable: true,
            sortOrder: 0,
          },
          {
            productId: labDiag.id,
            description: "Screen replacement labour",
            quantity: 1,
            unitPriceCents: 6500,
            taxable: false,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // A fifth, declined estimate — exercises the DECLINED state.
  await db.estimate.create({
    data: {
      shopId: shop.id,
      number: 1005,
      customerId: owen.id,
      status: "DECLINED",
      taxRateBps: TAX_BPS,
      taxRateId: salesTax.id,
      notes: "Customer decided to replace the machine instead.",
      createdAt: daysAgo(30),
      lines: {
        create: [
          {
            description: "ThinkPad T14 motherboard (refurb)",
            quantity: 1,
            unitPriceCents: 48900,
            taxable: true,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // ----------------------------------------------------- recurring billing ---
  // The schedules come first: the invoices they have already stamped out carry
  // `recurringInvoiceId`, and the "Generated invoices" list on each schedule is
  // what makes the screen worth looking at.
  const managedIt = await db.recurringInvoice.create({
    data: {
      shopId: shop.id,
      customerId: ray.id,
      name: "Okonkwo Dental — managed IT retainer",
      frequency: "MONTHLY",
      // The customer holds an exemption certificate, so the schedule bills at
      // zero — the same answer lib/tax.ts resolveTaxRate() gives for them.
      taxRateBps: 0,
      taxRateId: null,
      dueInDays: 14,
      autoSend: true,
      autoCharge: true,
      active: true,
      lastRunAt: daysAgo(12, 6),
      nextRunAt: daysAhead(18, 6),
      lines: {
        create: [
          {
            description: "Managed IT — monthly retainer (12 seats)",
            quantity: 1,
            unitPriceCents: 39000,
            taxable: true,
            sortOrder: 0,
          },
          {
            description: "Offsite backup monitoring",
            quantity: 1,
            unitPriceCents: 6000,
            taxable: true,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  const fleetCare = await db.recurringInvoice.create({
    data: {
      shopId: shop.id,
      customerId: tomas.id,
      name: "Rivera Landscaping — field tablet care",
      frequency: "QUARTERLY",
      taxRateBps: COUNTY_TAX_BPS,
      taxRateId: countyTax.id,
      dueInDays: 21,
      autoSend: false,
      active: true,
      lastRunAt: daysAgo(34, 6),
      nextRunAt: daysAhead(56, 6),
      lines: {
        create: [
          {
            description: "Tablet fleet care — quarterly service (6 devices)",
            quantity: 1,
            unitPriceCents: 30000,
            taxable: true,
            sortOrder: 0,
          },
          {
            productId: glass.id,
            description: "Replacement screen protectors",
            quantity: 6,
            unitPriceCents: 1000,
            taxable: true,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // Paused: the customer asked to hold the plan over the winter.
  await db.recurringInvoice.create({
    data: {
      shopId: shop.id,
      customerId: owen.id,
      name: "Owen Fitzgerald — quarterly tune-up plan",
      frequency: "QUARTERLY",
      taxRateBps: TAX_BPS,
      taxRateId: salesTax.id,
      dueInDays: 14,
      active: false,
      lastRunAt: daysAgo(96, 6),
      nextRunAt: daysAhead(5, 6),
      lines: {
        create: [
          {
            productId: labDiag.id,
            description: "Quarterly clean, repaste and health check",
            quantity: 1,
            unitPriceCents: 12500,
            taxable: false,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // --------------------------------------------------------------- invoices ---
  type InvoiceSpec = {
    number: number;
    customerId: string;
    ticketId?: string;
    estimateId?: string;
    recurringInvoiceId?: string;
    locationId?: string;
    status: "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "VOID";
    /** Defaults to the shop rate; a customer on another jurisdiction overrides. */
    taxRateBps?: number;
    taxRateId?: string | null;
    dueDate?: Date;
    paidAt?: Date;
    signed?: boolean;
    createdAt: Date;
    notes?: string;
    lines: {
      productId?: string;
      description: string;
      quantity?: number;
      unitPriceCents: number;
      taxable?: boolean;
      serial?: string;
      /** Snapshot of Product.warrantyDays at sale time (lib/warranty.ts). */
      warrantyDays?: number;
    }[];
    payments?: {
      amountCents: number;
      method: "CASH" | "CARD" | "CHECK" | "OTHER" | "CREDIT";
      reference?: string;
      takenById?: string;
      stripeSource?: string;
      stripePaymentIntentId?: string;
      createdAt: Date;
    }[];
  };

  const invoiceSpecs: InvoiceSpec[] = [
    {
      // Fully paid — converted from estimate #1004, ticket #1001.
      number: 1001,
      customerId: elena.id,
      ticketId: ticketByNumber(1001).id,
      estimateId: convertedEstimate.id,
      status: "PAID",
      createdAt: daysAgo(7, 15),
      paidAt: daysAgo(7, 16),
      signed: true,
      lines: [
        {
          productId: screenIp14.id,
          description: "iPhone 14 Screen Assembly",
          unitPriceCents: 21900,
          serial: "SCR-A9931",
          warrantyDays: 90,
        },
        {
          productId: labDiag.id,
          description: "Screen replacement labour",
          unitPriceCents: 6500,
          taxable: false,
        },
      ],
      payments: [
        {
          amountCents: 30207, // 21900 + round(21900 * 8.25%) + 6500 (labour untaxed)
          method: "CARD",
          reference: "VISA ••4412",
          takenById: frontDesk.id,
          createdAt: daysAgo(7, 16),
        },
      ],
    },
    {
      // Paid in full, cash, at the kiosk — ticket #1006.
      number: 1002,
      customerId: tomas.id,
      ticketId: ticketByNumber(1006).id,
      locationId: kiosk.id,
      status: "PAID",
      createdAt: daysAgo(19, 15),
      paidAt: daysAgo(19, 15),
      lines: [
        {
          productId: batIp12.id,
          description: "iPhone 12 Battery",
          unitPriceCents: 8900,
          warrantyDays: 180,
        },
        {
          productId: labDiag.id,
          description: "Battery replacement labour",
          unitPriceCents: 4500,
          taxable: false,
        },
      ],
      payments: [
        {
          amountCents: 14134, // 8900 + round(8900 * 8.25%) + 4500 (labour untaxed)
          method: "CASH",
          takenById: frontDesk.id,
          createdAt: daysAgo(19, 15),
        },
      ],
    },
    {
      // Partially paid — deposit taken up front on the MacBook job.
      number: 1003,
      customerId: ray.id,
      ticketId: ticketByNumber(1002).id,
      status: "PARTIAL",
      dueDate: daysAhead(9),
      createdAt: daysAgo(5, 14),
      notes: "50% deposit collected at drop-off; balance due at pickup.",
      lines: [
        {
          productId: kbMbp.id,
          description: 'MacBook Pro 13" Keyboard Assembly',
          unitPriceCents: 32900,
        },
        {
          productId: labDiag.id,
          description: "Liquid damage cleaning + labour",
          quantity: 2,
          unitPriceCents: 9500,
          taxable: false,
        },
      ],
      payments: [
        {
          amountCents: 25000,
          method: "CHECK",
          reference: "Check #2291",
          takenById: owner.id,
          createdAt: daysAgo(5, 14),
        },
      ],
    },
    {
      // Sent, unpaid — the walk-in accessory sale.
      number: 1004,
      customerId: elena.id,
      ticketId: ticketByNumber(1010).id,
      status: "SENT",
      dueDate: daysAhead(6),
      createdAt: daysAgo(7, 16),
      lines: [
        {
          productId: glass.id,
          description: "Tempered Glass Protector",
          unitPriceCents: 2499,
        },
      ],
    },
    {
      // Draft — not yet sent to the customer.
      number: 1005,
      customerId: amara.id,
      ticketId: ticketByNumber(1005).id,
      status: "DRAFT",
      createdAt: daysAgo(1, 16),
      notes: "Hold until the image verifies clean.",
      lines: [
        {
          productId: labDr1.id,
          description: "Data Recovery — Level 1",
          unitPriceCents: 17500,
          taxable: false,
        },
        {
          productId: ssd1tb.id,
          description: "1TB NVMe SSD (replacement)",
          unitPriceCents: 12900,
          serial: "NV-7734-KX",
          warrantyDays: 365,
        },
      ],
    },
    {
      // Voided — duplicate raised in error.
      number: 1006,
      customerId: owen.id,
      status: "VOID",
      createdAt: daysAgo(28),
      notes: "Voided: raised against the wrong customer.",
      lines: [
        {
          description: "ThinkPad T14 motherboard (refurb)",
          unitPriceCents: 48900,
        },
      ],
    },
    {
      // Serialized sale: the unit written on the line is attached to its
      // ProductSerial row below, which is what takes it off the shelf.
      number: 1007,
      customerId: owen.id,
      status: "PAID",
      createdAt: daysAgo(16, 14),
      paidAt: daysAgo(16, 14),
      lines: [
        {
          productId: refurbIp13.id,
          description: "iPhone 13 128GB — Refurbished",
          unitPriceCents: 42900,
          serial: "IP13RF8842K",
          warrantyDays: 365,
        },
      ],
      payments: [
        {
          amountCents: 46439, // 42900 + 8.25% tax
          method: "CARD",
          reference: "MC ••7781",
          takenById: frontDesk.id,
          stripeSource: "terminal",
          stripePaymentIntentId: "pi_demo_1007_refurb",
          createdAt: daysAgo(16, 14),
        },
      ],
    },
    {
      number: 1008,
      customerId: daniel.id,
      status: "PAID",
      createdAt: daysAgo(22, 11),
      paidAt: daysAgo(22, 11),
      notes: "Trade-in credited separately in cash at the counter.",
      lines: [
        {
          productId: refurbMba.id,
          description: 'MacBook Air 13" M1 — Refurbished',
          unitPriceCents: 64900,
          serial: "MBAM1C7731",
          warrantyDays: 365,
        },
      ],
      payments: [
        {
          amountCents: 70254, // 64900 + 8.25% tax
          method: "CARD",
          reference: "VISA ••9910",
          takenById: owner.id,
          stripeSource: "terminal",
          stripePaymentIntentId: "pi_demo_1008_mba",
          createdAt: daysAgo(22, 11),
        },
      ],
    },
    {
      number: 1009,
      customerId: priscilla.id,
      ticketId: ticketByNumber(1012).id,
      status: "PAID",
      createdAt: daysAgo(1, 16),
      paidAt: daysAgo(1, 16),
      signed: true,
      lines: [
        {
          productId: screenIp14.id,
          description: "iPhone 13 Screen Assembly",
          unitPriceCents: 18900,
          warrantyDays: 90,
        },
        {
          productId: labDiag.id,
          description: "Screen replacement labour",
          unitPriceCents: 6500,
          taxable: false,
        },
      ],
      payments: [
        {
          amountCents: 26959, // 18900 + 8.25% tax + 6500 (labour untaxed)
          method: "CARD",
          reference: "VISA ••3318",
          takenById: frontDesk.id,
          stripeSource: "terminal",
          stripePaymentIntentId: "pi_demo_1009_screen",
          createdAt: daysAgo(1, 16),
        },
      ],
    },
    {
      // Bench time billed onto an invoice, with the $120 intake deposit
      // absorbed by the CREDIT tender lib/deposits.ts writes.
      number: 1010,
      customerId: amara.id,
      ticketId: ticketByNumber(1016).id,
      status: "PAID",
      createdAt: daysAgo(5, 16),
      paidAt: daysAgo(5, 16),
      lines: billedTime.map((entry) => ({
        description: labourDescription(
          entry.userName,
          entry.startedAt,
          entry.minutes * 60,
        ),
        unitPriceCents: labourAmountCents(entry.minutes * 60),
        taxable: true,
      })),
      payments: [
        {
          amountCents: 12000,
          method: "CREDIT",
          reference: "Deposit on ticket #1016",
          takenById: frontDesk.id,
          createdAt: daysAgo(5, 16),
        },
        {
          amountCents: 8568, // 19000 + 8.25% tax, less the deposit
          method: "CARD",
          reference: "VISA ••2204",
          takenById: frontDesk.id,
          createdAt: daysAgo(5, 16),
        },
      ],
    },
    {
      // Part of this sale came back: the refund below walks the status from
      // PAID down to PARTIAL (components/billing/refund-math.ts).
      number: 1011,
      customerId: owen.id,
      status: "PARTIAL",
      createdAt: daysAgo(11, 12),
      notes: "One screen protector returned unopened.",
      lines: [
        {
          productId: glass.id,
          description: "Tempered Glass Protector",
          unitPriceCents: 2499,
        },
        {
          productId: cable.id,
          description: "USB-C to Lightning Cable (1m)",
          unitPriceCents: 2499,
        },
      ],
      payments: [
        {
          amountCents: 5410, // 4998 + 8.25% tax
          method: "CARD",
          reference: "AMEX ••1006",
          takenById: frontDesk.id,
          stripeSource: "terminal",
          stripePaymentIntentId: "pi_demo_1011_acc",
          createdAt: daysAgo(11, 12),
        },
      ],
    },
    {
      // Refunded in full to store credit, so nothing is held and the status
      // walks all the way back to SENT.
      number: 1012,
      customerId: elena.id,
      status: "SENT",
      createdAt: daysAgo(13, 15),
      notes: "Case returned; refunded to store credit at the customer's request.",
      lines: [
        {
          productId: caseIp14.id,
          description: "Silicone Case — iPhone 14 Pro",
          unitPriceCents: 3499,
        },
      ],
      payments: [
        {
          amountCents: 3788, // 3499 + 8.25% tax
          method: "CARD",
          reference: "VISA ••4412",
          takenById: frontDesk.id,
          createdAt: daysAgo(13, 15),
        },
      ],
    },
    {
      // Generated by the managed-IT schedule and charged to the card on file.
      number: 1013,
      customerId: ray.id,
      recurringInvoiceId: managedIt.id,
      status: "PAID",
      taxRateBps: 0,
      taxRateId: null,
      createdAt: daysAgo(42, 6),
      paidAt: daysAgo(42, 6),
      lines: [
        {
          description: "Managed IT — monthly retainer (12 seats)",
          unitPriceCents: 39000,
        },
        { description: "Offsite backup monitoring", unitPriceCents: 6000 },
      ],
      payments: [
        {
          amountCents: 45000,
          method: "CARD",
          reference: "VISA ••4242 (card on file)",
          stripeSource: "card_on_file",
          stripePaymentIntentId: "pi_demo_1013_retainer",
          createdAt: daysAgo(42, 6),
        },
      ],
    },
    {
      number: 1014,
      customerId: ray.id,
      recurringInvoiceId: managedIt.id,
      status: "SENT",
      taxRateBps: 0,
      taxRateId: null,
      dueDate: daysAhead(2, 6),
      createdAt: daysAgo(12, 6),
      lines: [
        {
          description: "Managed IT — monthly retainer (12 seats)",
          unitPriceCents: 39000,
        },
        { description: "Offsite backup monitoring", unitPriceCents: 6000 },
      ],
    },
    {
      // The other jurisdiction: billed at the county rate the customer is
      // pinned to, which the snapshot on this invoice records forever.
      number: 1015,
      customerId: tomas.id,
      recurringInvoiceId: fleetCare.id,
      locationId: kiosk.id,
      status: "PAID",
      taxRateBps: COUNTY_TAX_BPS,
      taxRateId: countyTax.id,
      createdAt: daysAgo(34, 6),
      paidAt: daysAgo(30, 14),
      lines: [
        {
          description: "Tablet fleet care — quarterly service (6 devices)",
          unitPriceCents: 30000,
        },
        {
          productId: glass.id,
          description: "Replacement screen protectors",
          quantity: 6,
          unitPriceCents: 1000,
        },
      ],
      payments: [
        {
          amountCents: 38430, // 36000 + 6.75% county tax
          method: "CHECK",
          reference: "Check #4471",
          takenById: owner.id,
          createdAt: daysAgo(30, 14),
        },
      ],
    },
  ];

  const invoices: { id: string; number: number }[] = [];
  for (const spec of invoiceSpecs) {
    const invoice = await db.invoice.create({
      data: {
        shopId: shop.id,
        number: spec.number,
        customerId: spec.customerId,
        ticketId: spec.ticketId,
        estimateId: spec.estimateId,
        recurringInvoiceId: spec.recurringInvoiceId,
        locationId: spec.locationId ?? mainLocation.id,
        status: spec.status,
        taxRateBps: spec.taxRateBps ?? TAX_BPS,
        taxRateId:
          spec.taxRateId === undefined ? salesTax.id : spec.taxRateId,
        notes: spec.notes,
        dueDate: spec.dueDate,
        paidAt: spec.paidAt,
        signatureDataUrl: spec.signed ? SIGNATURE_DATA_URL : null,
        createdAt: spec.createdAt,
        lines: {
          create: spec.lines.map((l, i) => ({
            productId: l.productId,
            description: l.description,
            quantity: l.quantity ?? 1,
            unitPriceCents: l.unitPriceCents,
            taxable: l.taxable ?? true,
            serial: l.serial,
            warrantyDays: l.warrantyDays,
            sortOrder: i,
          })),
        },
        payments: spec.payments
          ? {
              create: spec.payments.map((p) => ({
                shopId: shop.id,
                amountCents: p.amountCents,
                method: p.method,
                reference: p.reference,
                takenById: p.takenById,
                stripeSource: p.stripeSource,
                stripePaymentIntentId: p.stripePaymentIntentId,
                createdAt: p.createdAt,
              })),
            }
          : undefined,
      },
    });
    invoices.push(invoice);
  }

  // Link the ticket charges that have been invoiced back to their invoice.
  const invoiceByNumber = (n: number) => invoices.find((i) => i.number === n)!;
  for (const [ticketNumber, invoiceNumber] of [
    [1001, 1001],
    [1006, 1002],
    [1002, 1003],
    [1010, 1004],
    [1012, 1009],
  ] as const) {
    await db.ticketCharge.updateMany({
      where: { shopId: shop.id, ticketId: ticketByNumber(ticketNumber).id },
      data: { invoiceId: invoiceByNumber(invoiceNumber).id },
    });
  }

  // --------------------------------------------------------- warranty claim ---
  // Ticket #1013 is a comeback on a line invoice #1001 sold nine days ago, so
  // it points at that InvoiceLine rather than carrying a copy of the cover.
  const warrantedScreenLine = await db.invoiceLine.findFirst({
    where: {
      invoiceId: invoiceByNumber(1001).id,
      warrantyDays: { not: null },
    },
    select: { id: true },
  });
  if (warrantedScreenLine) {
    await db.ticket.update({
      where: { id: ticketByNumber(1013).id },
      data: { warrantyInvoiceLineId: warrantedScreenLine.id },
    });
  }

  // ------------------------------------------------------------ billed time ---
  // The two entries on ticket #1016 became the labour lines on invoice #1010,
  // so they carry its id and drop out of the "Bill time" banner. Every other
  // stopped, billable entry is deliberately still unbilled.
  await db.timeEntry.updateMany({
    where: { shopId: shop.id, ticketId: ticketByNumber(1016).id },
    data: { invoiceId: invoiceByNumber(1010).id },
  });

  // --------------------------------------------------------------- serials ---
  // THE INVARIANT (lib/serials.ts): for a serialized product, `stockQty` is a
  // cache of how many units are IN_STOCK. The product rows above claim 3 and 2;
  // the rows below are what make that true.
  const soldIp13Line = await db.invoiceLine.findFirst({
    where: { invoiceId: invoiceByNumber(1007).id, serial: "IP13RF8842K" },
    select: { id: true },
  });
  const soldMbaLine = await db.invoiceLine.findFirst({
    where: { invoiceId: invoiceByNumber(1008).id, serial: "MBAM1C7731" },
    select: { id: true },
  });

  await db.productSerial.createMany({
    data: [
      {
        shopId: shop.id,
        productId: refurbIp13.id,
        serial: "IP13RF2210A",
        status: "IN_STOCK",
        receivedAt: daysAgo(20, 11),
      },
      {
        shopId: shop.id,
        productId: refurbIp13.id,
        serial: "IP13RF2211B",
        status: "IN_STOCK",
        receivedAt: daysAgo(20, 11),
      },
      {
        shopId: shop.id,
        productId: refurbIp13.id,
        serial: "IP13RF2212C",
        status: "IN_STOCK",
        receivedAt: daysAgo(20, 11),
        notes: "Faint scuff on the lower bezel — priced as-is if asked.",
      },
      {
        shopId: shop.id,
        productId: refurbIp13.id,
        serial: "IP13RF8842K",
        status: "SOLD",
        invoiceLineId: soldIp13Line?.id ?? null,
        receivedAt: daysAgo(20, 11),
        soldAt: daysAgo(16, 14),
      },
      {
        shopId: shop.id,
        productId: refurbIp13.id,
        serial: "IP13RF2209Z",
        status: "DEFECTIVE",
        receivedAt: daysAgo(20, 11),
        notes: "Face ID fails after reassembly. Raised with the supplier.",
      },
      {
        shopId: shop.id,
        productId: refurbMba.id,
        serial: "MBAM1A4410",
        status: "IN_STOCK",
        receivedAt: daysAgo(26, 10),
      },
      {
        shopId: shop.id,
        productId: refurbMba.id,
        serial: "MBAM1A4411",
        status: "IN_STOCK",
        receivedAt: daysAgo(26, 10),
      },
      {
        shopId: shop.id,
        productId: refurbMba.id,
        serial: "MBAM1C7731",
        status: "SOLD",
        invoiceLineId: soldMbaLine?.id ?? null,
        receivedAt: daysAgo(26, 10),
        soldAt: daysAgo(22, 11),
      },
    ],
  });

  // ------------------------------------------------------- purchase orders ---
  // Numbers come off the same per-shop sequence the app uses (lib/sequence.ts,
  // START_AT 1000), so the next PO raised in the UI is #1003.
  const receivedPo = await db.purchaseOrder.create({
    data: {
      shopId: shop.id,
      vendorId: partsDepot.id,
      number: 1000,
      status: "RECEIVED",
      shippingCents: 1850,
      notes: "Monthly display and battery restock.",
      createdById: owner.id,
      createdAt: daysAgo(24, 9),
      orderedAt: daysAgo(24, 10),
      expectedAt: daysAgo(19, 12),
      receivedAt: daysAgo(18, 11),
      lines: {
        create: [
          {
            productId: screenIp14.id,
            description: "iPhone 14 Screen Assembly",
            quantity: 10,
            receivedQty: 10,
            unitCostCents: 12400,
            sortOrder: 0,
          },
          {
            productId: batIp12.id,
            description: "iPhone 12 Battery",
            quantity: 20,
            receivedQty: 20,
            unitCostCents: 3200,
            sortOrder: 1,
          },
          {
            productId: portS22.id,
            description: "Samsung S22 Charge Port Flex",
            quantity: 15,
            receivedQty: 15,
            unitCostCents: 2400,
            sortOrder: 2,
          },
        ],
      },
    },
  });

  const orderedPo = await db.purchaseOrder.create({
    data: {
      shopId: shop.id,
      vendorId: meridian.id,
      number: 1001,
      status: "ORDERED",
      shippingCents: 2400,
      notes: "Top case is for ticket #1002 — chase if it slips past Friday.",
      createdById: owner.id,
      createdAt: daysAgo(4, 9),
      orderedAt: daysAgo(4, 10),
      expectedAt: daysAhead(4, 12),
      lines: {
        create: [
          {
            productId: kbMbp.id,
            description: 'MacBook Pro 13" Keyboard Assembly',
            quantity: 2,
            unitCostCents: 19500,
            sortOrder: 0,
          },
          {
            productId: ssd1tb.id,
            description: "1TB NVMe SSD",
            quantity: 5,
            unitCostCents: 7100,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  await db.purchaseOrder.create({
    data: {
      shopId: shop.id,
      vendorId: lonestar.id,
      number: 1002,
      status: "DRAFT",
      notes: "Building the next flex order — add anything that comes in this week.",
      createdById: tech.id,
      createdAt: daysAgo(1, 16),
      lines: {
        create: [
          {
            productId: portS22.id,
            description: "Samsung S22 Charge Port Flex",
            quantity: 15,
            unitCostCents: 2400,
            sortOrder: 0,
          },
          {
            description: "Galaxy Tab A8 digitizer (aftermarket)",
            quantity: 2,
            unitCostCents: 5900,
            sortOrder: 1,
          },
        ],
      },
    },
  });

  // ------------------------------------------------------ stock adjustments ---
  // Every deliberate movement, plus one balancing "Opening count" per product
  // so the ledger sums to exactly the `stockQty` each product carries.
  type StockMove = {
    productId: string;
    delta: number;
    reason: string;
    userId: string | null;
    createdAt: Date;
  };

  const stockMoves: StockMove[] = [
    { productId: screenIp14.id, delta: 10, reason: "PO #1000 received", userId: owner.id, createdAt: daysAgo(18, 11) },
    { productId: batIp12.id, delta: 20, reason: "PO #1000 received", userId: owner.id, createdAt: daysAgo(18, 11) },
    { productId: portS22.id, delta: 15, reason: "PO #1000 received", userId: owner.id, createdAt: daysAgo(18, 11) },
    { productId: screenIp14.id, delta: -1, reason: "Sold on invoice #1001", userId: frontDesk.id, createdAt: daysAgo(7, 15) },
    { productId: screenIp14.id, delta: -1, reason: "Sold on invoice #1009", userId: frontDesk.id, createdAt: daysAgo(1, 16) },
    { productId: batIp12.id, delta: -1, reason: "Sold on invoice #1002", userId: frontDesk.id, createdAt: daysAgo(19, 15) },
    { productId: glass.id, delta: -1, reason: "Sold on invoice #1004", userId: frontDesk.id, createdAt: daysAgo(7, 16) },
    { productId: glass.id, delta: -1, reason: "Sold on invoice #1011", userId: frontDesk.id, createdAt: daysAgo(11, 12) },
    { productId: glass.id, delta: -6, reason: "Sold on invoice #1015", userId: owner.id, createdAt: daysAgo(34, 6) },
    { productId: glass.id, delta: 1, reason: "Returned on invoice #1011", userId: frontDesk.id, createdAt: daysAgo(9, 15) },
    { productId: cable.id, delta: -1, reason: "Sold on invoice #1011", userId: frontDesk.id, createdAt: daysAgo(11, 12) },
    { productId: caseIp14.id, delta: -1, reason: "Sold on invoice #1012", userId: frontDesk.id, createdAt: daysAgo(13, 15) },
    { productId: caseIp14.id, delta: 1, reason: "Returned on invoice #1012", userId: frontDesk.id, createdAt: daysAgo(12, 11) },
    { productId: kbMbp.id, delta: -1, reason: "Damaged in handling — written off", userId: tech.id, createdAt: daysAgo(15, 14) },
    { productId: refurbIp13.id, delta: 5, reason: "Refurb intake — 5 units serialised", userId: owner.id, createdAt: daysAgo(20, 11) },
    { productId: refurbIp13.id, delta: -1, reason: "Sold on invoice #1007", userId: frontDesk.id, createdAt: daysAgo(16, 14) },
    { productId: refurbIp13.id, delta: -1, reason: "IP13RF2209Z marked defective", userId: tech.id, createdAt: daysAgo(14, 10) },
    { productId: refurbMba.id, delta: 3, reason: "Refurb intake — 3 units serialised", userId: owner.id, createdAt: daysAgo(26, 10) },
    { productId: refurbMba.id, delta: -1, reason: "Sold on invoice #1008", userId: owner.id, createdAt: daysAgo(22, 11) },
  ];

  for (const product of products) {
    const moved = stockMoves
      .filter((move) => move.productId === product.id)
      .reduce((sum, move) => sum + move.delta, 0);
    const opening = product.stockQty - moved;
    if (opening === 0) continue;
    stockMoves.push({
      productId: product.id,
      delta: opening,
      reason: "Opening count",
      userId: owner.id,
      createdAt: daysAgo(60, 9),
    });
  }

  await db.stockAdjustment.createMany({
    data: stockMoves.map((move) => ({ shopId: shop.id, ...move })),
  });

  // ----------------------------------------------------------- part orders ---
  await db.partOrder.createMany({
    data: [
      {
        shopId: shop.id,
        ticketId: ticketByNumber(1002).id,
        productId: kbMbp.id,
        vendorId: meridian.id,
        purchaseOrderId: orderedPo.id,
        description: 'MacBook Pro 13" Keyboard Assembly',
        supplier: "Meridian Component Group",
        quantity: 1,
        costCents: 19500,
        status: "ORDERED",
        orderedAt: daysAgo(4, 10),
        expectedAt: daysAhead(4, 12),
        notes: "On PO #1001 with the drive restock.",
        createdAt: daysAgo(5, 12),
      },
      {
        shopId: shop.id,
        ticketId: ticketByNumber(1003).id,
        productId: portS22.id,
        vendorId: partsDepot.id,
        purchaseOrderId: receivedPo.id,
        description: "Samsung S22 Charge Port Flex",
        supplier: "Southwest Parts Depot",
        quantity: 1,
        costCents: 2400,
        status: "RECEIVED",
        orderedAt: daysAgo(24, 10),
        expectedAt: daysAgo(19, 12),
        receivedAt: daysAgo(18, 11),
        createdAt: daysAgo(24, 10),
      },
      {
        shopId: shop.id,
        ticketId: ticketByNumber(1014).id,
        vendorId: lonestar.id,
        description: "Galaxy Tab A8 digitizer (aftermarket)",
        supplier: "Lone Star Cell Supply",
        quantity: 1,
        costCents: 5900,
        status: "NEEDED",
        notes: "Goes on the next Lone Star order — see draft PO #1002.",
        createdAt: daysAgo(3, 12),
      },
      {
        shopId: shop.id,
        ticketId: ticketByNumber(1007).id,
        vendorId: lonestar.id,
        description: "PS5 HDMI port (19-pin, HDM-Q7)",
        supplier: "Lone Star Cell Supply",
        quantity: 1,
        costCents: 1200,
        status: "NEEDED",
        notes: "Hold until the estimate is approved.",
        createdAt: daysAgo(0, 12),
      },
      {
        shopId: shop.id,
        ticketId: ticketByNumber(1011).id,
        vendorId: meridian.id,
        description: "HP Envy x360 battery (PC03XL)",
        supplier: "Meridian Component Group",
        quantity: 1,
        costCents: 4200,
        status: "ORDERED",
        orderedAt: daysAgo(1, 17),
        expectedAt: daysAhead(3, 12),
        createdAt: daysAgo(1, 17),
      },
    ],
  });

  // -------------------------------------------------------------- deposits ---
  // A deposit is store credit with a paper trail (lib/deposits.ts): the money
  // only ever lives in the customer's credit balance, the Deposit row records
  // where it came from, and `Ticket.depositCents` is the per-ticket cache.
  const depositSpecs = [
    {
      ticketNumber: 1014,
      customerId: tomas.id,
      amountCents: 7500,
      method: "CARD" as const,
      reference: "VISA ••8814",
      createdAt: daysAgo(3, 11),
      appliedInvoiceNumber: null as number | null,
    },
    {
      ticketNumber: 1005,
      customerId: amara.id,
      amountCents: 10000,
      method: "CASH" as const,
      reference: null,
      createdAt: daysAgo(2, 13),
      appliedInvoiceNumber: null as number | null,
    },
    {
      ticketNumber: 1016,
      customerId: amara.id,
      amountCents: 12000,
      method: "CARD" as const,
      reference: "VISA ••2204",
      createdAt: daysAgo(7, 10),
      appliedInvoiceNumber: 1010 as number | null,
    },
  ];

  for (const spec of depositSpecs) {
    const ticket = ticketByNumber(spec.ticketNumber);
    await db.deposit.create({
      data: {
        shopId: shop.id,
        ticketId: ticket.id,
        customerId: spec.customerId,
        amountCents: spec.amountCents,
        method: spec.method,
        reference: spec.reference,
        takenById: frontDesk.id,
        appliedInvoiceId:
          spec.appliedInvoiceNumber === null
            ? null
            : invoiceByNumber(spec.appliedInvoiceNumber).id,
        createdAt: spec.createdAt,
      },
    });
    // The cache the ticket card reads. It is NOT decremented when a deposit is
    // applied — only when one is refunded — which is why #1016 still shows it.
    await db.ticket.update({
      where: { id: ticket.id },
      data: { depositCents: { increment: spec.amountCents } },
    });
  }

  // ------------------------------------------------------ credit adjustments ---
  // The ledger is the truth and `Customer.creditBalanceCents` is the cache, so
  // the balances are recomputed from these rows rather than written by hand.
  const creditLedger = [
    { customerId: ray.id, deltaCents: 5000, reason: "Goodwill credit — part delay on ticket #1002", userId: owner.id, createdAt: daysAgo(12, 15) },
    { customerId: owen.id, deltaCents: 1250, reason: "Goodwill credit — accessory returned without a receipt", userId: owner.id, createdAt: daysAgo(24, 11) },
    { customerId: tomas.id, deltaCents: 7500, reason: "Deposit on ticket #1014", userId: frontDesk.id, createdAt: daysAgo(3, 11) },
    { customerId: amara.id, deltaCents: 12000, reason: "Deposit on ticket #1016", userId: frontDesk.id, createdAt: daysAgo(7, 10) },
    { customerId: amara.id, deltaCents: -12000, reason: "Applied to invoice #1010", userId: frontDesk.id, createdAt: daysAgo(5, 16) },
    { customerId: amara.id, deltaCents: 10000, reason: "Deposit on ticket #1005", userId: frontDesk.id, createdAt: daysAgo(2, 13) },
    { customerId: amara.id, deltaCents: 2500, reason: "Goodwill credit — recovery ran past the quoted window", userId: owner.id, createdAt: daysAgo(1, 10) },
    { customerId: elena.id, deltaCents: 3788, reason: "Refund issued as store credit", userId: frontDesk.id, createdAt: daysAgo(12, 11) },
  ];

  await db.creditAdjustment.createMany({
    data: creditLedger.map((row) => ({ shopId: shop.id, ...row })),
  });

  for (const customer of customers) {
    const balance = creditLedger
      .filter((row) => row.customerId === customer.id)
      .reduce((sum, row) => sum + row.deltaCents, 0);
    if (balance === customer.creditBalanceCents) continue;
    await db.customer.update({
      where: { id: customer.id },
      data: { creditBalanceCents: balance },
    });
  }

  // --------------------------------------------------------------- refunds ---
  // A Payment is never edited to represent money going back out; the refund is
  // its own append-only row and the invoice status walks backwards to match
  // (components/billing/refund-math.ts statusForNetPaid).
  const accessoryPayment = await db.payment.findFirst({
    where: { invoiceId: invoiceByNumber(1011).id },
    select: { id: true },
  });
  await db.refund.create({
    data: {
      shopId: shop.id,
      invoiceId: invoiceByNumber(1011).id,
      paymentId: accessoryPayment?.id ?? null,
      amountCents: 2705, // the protector and its share of the tax
      method: "CARD",
      reason: "Screen protector returned unopened",
      refundedById: frontDesk.id,
      status: "completed",
      stripeRefundId: "re_demo_1011_protector",
      createdAt: daysAgo(9, 15),
    },
  });

  const casePayment = await db.payment.findFirst({
    where: { invoiceId: invoiceByNumber(1012).id },
    select: { id: true },
  });
  await db.refund.create({
    data: {
      shopId: shop.id,
      invoiceId: invoiceByNumber(1012).id,
      paymentId: casePayment?.id ?? null,
      amountCents: 3788,
      method: "CREDIT",
      reason: "Case returned — refunded to store credit",
      refundedById: frontDesk.id,
      status: "completed",
      createdAt: daysAgo(12, 11),
    },
  });

  // ----------------------------------------------------------------- leads ---
  await db.lead.createMany({
    data: [
      {
        shopId: shop.id,
        name: "Marcus Hale",
        email: "m.hale@example.com",
        phone: "(512) 555-0191",
        source: "website",
        message:
          "Pixel 7 screen is cracked across the top. How much and how long, and do you do same-day?",
        status: "NEW",
        createdAt: hoursAgo(4),
      },
      {
        shopId: shop.id,
        name: "Jenna Whitfield",
        phone: "(512) 555-0203",
        source: "phone",
        message:
          "Called about a Surface Laptop that won't charge. Asked us to call back after 4pm.",
        status: "NEW",
        createdAt: daysAgo(1, 11),
      },
      {
        shopId: shop.id,
        name: "Ibrahim Diallo",
        email: "ibrahim.d@example.com",
        phone: "(512) 555-0214",
        source: "walk-in",
        message:
          "Came in with a Nintendo Switch that won't dock. Quoted a bench fee; he is thinking about it.",
        status: "CONTACTED",
        createdAt: daysAgo(3, 15),
      },
      {
        shopId: shop.id,
        name: "Ana Beltran",
        email: "ana.beltran@example.com",
        source: "referral",
        message:
          "Referred by Rivera Landscaping. Six field tablets, wants a service plan quote.",
        status: "CONTACTED",
        createdAt: daysAgo(5, 13),
      },
      {
        shopId: shop.id,
        name: "Sofia Kaur",
        email: "sofia.kaur@example.com",
        phone: "(512) 555-0134",
        source: "website",
        message: "HP Envy won't boot. Filled in the check-in form.",
        status: "CONVERTED",
        customerId: sofia.id,
        ticketId: ticketByNumber(1011).id,
        createdAt: daysAgo(1, 14),
      },
      {
        shopId: shop.id,
        name: "Grant Mullins",
        email: "gmullins@example.com",
        source: "email",
        message:
          "Wanted a same-day quote on a Surface Pro 8 screen. Went elsewhere before we replied.",
        status: "CLOSED",
        createdAt: daysAgo(9, 10),
      },
    ],
  });

  // ---------------------------------------------------------- appointments ---
  /** startsAt / endsAt for a slot `dayOffset` days from today (negative = past). */
  const slot = (dayOffset: number, hour: number, minutes: number) => {
    const startsAt = daysAhead(dayOffset, hour);
    return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
  };

  await db.appointment.createMany({
    data: [
      {
        shopId: shop.id,
        customerId: tomas.id,
        assignedToId: tech.id,
        locationId: kiosk.id,
        title: "On-site — Rivera fleet tablet swap",
        notes: "Six tablets, screen protectors and a firmware pass.",
        status: "DONE",
        reminderSentAt: daysAgo(5, 11),
        ...slot(-4, 11, 90),
      },
      {
        shopId: shop.id,
        customerId: daniel.id,
        ticketId: ticketByNumber(1015).id,
        assignedToId: tech.id,
        locationId: mainLocation.id,
        title: "Drop-off — Latitude 5420 thermal service",
        status: "DONE",
        reminderSentAt: daysAgo(3, 9),
        ...slot(-2, 10, 30),
      },
      {
        shopId: shop.id,
        customerId: priscilla.id,
        ticketId: ticketByNumber(1012).id,
        assignedToId: frontDesk.id,
        locationId: mainLocation.id,
        title: "Pickup — iPhone 13",
        status: "DONE",
        reminderSentAt: daysAgo(2, 15),
        ...slot(-1, 15, 15),
      },
      {
        shopId: shop.id,
        customerId: elena.id,
        ticketId: ticketByNumber(1001).id,
        assignedToId: frontDesk.id,
        locationId: mainLocation.id,
        title: "Pickup — iPhone 14 Pro",
        notes: "Balance is settled; just needs signing for.",
        status: "SCHEDULED",
        reminderSentAt: hoursAgo(7),
        ...slot(0, 17, 15),
      },
      {
        shopId: shop.id,
        customerId: ray.id,
        assignedToId: owner.id,
        locationId: mainLocation.id,
        title: "On-site — Okonkwo Dental quarterly check",
        notes: "Twelve seats, printer queue and the backup appliance.",
        status: "SCHEDULED",
        ...slot(1, 9, 120),
      },
      {
        shopId: shop.id,
        customerId: priscilla.id,
        ticketId: ticketByNumber(1007).id,
        assignedToId: tech.id,
        locationId: mainLocation.id,
        title: "Drop-off — PS5 board repair",
        status: "SCHEDULED",
        ...slot(1, 14, 20),
      },
      {
        shopId: shop.id,
        customerId: daniel.id,
        ticketId: ticketByNumber(1004).id,
        assignedToId: owner.id,
        locationId: mainLocation.id,
        title: "Callback — desktop power supply decision",
        notes: "Call only — customer has asked us not to email.",
        status: "SCHEDULED",
        ...slot(2, 11, 15),
      },
      {
        shopId: shop.id,
        customerId: tomas.id,
        ticketId: ticketByNumber(1014).id,
        assignedToId: frontDesk.id,
        locationId: kiosk.id,
        title: "Pickup — Galaxy Tab A8",
        notes: "Moved by the customer — the panel is still in transit.",
        status: "CANCELED",
        ...slot(2, 13, 15),
      },
      {
        shopId: shop.id,
        customerId: amara.id,
        ticketId: ticketByNumber(1005).id,
        assignedToId: tech.id,
        locationId: mainLocation.id,
        title: "Data handover — XPS recovery drive",
        notes: "Bring the delivery drive and the checksum sheet.",
        status: "SCHEDULED",
        ...slot(4, 10, 30),
      },
      {
        shopId: shop.id,
        assignedToId: frontDesk.id,
        locationId: kiosk.id,
        title: "Kiosk cover — Saturday",
        status: "SCHEDULED",
        ...slot(6, 9, 480),
      },
      {
        shopId: shop.id,
        customerId: sofia.id,
        ticketId: ticketByNumber(1011).id,
        assignedToId: tech.id,
        locationId: mainLocation.id,
        title: "Return visit — HP Envy battery fitting",
        status: "SCHEDULED",
        ...slot(8, 15, 20),
      },
    ],
  });

  // ------------------------------------------------------------- marketing ---
  const checkInCampaign = await db.campaign.create({
    data: {
      shopId: shop.id,
      name: "Two-week check-in",
      trigger: "TICKET_RESOLVED",
      delayDays: 14,
      channel: "EMAIL",
      subject: "How's it holding up?",
      body:
        "Hi {{firstName}}, it's been a couple of weeks since we finished ticket #{{ticketNumber}} at {{shopName}}. " +
        "If anything about the repair isn't right, reply to this email and we'll take another look.",
      active: true,
      createdAt: daysAgo(52, 10),
    },
  });

  const thanksCampaign = await db.campaign.create({
    data: {
      shopId: shop.id,
      name: "Thanks for your business",
      trigger: "INVOICE_PAID",
      delayDays: 3,
      channel: "SMS",
      body:
        "Thanks {{firstName}} — invoice #{{invoiceNumber}} is settled. Keep this text for your records, and shout if anything changes.",
      active: true,
      createdAt: daysAgo(46, 10),
    },
  });

  await db.campaign.create({
    data: {
      shopId: shop.id,
      name: "Welcome to the shop",
      trigger: "CUSTOMER_CREATED",
      delayDays: 1,
      channel: "EMAIL",
      subject: "Welcome to {{shopName}}",
      body:
        "Hi {{firstName}}, thanks for trusting us with your device. Here's how to reach us, and what to expect while it's on the bench.",
      active: false,
      createdAt: daysAgo(9, 16),
    },
  });

  await db.campaignSend.createMany({
    data: [
      {
        shopId: shop.id,
        campaignId: checkInCampaign.id,
        customerId: tomas.id,
        ticketId: ticketByNumber(1006).id,
        scheduledAt: daysAgo(5, 9),
        sentAt: daysAgo(5, 9),
        status: "sent",
        createdAt: daysAgo(19, 9),
      },
      {
        shopId: shop.id,
        campaignId: checkInCampaign.id,
        customerId: elena.id,
        ticketId: ticketByNumber(1010).id,
        scheduledAt: daysAhead(7, 9),
        status: "scheduled",
        createdAt: daysAgo(7, 16),
      },
      {
        shopId: shop.id,
        campaignId: checkInCampaign.id,
        customerId: amara.id,
        ticketId: ticketByNumber(1016).id,
        scheduledAt: daysAhead(9, 9),
        status: "scheduled",
        createdAt: daysAgo(5, 16),
      },
      {
        shopId: shop.id,
        campaignId: checkInCampaign.id,
        customerId: priscilla.id,
        ticketId: ticketByNumber(1012).id,
        scheduledAt: daysAhead(13, 9),
        status: "scheduled",
        createdAt: daysAgo(1, 15),
      },
      {
        shopId: shop.id,
        campaignId: thanksCampaign.id,
        customerId: elena.id,
        invoiceId: invoiceByNumber(1001).id,
        scheduledAt: daysAgo(4, 10),
        sentAt: daysAgo(4, 10),
        status: "sent",
        createdAt: daysAgo(7, 16),
      },
      {
        shopId: shop.id,
        campaignId: thanksCampaign.id,
        customerId: owen.id,
        invoiceId: invoiceByNumber(1007).id,
        scheduledAt: daysAgo(13, 10),
        sentAt: daysAgo(13, 10),
        status: "sent",
        createdAt: daysAgo(16, 14),
      },
      {
        shopId: shop.id,
        campaignId: thanksCampaign.id,
        customerId: priscilla.id,
        invoiceId: invoiceByNumber(1009).id,
        scheduledAt: daysAhead(2, 10),
        status: "scheduled",
        createdAt: daysAgo(1, 16),
      },
      {
        shopId: shop.id,
        campaignId: thanksCampaign.id,
        customerId: daniel.id,
        invoiceId: invoiceByNumber(1008).id,
        scheduledAt: daysAgo(19, 10),
        status: "skipped: too old",
        createdAt: daysAgo(19, 10),
      },
    ],
  });

  // ----------------------------------------------------------- attachments ---
  // Real bytes on disk, under the path lib/storage's local driver builds:
  // /uploads/<shopId>/<32 hex>.<ext>. Anything else and /files/[id] refuses it.
  const PLACEHOLDER_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR42u3NMQEAAAgDoC251a3g" +
      "LwSgOTlVAAAAAAAAAAAAAAAAAOBnAWvRAAGx0eEoAAAAAElFTkSuQmCC",
    "base64",
  );

  const attachmentSpecs = [
    {
      key: "7c1e4a9026b34d58ae10f6c3b7d29e45",
      fileName: "intake-front.png",
      ticketId: ticketByNumber(1001).id,
      customerId: null as string | null,
      uploadedById: frontDesk.id,
      createdAt: daysAgo(9, 11),
    },
    {
      key: "b52f80d1c4a34e6790bd2f18c6e37a09",
      fileName: "ddrescue-progress.png",
      ticketId: ticketByNumber(1005).id,
      customerId: null as string | null,
      uploadedById: tech.id,
      createdAt: daysAgo(2, 13),
    },
    {
      key: "3ad9f61e78c04b2295e0da4c81f7b63d",
      fileName: "exemption-certificate.png",
      ticketId: null as string | null,
      customerId: ray.id,
      uploadedById: owner.id,
      createdAt: daysAgo(20, 10),
    },
  ];

  await mkdir(path.join(uploadsRoot, shop.id), { recursive: true });
  for (const spec of attachmentSpecs) {
    await writeFile(
      path.join(uploadsRoot, shop.id, `${spec.key}.png`),
      PLACEHOLDER_PNG,
    );
  }

  await db.attachment.createMany({
    data: attachmentSpecs.map((spec) => ({
      shopId: shop.id,
      ticketId: spec.ticketId,
      customerId: spec.customerId,
      uploadedById: spec.uploadedById,
      fileName: spec.fileName,
      mimeType: "image/png",
      sizeBytes: PLACEHOLDER_PNG.byteLength,
      path: `/uploads/${shop.id}/${spec.key}.png`,
      storage: "local",
      createdAt: spec.createdAt,
    })),
  });

  // -------------------------------------------------------------- api keys ---
  // Only the sha256 is stored (lib/api-key.ts); the plaintext below exists in
  // this file purely so a demo can actually call the API.
  const demoApiKey = "rfk_9f4c1d7ab3e05628cd91af4370be25d18c4a6f02";
  const retiredApiKey = "rfk_2b77e01d84cf396a5de8107bc24af3095e6d18b7";
  const hashKey = (key: string) =>
    createHash("sha256").update(key, "utf8").digest("hex");

  await db.apiKey.createMany({
    data: [
      {
        shopId: shop.id,
        name: "Website intake form",
        keyHash: hashKey(demoApiKey),
        prefix: demoApiKey.slice(4, 12),
        active: true,
        lastUsedAt: hoursAgo(3),
        createdAt: daysAgo(38, 10),
      },
      {
        shopId: shop.id,
        name: "Zapier (retired)",
        keyHash: hashKey(retiredApiKey),
        prefix: retiredApiKey.slice(4, 12),
        active: false,
        lastUsedAt: daysAgo(41, 14),
        createdAt: daysAgo(70, 9),
      },
    ],
  });

  // -------------------------------------------------------------- webhooks ---
  const webhook = await db.webhook.create({
    data: {
      shopId: shop.id,
      url: "https://hooks.demorepair.shop/repairpilot",
      secret: "whsec_demo_4f1c8ab26d3e5079b1ca47e2d0f83b96",
      events: ["ticket.created", "invoice.paid", "estimate.approved"],
      active: true,
      createdAt: daysAgo(33, 11),
    },
  });

  await db.webhookDelivery.createMany({
    data: [
      {
        shopId: shop.id,
        webhookId: webhook.id,
        event: "invoice.paid",
        payload: {
          id: "evt_demo_paid_1009",
          event: "invoice.paid",
          data: { invoiceNumber: 1009, totalCents: 26959 },
        },
        status: "delivered",
        attempts: 1,
        responseCode: 200,
        lastAttemptAt: daysAgo(1, 16),
        nextAttemptAt: daysAgo(1, 16),
        createdAt: daysAgo(1, 16),
      },
      {
        shopId: shop.id,
        webhookId: webhook.id,
        event: "ticket.created",
        payload: {
          id: "evt_demo_ticket_1011",
          event: "ticket.created",
          data: { ticketNumber: 1011, source: "checkin" },
        },
        status: "delivered",
        attempts: 1,
        responseCode: 202,
        lastAttemptAt: daysAgo(1, 14),
        nextAttemptAt: daysAgo(1, 14),
        createdAt: daysAgo(1, 14),
      },
      {
        shopId: shop.id,
        webhookId: webhook.id,
        event: "ticket.created",
        payload: {
          id: "evt_demo_ticket_1013",
          event: "ticket.created",
          data: { ticketNumber: 1013, isWarranty: true },
        },
        status: "delivered",
        attempts: 1,
        responseCode: 200,
        lastAttemptAt: daysAgo(1, 11),
        nextAttemptAt: daysAgo(1, 11),
        createdAt: daysAgo(1, 11),
      },
      {
        shopId: shop.id,
        webhookId: webhook.id,
        event: "estimate.approved",
        payload: {
          id: "evt_demo_estimate_1003",
          event: "estimate.approved",
          data: { estimateNumber: 1003, customer: "Okonkwo Dental Group" },
        },
        status: "delivered",
        attempts: 1,
        responseCode: 200,
        lastAttemptAt: daysAgo(6, 11),
        nextAttemptAt: daysAgo(6, 11),
        createdAt: daysAgo(6, 11),
      },
    ],
  });

  // ------------------------------------------------------------- audit log ---
  await db.auditLog.createMany({
    data: [
      { shopId: shop.id, userId: owner.id, action: "settings.updated", entity: "settings", entityId: shop.id, summary: "Shop details and billing defaults saved", meta: { section: "shop", taxRateBps: TAX_BPS }, ip: "198.51.100.24", createdAt: daysAgo(58, 15) },
      { shopId: shop.id, userId: owner.id, action: "user.invited", entity: "user", entityId: tech.id, summary: "Invited Marcus Webb as Technician", meta: { role: "TECH" }, ip: "198.51.100.24", createdAt: daysAgo(57, 10) },
      { shopId: shop.id, userId: owner.id, action: "user.invited", entity: "user", entityId: frontDesk.id, summary: "Invited Priya Shah as Front desk", meta: { role: "FRONT_DESK" }, ip: "198.51.100.24", createdAt: daysAgo(57, 11) },
      { shopId: shop.id, userId: owner.id, action: "api_key.created", entity: "api_key", entityId: shop.id, summary: "Created API key “Website intake form”", ip: "198.51.100.24", createdAt: daysAgo(38, 10) },
      { shopId: shop.id, userId: owner.id, action: "api_key.revoked", entity: "api_key", entityId: shop.id, summary: "Revoked API key “Zapier (retired)”", ip: "198.51.100.24", createdAt: daysAgo(41, 15) },
      { shopId: shop.id, userId: owner.id, action: "user.role_changed", entity: "user", entityId: frontDesk.id, summary: "Priya Shah changed from Technician to Front desk", meta: { from: "TECH", to: "FRONT_DESK" }, ip: "198.51.100.24", createdAt: daysAgo(29, 9) },
      { shopId: shop.id, userId: owner.id, action: "invoice.voided", entity: "invoice", entityId: invoiceByNumber(1006).id, summary: "Voided invoice #1006 — raised against the wrong customer", ip: "198.51.100.24", createdAt: daysAgo(28, 12) },
      { shopId: shop.id, userId: owner.id, action: "settings.updated", entity: "settings", entityId: shop.id, summary: "Workflow statuses and problem types saved", meta: { section: "workflow" }, ip: "198.51.100.24", createdAt: daysAgo(24, 16) },
      { shopId: shop.id, userId: owner.id, action: "user.2fa_enabled", entity: "user", entityId: owner.id, summary: "Turned on two-step verification", ip: "198.51.100.24", createdAt: daysAgo(21, 8) },
      { shopId: shop.id, userId: frontDesk.id, action: "user.login", entity: "user", entityId: frontDesk.id, summary: "Signed in", ip: "203.0.113.51", createdAt: daysAgo(14, 9) },
      { shopId: shop.id, userId: owner.id, action: "settings.updated", entity: "settings", entityId: shop.id, summary: "Check-in form and review requests saved", meta: { section: "checkin" }, ip: "198.51.100.24", createdAt: daysAgo(13, 11) },
      { shopId: shop.id, userId: frontDesk.id, action: "invoice.refunded", entity: "invoice", entityId: invoiceByNumber(1012).id, summary: "Refunded $37.88 on invoice #1012 to store credit", meta: { amountCents: 3788, method: "CREDIT" }, ip: "203.0.113.51", createdAt: daysAgo(12, 11) },
      { shopId: shop.id, userId: owner.id, action: "settings.updated", entity: "settings", entityId: shop.id, summary: "Response targets saved", meta: { section: "sla" }, ip: "198.51.100.24", createdAt: daysAgo(11, 14) },
      { shopId: shop.id, userId: frontDesk.id, action: "invoice.refunded", entity: "invoice", entityId: invoiceByNumber(1011).id, summary: "Refunded $27.05 on invoice #1011 to the card", meta: { amountCents: 2705, method: "CARD" }, ip: "203.0.113.51", createdAt: daysAgo(9, 15) },
      { shopId: shop.id, userId: tech.id, action: "user.password_changed", entity: "user", entityId: tech.id, summary: "Password changed", ip: "203.0.113.77", createdAt: daysAgo(8, 8) },
      { shopId: shop.id, userId: owner.id, action: "customer.deleted", entity: "customer", entityId: null, summary: "Deleted duplicate customer “R. Okonkwo”", ip: "198.51.100.24", createdAt: daysAgo(7, 13) },
      { shopId: shop.id, userId: owner.id, action: "user.login", entity: "user", entityId: owner.id, summary: "Signed in", ip: "198.51.100.24", createdAt: daysAgo(5, 8) },
      { shopId: shop.id, userId: owner.id, action: "settings.updated", entity: "settings", entityId: shop.id, summary: "Tax rates saved", meta: { section: "tax", rates: 3 }, ip: "198.51.100.24", createdAt: daysAgo(4, 10) },
      { shopId: shop.id, userId: tech.id, action: "ticket.deleted", entity: "ticket", entityId: null, summary: "Deleted ticket #10 — opened against the wrong device", ip: "203.0.113.77", createdAt: daysAgo(3, 16) },
      { shopId: shop.id, userId: frontDesk.id, action: "user.login", entity: "user", entityId: frontDesk.id, summary: "Signed in", ip: "203.0.113.51", createdAt: daysAgo(1, 9) },
      { shopId: shop.id, userId: null, action: "user.login_locked", entity: "user", entityId: null, summary: "Sign-in locked after five failed attempts for tech@repairpilot.app", ip: "192.0.2.144", createdAt: daysAgo(1, 22) },
      { shopId: shop.id, userId: tech.id, action: "user.login", entity: "user", entityId: tech.id, summary: "Signed in", ip: "203.0.113.77", createdAt: hoursAgo(5) },
      { shopId: shop.id, userId: owner.id, action: "user.login", entity: "user", entityId: owner.id, summary: "Signed in", ip: "198.51.100.24", createdAt: hoursAgo(2) },
    ],
  });

  // ------------------------------------------------------------ time clock ---
  // Six days of shifts plus one entry still running — the tech clocked in this
  // morning and has not clocked out.
  const clockShifts: Prisma.TimeClockEntryCreateManyInput[] = [];
  for (let day = 6; day >= 1; day--) {
    // The shop is shut on Sundays; whichever weekday that lands on, skip it.
    if (daysAgo(day).getDay() === 0) continue;
    clockShifts.push(
      {
        shopId: shop.id,
        userId: tech.id,
        clockInAt: daysAgo(day, 9),
        clockOutAt: daysAgo(day, 17),
        note: day === 3 ? "Stayed late on the recovery job" : null,
      },
      {
        shopId: shop.id,
        userId: frontDesk.id,
        clockInAt: daysAgo(day, 8),
        clockOutAt: daysAgo(day, 16),
      },
    );
    if (day % 2 === 0) {
      clockShifts.push({
        shopId: shop.id,
        userId: owner.id,
        clockInAt: daysAgo(day, 10),
        clockOutAt: daysAgo(day, 18),
      });
    }
  }
  clockShifts.push(
    {
      shopId: shop.id,
      userId: frontDesk.id,
      clockInAt: daysAgo(0, 8),
      clockOutAt: daysAgo(0, 12),
      note: "Half day",
    },
    // Still on the clock.
    { shopId: shop.id, userId: tech.id, clockInAt: hoursAgo(5) },
  );
  await db.timeClockEntry.createMany({ data: clockShifts });

  // ----------------------------------------------------------- cash drawer ---
  // Yesterday's shift, counted and closed $1.34 short. Nothing is open, so the
  // till offers "Open drawer" rather than a session to continue.
  await db.cashDrawerSession.create({
    data: {
      shopId: shop.id,
      locationId: mainLocation.id,
      openedById: frontDesk.id,
      openedAt: daysAgo(1, 8),
      openingCents: 20000,
      closedById: owner.id,
      closedAt: daysAgo(1, 18),
      expectedCents: 34134,
      countedCents: 34000,
      note: "$1.34 short — likely a miscount on the afternoon cash sale.",
    },
  });

  // ------------------------------------------------------ communication log ---
  await db.communicationLog.createMany({
    data: [
      {
        shopId: shop.id,
        customerId: elena.id,
        ticketId: ticketByNumber(1001).id,
        type: "SMS",
        direction: "OUT",
        to: "(512) 555-0111",
        body: "Your iPhone is repaired and ready for pickup. We're open until 6pm today!",
        status: "delivered",
        createdAt: daysAgo(7, 15),
      },
      {
        shopId: shop.id,
        customerId: elena.id,
        ticketId: ticketByNumber(1001).id,
        type: "SMS",
        direction: "IN",
        to: "(512) 555-0142",
        body: "Perfect, on my way now. Thank you!",
        status: "received",
        createdAt: daysAgo(7, 16),
      },
      {
        shopId: shop.id,
        customerId: elena.id,
        invoiceId: invoiceByNumber(1001).id,
        type: "EMAIL",
        direction: "OUT",
        to: "elena.marquez@example.com",
        subject: "Receipt for invoice #1001",
        body: "Thanks for your business! Your receipt is attached and viewable online.",
        status: "sent",
        createdAt: daysAgo(7, 16),
      },
      {
        shopId: shop.id,
        customerId: ray.id,
        ticketId: ticketByNumber(1002).id,
        type: "EMAIL",
        direction: "OUT",
        to: "bea@okonkwodental.example",
        subject: "Part on order for ticket #1002",
        body: "Quick update: the keyboard assembly is on order and expected within 2-3 business days.",
        status: "sent",
        createdAt: daysAgo(5, 13),
      },
      {
        shopId: shop.id,
        customerId: amara.id,
        ticketId: ticketByNumber(1005).id,
        type: "SMS",
        direction: "OUT",
        to: "(512) 555-0156",
        body: "We've started the recovery and it's going well so far. We'll text you as soon as we have a full copy.",
        status: "delivered",
        createdAt: daysAgo(1, 9),
      },
      {
        shopId: shop.id,
        customerId: daniel.id,
        ticketId: ticketByNumber(1004).id,
        type: "EMAIL",
        direction: "OUT",
        to: "d.brooks@example.com",
        subject: "Estimate #1001 for your desktop",
        body: "Diagnostic complete — the power supply failed. Approve the estimate and we'll get it installed.",
        status: "bounced",
        createdAt: daysAgo(2, 17),
      },
      {
        shopId: shop.id,
        customerId: tomas.id,
        ticketId: ticketByNumber(1006).id,
        type: "EMAIL",
        direction: "OUT",
        to: "tomas@riveraland.example",
        subject: "Ticket #1006 complete",
        body: "All done — your iPhone 12 has a fresh battery and is ready whenever you are.",
        status: "sent",
        createdAt: daysAgo(19, 15),
      },
      {
        shopId: shop.id,
        customerId: daniel.id,
        ticketId: ticketByNumber(1004).id,
        type: "EMAIL",
        direction: "IN",
        to: "support@demorepair.shop",
        subject: "Re: Estimate #1001 for your desktop",
        body: "Sorry for the slow reply — go ahead with the power supply. Can you also check why it kept restarting before the outage?",
        status: "received",
        createdAt: hoursAgo(19),
      },
      {
        shopId: shop.id,
        customerId: sofia.id,
        ticketId: ticketByNumber(1011).id,
        type: "EMAIL",
        direction: "OUT",
        to: "sofia.kaur@example.com",
        subject: "We've got your HP Envy — ticket #1011",
        body: "Thanks for checking in online. Marcus has your laptop on the bench and will come back with a diagnosis today.",
        status: "sent",
        createdAt: daysAgo(1, 14),
      },
      {
        shopId: shop.id,
        customerId: sofia.id,
        ticketId: ticketByNumber(1011).id,
        type: "SMS",
        direction: "IN",
        to: "(512) 555-0142",
        body: "Thanks! No rush on it, I'm working off my phone this week.",
        status: "received",
        createdAt: daysAgo(1, 15),
      },
      {
        shopId: shop.id,
        customerId: priscilla.id,
        ticketId: ticketByNumber(1012).id,
        type: "SMS",
        direction: "OUT",
        to: "(512) 555-0178",
        body: "Your iPhone 13 is repaired and ready for pickup whenever suits you.",
        status: "delivered",
        createdAt: daysAgo(1, 16),
      },
      {
        shopId: shop.id,
        customerId: priscilla.id,
        invoiceId: invoiceByNumber(1009).id,
        type: "EMAIL",
        direction: "OUT",
        to: "p.adeyemi@example.com",
        subject: "Receipt for invoice #1009",
        body: "Thanks for your business! Your receipt is attached and viewable online.",
        status: "sent",
        createdAt: daysAgo(1, 16),
      },
      {
        shopId: shop.id,
        customerId: tomas.id,
        ticketId: ticketByNumber(1014).id,
        type: "EMAIL",
        direction: "OUT",
        to: "tomas@riveraland.example",
        subject: "Part on order for ticket #1014",
        body: "The replacement panel is on order and should reach us in the next few days. We'll message you as soon as it lands.",
        status: "sent",
        createdAt: daysAgo(2, 10),
      },
      {
        shopId: shop.id,
        customerId: tomas.id,
        ticketId: ticketByNumber(1014).id,
        type: "EMAIL",
        direction: "IN",
        to: "support@demorepair.shop",
        subject: "Re: Part on order for ticket #1014",
        body: "Understood. We're at the Round Rock yard most mornings if that's easier for the handover.",
        status: "received",
        createdAt: daysAgo(2, 12),
      },
      {
        shopId: shop.id,
        customerId: ray.id,
        invoiceId: invoiceByNumber(1014).id,
        type: "EMAIL",
        direction: "OUT",
        to: "bea@okonkwodental.example",
        subject: "Invoice #1014 from Demo Repair Shop",
        body: "Your monthly managed IT invoice is ready. It is due in two weeks and will charge the card on file automatically.",
        status: "sent",
        createdAt: daysAgo(12, 6),
      },
      {
        shopId: shop.id,
        customerId: amara.id,
        ticketId: ticketByNumber(1016).id,
        type: "EMAIL",
        direction: "OUT",
        to: "amara.nwosu@example.com",
        subject: "Ticket #1016 complete",
        body: "Your XPS is rebuilt and your documents are back where you left them. The $120 deposit has been applied to the final invoice.",
        status: "sent",
        createdAt: daysAgo(5, 17),
      },
      {
        shopId: shop.id,
        customerId: amara.id,
        type: "EMAIL",
        direction: "OUT",
        to: "amara.nwosu@example.com",
        subject: "How did we do?",
        body: "Hi Amara, thanks for choosing Demo Repair Shop! If we did right by you, a quick review would mean a lot.",
        status: "sent",
        createdAt: daysAgo(4, 17),
      },
      {
        shopId: shop.id,
        customerId: daniel.id,
        ticketId: ticketByNumber(1015).id,
        type: "SMS",
        direction: "OUT",
        to: "(512) 555-0145",
        body: "Your Latitude is finished and running quiet again — ready whenever you can collect it.",
        status: "failed",
        createdAt: daysAgo(2, 16),
      },
    ],
  });

  // ---------------------------------------------------------- portal token ---
  await db.portalToken.create({
    data: {
      customerId: ray.id,
      token: "demo-portal-token-okonkwo",
      expiresAt: daysAhead(14),
    },
  });

  // ---------------------------------------------------------- staleness ---
  // `updatedAt` is @updatedAt, so every row the seed touched carries this
  // instant and the board would read as one uniformly fresh wall of tickets.
  // Backdating it to the last thing that actually happened on each ticket is
  // what makes the staleness wash on the cards mean anything. It runs LAST:
  // any db.ticket.update() above would otherwise bump it straight back.
  await db.$executeRaw`
    UPDATE "Ticket" t
    SET "updatedAt" = GREATEST(
      t."createdAt",
      COALESCE(t."resolvedAt", t."createdAt"),
      COALESCE(t."pickedUpAt", t."createdAt"),
      COALESCE(
        (SELECT MAX(c."createdAt") FROM "TicketComment" c WHERE c."ticketId" = t."id"),
        t."createdAt"
      )
    )
    WHERE t."shopId" = ${shop.id}
  `;

  // ------------------------------------------------------------------ done ---
  const counts = {
    shops: 1,
    locations: await db.location.count({ where: { shopId: shop.id } }),
    users: await db.user.count({ where: { shopId: shop.id } }),
    customers: await db.customer.count({ where: { shopId: shop.id } }),
    contacts: await db.contact.count({
      where: { customer: { shopId: shop.id } },
    }),
    assets: await db.asset.count({ where: { shopId: shop.id } }),
    products: await db.product.count({ where: { shopId: shop.id } }),
    tickets: await db.ticket.count({ where: { shopId: shop.id } }),
    ticketComments: await db.ticketComment.count({ where: { shopId: shop.id } }),
    ticketCharges: await db.ticketCharge.count({ where: { shopId: shop.id } }),
    timeEntries: await db.timeEntry.count({ where: { shopId: shop.id } }),
    cannedResponses: await db.cannedResponse.count({ where: { shopId: shop.id } }),
    estimates: await db.estimate.count({ where: { shopId: shop.id } }),
    invoices: await db.invoice.count({ where: { shopId: shop.id } }),
    payments: await db.payment.count({ where: { shopId: shop.id } }),
    communicationLogs: await db.communicationLog.count({
      where: { shopId: shop.id },
    }),
    taxRates: await db.taxRate.count({ where: { shopId: shop.id } }),
    vendors: await db.vendor.count({ where: { shopId: shop.id } }),
    purchaseOrders: await db.purchaseOrder.count({ where: { shopId: shop.id } }),
    productSerials: await db.productSerial.count({ where: { shopId: shop.id } }),
    stockAdjustments: await db.stockAdjustment.count({
      where: { shopId: shop.id },
    }),
    partOrders: await db.partOrder.count({ where: { shopId: shop.id } }),
    checklistTemplates: await db.checklistTemplate.count({
      where: { shopId: shop.id },
    }),
    deposits: await db.deposit.count({ where: { shopId: shop.id } }),
    creditAdjustments: await db.creditAdjustment.count({
      where: { shopId: shop.id },
    }),
    refunds: await db.refund.count({ where: { shopId: shop.id } }),
    recurringInvoices: await db.recurringInvoice.count({
      where: { shopId: shop.id },
    }),
    leads: await db.lead.count({ where: { shopId: shop.id } }),
    appointments: await db.appointment.count({ where: { shopId: shop.id } }),
    campaigns: await db.campaign.count({ where: { shopId: shop.id } }),
    campaignSends: await db.campaignSend.count({ where: { shopId: shop.id } }),
    attachments: await db.attachment.count({ where: { shopId: shop.id } }),
    apiKeys: await db.apiKey.count({ where: { shopId: shop.id } }),
    webhooks: await db.webhook.count({ where: { shopId: shop.id } }),
    webhookDeliveries: await db.webhookDelivery.count({
      where: { shopId: shop.id },
    }),
    auditLogs: await db.auditLog.count({ where: { shopId: shop.id } }),
    timeClockEntries: await db.timeClockEntry.count({
      where: { shopId: shop.id },
    }),
    cashDrawerSessions: await db.cashDrawerSession.count({
      where: { shopId: shop.id },
    }),
  };

  console.table(counts);
  console.log("\nSign in at /login with:");
  console.log("  demo@repairpilot.app       / demo1234   (OWNER)");
  console.log("  tech@repairpilot.app       / demo1234   (TECH)");
  console.log("  frontdesk@repairpilot.app  / demo1234   (FRONT_DESK)");
  console.log("\nPublic check-in:  /checkin/" + SHOP_SLUG);
  console.log("Customer portal:  /portal?token=demo-portal-token-okonkwo");
  console.log("API key:          " + demoApiKey);
}

/** 1x1 transparent PNG — stands in for a captured signature. */
const SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
