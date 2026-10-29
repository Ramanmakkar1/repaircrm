#!/usr/bin/env node
/**
 * A demo shop + owner login for App Store and Google Play reviewers.
 *
 *   DATABASE_URL=… node scripts/create-review-account.mjs <email> <password> ["Shop name"]
 *
 * e.g.
 *   node --env-file=.env scripts/create-review-account.mjs \
 *     appreview@repairshelper.com 'long-random-pass' "Northside Phone Repair"
 *
 * WHAT IT DOES. In one transaction it creates a NEW shop (own slug), a Main
 * location, an OWNER with that email and password (no 2FA, no forced password
 * change, setup wizard already finished), and realistic sample data: tax
 * rates, customers with devices, tickets in every stage with notes, stock with
 * one item running low, invoices (paid, part-paid, sent, draft) with payments,
 * and appointments over the next few days.
 *
 * SAFE AGAINST PRODUCTION. It only inserts rows that belong to the new shop. It
 * never updates or deletes anything, and it refuses if the email already has a
 * login. To remove the account later, sign in as it and use Settings →
 * Delete account (or /delete-account), like any other shop.
 *
 * Why not prisma/seed.ts: that seed rebuilds the fixed `demo` shop with fixed
 * logins, writes local upload files, and refuses to run in production — all
 * correct for development, all wrong here. The sample data below follows the
 * same shapes (statuses, settings keys) on a smaller scale.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const [rawEmail, password, ...nameParts] = process.argv.slice(2);
const email = String(rawEmail ?? "").trim().toLowerCase();
const shopName = nameParts.join(" ").trim() || "Northside Phone & Laptop Repair";

function usage(message) {
  console.error(message);
  console.error('Usage: node scripts/create-review-account.mjs <email> <password> ["Shop name"]');
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) usage("Give the reviewer login's email address.");
if (typeof password !== "string" || password.length < 10) usage("Give a password of at least 10 characters.");
if (!process.env.DATABASE_URL) usage("Set DATABASE_URL (for example with node --env-file=.env).");

const db = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const at = (days, hour = 10, minute = 0) => {
  const d = new Date(now + days * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

function slugify(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "shop"
  );
}

async function uniqueSlug(name) {
  const base = slugify(name);
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await db.shop.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${base}-${Date.now()}`;
}

const STATUSES = ["New", "In Progress", "Waiting for Parts", "Waiting on Customer", "Ready for Pickup", "Resolved"];
const TAX_BPS = 500; // GST

const CUSTOMERS = [
  { firstName: "Maya", lastName: "Okafor", phone: "(780) 555-0101", email: "maya.okafor@example.com", device: ["Phone", "Apple", "iPhone 15", "F2LXK0QJN6"] },
  { firstName: "Daniel", lastName: "Reyes", phone: "(780) 555-0114", email: "d.reyes@example.com", device: ["Laptop", "Lenovo", "ThinkPad T14 Gen 3", "PF3Z8K2M"] },
  { firstName: "Priya", lastName: "Shah", phone: "(780) 555-0127", email: "priya.shah@example.com", device: ["Tablet", "Samsung", "Galaxy Tab S9", "R52W40ABCDE"] },
  { firstName: "Tom", lastName: "Becker", phone: "(780) 555-0133", email: null, device: ["Phone", "Google", "Pixel 8", "38211FDJH004"] },
  { firstName: "Aisha", lastName: "Mahmoud", phone: "(780) 555-0148", email: "aisha.m@example.com", device: ["Laptop", "Apple", "MacBook Air M2", "C02HK1Q3Q6L4"] },
  { firstName: "Luis", lastName: "Fernández", phone: "(780) 555-0156", email: "luis.fernandez@example.com", device: ["Console", "Nintendo", "Switch OLED", "XTW70012345678"] },
  { firstName: "Grace", lastName: "Kim", phone: "(780) 555-0162", email: "grace.kim@example.com", device: ["Phone", "Samsung", "Galaxy S23", "R5CW1234ABC"] },
  { firstName: "Owen", lastName: "Clarke", businessName: "Clarke & Daughters Bakery", phone: "(780) 555-0179", email: "owen@clarkebakery.example.com", device: ["Desktop", "Dell", "OptiPlex 7010", "9XK2LM3"] },
];

const PRODUCTS = [
  { name: "iPhone 15 screen (OLED)", sku: "SCR-IP15", category: "Screens", priceCents: 28900, costCents: 14500, stockQty: 4, lowStockAt: 2 },
  { name: "Galaxy S23 screen", sku: "SCR-S23", category: "Screens", priceCents: 25900, costCents: 13200, stockQty: 1, lowStockAt: 2 },
  { name: "iPhone battery (13–15)", sku: "BAT-IP13-15", category: "Batteries", priceCents: 11900, costCents: 3800, stockQty: 9, lowStockAt: 3 },
  { name: "USB-C charging port", sku: "PRT-USBC", category: "Parts", priceCents: 7900, costCents: 1200, stockQty: 12, lowStockAt: 4 },
  { name: "Tempered glass screen protector", sku: "ACC-GLASS", category: "Accessories", priceCents: 2499, costCents: 300, stockQty: 40, lowStockAt: 10 },
  { name: "Laptop SSD 1 TB", sku: "SSD-1TB", category: "Storage", priceCents: 13900, costCents: 7900, stockQty: 3, lowStockAt: 1 },
];

/** [customer index, subject, problem type, status, priority, due in days, created days ago, note] */
const TICKETS = [
  [0, "Cracked screen, touch works", "Screen Repair", "Ready for Pickup", "NORMAL", 0, 2, "Screen replaced, True Tone restored. Customer texted."],
  [1, "Won't charge, port loose", "Diagnostic", "In Progress", "HIGH", 1, 1, "Port is worn. Ordering a replacement board connector."],
  [2, "Battery drains overnight", "Battery Replacement", "Waiting for Parts", "NORMAL", 4, 3, "Battery ordered from supplier, ETA Thursday."],
  [3, "Dropped in water", "Water Damage", "In Progress", "URGENT", 0, 0, "Opened and cleaned. Drying 24h before power-on test."],
  [4, "Slow, beach ball constantly", "Software / Virus", "Waiting on Customer", "LOW", 3, 4, "Need the login password to run diagnostics. Emailed customer."],
  [5, "Left Joy-Con drifts", "Diagnostic", "New", "NORMAL", 3, 0, null],
  [6, "Back glass shattered", "Screen Repair", "New", "NORMAL", 2, 0, null],
  [7, "Won't boot after power cut", "Data Recovery", "Resolved", "HIGH", -6, 9, "PSU replaced, data intact. Picked up."],
  [0, "Screen protector + case fitting", "Other", "Resolved", "LOW", -12, 14, "Done while customer waited."],
];

