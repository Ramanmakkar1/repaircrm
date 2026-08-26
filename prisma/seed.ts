/**
 * Demo data for RepairFlow.
 *
 * Idempotent: drops and rebuilds the `demo` shop on every run (every tenant-owned
 * table cascades from Shop), so it is safe to re-run at any time.
 *
 *   npm run db:seed
 *
 * Logins (all use the password `demo1234`):
 *   demo@repairflow.app       OWNER
 *   tech@repairflow.app       TECH
 *   frontdesk@repairflow.app  FRONT_DESK
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const SHOP_SLUG = "demo";
const PASSWORD = "demo1234";
const TAX_BPS = 825; // 8.25%

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now - n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const daysAhead = (n: number, hour = 17) => daysAgo(-n, hour);

async function main() {
  console.log("Seeding RepairFlow demo data…");

  // ---------------------------------------------------------------- reset ---
  const existing = await db.shop.findUnique({ where: { slug: SHOP_SLUG } });
  if (existing) {
    await db.shop.delete({ where: { id: existing.id } });
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
        defaultLabourRateCents: 9500,
        invoiceTerms: "Net 15. Devices left over 30 days may be recycled.",
      },
    },
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
      email: "demo@repairflow.app",
      passwordHash,
      name: "Dana Ortiz",
      role: "OWNER",
    },
  });

  const tech = await db.user.create({
    data: {
      shopId: shop.id,
      email: "tech@repairflow.app",
      passwordHash,
      name: "Marcus Webb",
      role: "TECH",
    },
  });

  const frontDesk = await db.user.create({
    data: {
      shopId: shop.id,
      email: "frontdesk@repairflow.app",
      passwordHash,
      name: "Priya Shah",
      role: "FRONT_DESK",
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
      lastName: "Okonkwo",
      businessName: "Okonkwo Dental Group",
      email: "ray@okonkwodental.example",
      phone: "(512) 555-0122",
      address1: "3110 Guadalupe St",
      city: "Austin",
      state: "TX",
      postalCode: "78705",
      creditBalanceCents: 5000,
      notes: "Commercial account — invoices go to the office manager.",
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
      ],
    },
    {
      firstName: "Daniel",
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
      ],
    },
    {
      firstName: "Amara",
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
      lastName: "Rivera",
      businessName: "Rivera Landscaping LLC",
      email: "tomas@riveraland.example",
      phone: "(512) 555-0167",
      address1: "9010 N Lamar Blvd",
      city: "Austin",
      state: "TX",
      postalCode: "78753",
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
      ],
    },
    {
      firstName: "Owen",
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
    comments?: CommentSpec[];
    charges?: ChargeSpec[];
    time?: { userId: string; startedAt: Date; minutes?: number; note?: string }[];
  };

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
      dueDate: daysAhead(3),
      createdAt: daysAgo(6),
      intakeSigned: true,
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
      createdAt: daysAgo(3),
      intakeSigned: true,
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
      createdAt: daysAgo(5),
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
      dueDate: daysAhead(1),
      createdAt: daysAgo(2),
      intakeSigned: true,
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
      createdAt: daysAgo(21),
      resolvedAt: daysAgo(19),
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
  ];

  const tickets: { id: string; number: number }[] = [];
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

  // --------------------------------------------------------------- invoices ---
  type InvoiceSpec = {
    number: number;
    customerId: string;
    ticketId?: string;
    estimateId?: string;
    status: "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "VOID";
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
    }[];
    payments?: {
      amountCents: number;
      method: "CASH" | "CARD" | "CHECK" | "OTHER" | "CREDIT";
      reference?: string;
      takenById?: string;
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
      status: "PAID",
      createdAt: daysAgo(19, 15),
      paidAt: daysAgo(19, 15),
      lines: [
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
        status: spec.status,
        taxRateBps: TAX_BPS,
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
  ] as const) {
    await db.ticketCharge.updateMany({
      where: { shopId: shop.id, ticketId: ticketByNumber(ticketNumber).id },
      data: { invoiceId: invoiceByNumber(invoiceNumber).id },
    });
  }

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
  };

  console.table(counts);
  console.log("\nSign in at /login with:");
  console.log("  demo@repairflow.app       / demo1234   (OWNER)");
  console.log("  tech@repairflow.app       / demo1234   (TECH)");
  console.log("  frontdesk@repairflow.app  / demo1234   (FRONT_DESK)");
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