async function main() {
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new Error(`${email} already has a login. Choose another address; nothing was changed.`);
  }
  const slug = await uniqueSlug(shopName);
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await db.$transaction(
    async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: shopName,
          slug,
          address1: "10230 Jasper Avenue",
          city: "Edmonton",
          state: "AB",
          postalCode: "T5J 4P6",
          country: "CA",
          phone: "(780) 555-0100",
          email,
          timezone: "America/Edmonton",
          taxRateBps: TAX_BPS,
          settings: {
            ticketStatuses: STATUSES,
            problemTypes: ["Screen Repair", "Battery Replacement", "Water Damage", "Data Recovery", "Software / Virus", "Diagnostic", "Other"],
            defaultLabourRateCents: 8500,
            labourRoundingMinutes: 15,
            invoiceTerms: "Payment due on pickup. 90-day warranty on parts and labour.",
            onboarding: {
              completed: ["shop", "team", "payments", "items", "ready"],
              skipped: [],
              current: "ready",
              finishedAt: new Date(now - 20 * DAY).toISOString(),
              dismissed: true,
            },
          },
        },
      });
      const shopId = shop.id;
      await tx.taxRate.create({ data: { shopId, name: "GST", rateBps: TAX_BPS, isDefault: true } });
      await tx.taxRate.create({ data: { shopId, name: "No tax", rateBps: 0 } });
      const location = await tx.location.create({ data: { shopId, name: "Main", isDefault: true } });

      const owner = await tx.user.create({
        data: {
          shopId,
          email,
          passwordHash,
          name: "App Review",
          role: "OWNER",
          defaultLocationId: location.id,
        },
      });

      const products = [];
      for (const p of PRODUCTS) products.push(await tx.product.create({ data: { shopId, ...p } }));

      const customers = [];
      for (const [i, c] of CUSTOMERS.entries()) {
        const { device, ...fields } = c;
        const customer = await tx.customer.create({
          data: { shopId, ...fields, city: "Edmonton", state: "AB", country: "CA", smsOptIn: Boolean(fields.phone), createdAt: at(-30 + i) },
        });
        const [type, make, model, serial] = device;
        const asset = await tx.asset.create({ data: { shopId, customerId: customer.id, type, make, model, serial } });
        customers.push({ customer, asset });
      }

      const tickets = [];
      let number = 1000;
      for (const [ci, subject, problemType, status, priority, dueIn, createdAgo, note] of TICKETS) {
        const { customer, asset } = customers[ci];
        const done = status === "Resolved";
        const ticket = await tx.ticket.create({
          data: {
            shopId,
            locationId: location.id,
            customerId: customer.id,
            assetId: asset.id,
            number: number++,
            subject,
            problemType,
            status,
            priority,
            assignedToId: owner.id,
            dueDate: at(dueIn, 17),
            createdAt: at(-createdAgo, 9 + (number % 6)),
            ...(done ? { resolvedAt: at(dueIn, 15), pickedUpAt: at(dueIn, 16) } : {}),
          },
        });
        if (note) {
          await tx.ticketComment.create({
            data: { shopId, ticketId: ticket.id, authorId: owner.id, body: note, createdAt: at(-createdAgo, 15) },
          });
        }
        tickets.push(ticket);
      }

      // Invoices: [ticket index, customer index, status, lines, paid cents | "all", days ago]
      const INVOICES = [
        [7, 7, "PAID", [["Power supply replacement", 1, 8900, null], ["Labour — diagnosis and repair (1:00)", 1, 8500, null]], "all", 6],
        [8, 0, "PAID", [["Tempered glass screen protector", 1, 2499, 4]], "all", 12],
        [0, 0, "SENT", [["iPhone 15 screen (OLED)", 1, 28900, 0], ["Labour — screen replacement (0:45)", 1, 6375, null]], 0, 0],
        [2, 2, "PARTIAL", [["Battery replacement", 1, 12900, null]], 5000, 3],
        [1, 1, "DRAFT", [["USB-C charging port", 1, 7900, 3], ["Labour (estimate)", 1, 8500, null]], 0, 0],
      ];
      let invoiceNumber = 1000;
      for (const [ti, ci, status, lines, paid, daysAgo] of INVOICES) {
        const subtotal = lines.reduce((sum, [, qty, cents]) => sum + qty * cents, 0);
        const total = subtotal + Math.round((subtotal * TAX_BPS) / 10_000);
        const created = at(-daysAgo, 12);
        const invoice = await tx.invoice.create({
          data: {
            shopId,
            locationId: location.id,
            customerId: customers[ci].customer.id,
            ticketId: tickets[ti].id,
            number: invoiceNumber++,
            status,
            taxRateBps: TAX_BPS,
            dueDate: at(-daysAgo + 14, 17),
            createdAt: created,
            ...(status === "PAID" ? { paidAt: created } : {}),
            lines: {
              create: lines.map(([description, quantity, unitPriceCents, productIndex], sortOrder) => ({
                description,
                quantity,
                unitPriceCents,
                sortOrder,
                productId: productIndex == null ? null : products[productIndex].id,
              })),
            },
          },
        });
        const amount = paid === "all" ? total : paid;
        if (amount > 0) {
          await tx.payment.create({
            data: { shopId, invoiceId: invoice.id, amountCents: amount, method: status === "PAID" ? "CARD" : "CASH", takenById: owner.id, createdAt: created },
          });
        }
      }

      const APPOINTMENTS = [
        [5, "Joy-Con drop-off", 1, 11],
        [6, "Back glass repair", 2, 14],
        [3, "Water damage follow-up", 1, 16],
      ];
      for (const [ci, title, inDays, hour] of APPOINTMENTS) {
        await tx.appointment.create({
          data: {
            shopId,
            locationId: location.id,
            customerId: customers[ci].customer.id,
            assignedToId: owner.id,
            title,
            startsAt: at(inDays, hour),
            endsAt: at(inDays, hour, 30),
          },
        });
      }

      return { shop, owner };
    },
    { timeout: 60_000 },
  );

  console.log(`Review account ready.`);
  console.log(`  Shop:     ${result.shop.name} (/${result.shop.slug})`);
  console.log(`  Sign in:  ${email}  (OWNER, no 2FA)`);
  console.log(`  Data:     ${CUSTOMERS.length} customers, ${TICKETS.length} tickets, ${PRODUCTS.length} products, 5 invoices, 3 appointments`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
