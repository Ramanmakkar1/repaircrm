import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getSession } from "@/lib/auth";
import {
  customerIdsByPhone,
  leadIdsByPhone,
  phoneQueryDigits,
} from "@/lib/customers/phone-search";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { deviceImageSource, PRODUCT_IMAGE_SELECT, productImageSource } from "@/lib/inventory/product-images";
import type { SearchGroup, SearchItem } from "@/components/search/types";
import { TYPE_LABEL } from "@/components/search/types";
import { numberFor, parseRecordQuery } from "@/components/search/record-number";

/**
 * Backing store for the ⌘K command palette.
 *
 *   GET /api/app-search?q=elena  ->  { q, groups: [{ type, label, items }] }
 *
 * Every lookup is `shopId`-scoped from the session cookie (see lib/db.ts), caps
 * at 5 rows, and selects only the handful of columns a palette row renders — a
 * keystroke must never pull a full record graph. All six lookups run in one
 * Promise.all so the round trip is one query's worth of latency, not six.
 *
 * Debouncing is the client's job (200ms in command-palette.tsx); this handler
 * stays dumb and fast.
 */

/** Below this length the palette shows quick actions instead of results. */
const MIN_QUERY = 2;
const PER_GROUP = 5;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    // 401 rather than requireUser()'s redirect: a `fetch` would silently follow
    // a 307 to /login and hand the palette an HTML body to JSON.parse.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shopId } = session;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();

  if (q.length < MIN_QUERY) {
    return NextResponse.json({ q, groups: [] });
  }

  const like = { contains: q, mode: "insensitive" as const };
  /**
   * A record number, written any way people write one: "1012", "#1012",
   * "INV-1012", "repair 1012". A word in front ("INV", "repair", "EST") only
   * looks up that kind; a bare number or "#1012" tries all three.
   */
  const record = parseRecordQuery(q);
  const ticketNumber = numberFor(record, "ticket");
  const invoiceNumber = numberFor(record, "invoice");
  const estimateNumber = numberFor(record, "estimate");

  // "elena m" should find Elena Marsh even though neither column contains the
  // whole string. First term against firstName, last term against lastName.
  const terms = q.split(/\s+/).filter(Boolean);
  const splitName: Prisma.CustomerWhereInput[] =
    terms.length > 1
      ? [
          {
            AND: [
              { firstName: { contains: terms[0], mode: "insensitive" } },
              {
                lastName: {
                  contains: terms[terms.length - 1],
                  mode: "insensitive",
                },
              },
            ],
          },
        ]
      : [];

  // "5125550178" has to find "(512) 555-0178": a typed phone number is matched
  // digits-to-digits, and the ids join the ordinary OR below — which is also
  // what tickets, invoices and estimates search their customer by.
  const phone = phoneQueryDigits(q);
  const [phoneCustomerIds, phoneLeadIds] = phone
    ? await Promise.all([
        customerIdsByPhone(shopId, phone),
        leadIdsByPhone(shopId, phone),
      ])
    : [[], []];

  const customerOr: Prisma.CustomerWhereInput[] = [
    ...(phoneCustomerIds.length > 0 ? [{ id: { in: phoneCustomerIds } }] : []),
    { firstName: like },
    { lastName: like },
    { businessName: like },
    { email: like },
    { phone: like },
    { mobile: like },
    ...splitName,
  ];

  const customerSelect = {
    firstName: true,
    lastName: true,
    businessName: true,
  } as const;

  const ticketSelect = {
    id: true,
    number: true,
    subject: true,
    status: true,
    customer: { select: customerSelect },
    asset: { select: { type: true, make: true, model: true } },
  } as const;

  const [customers, tickets, ticketExact, invoices, invoiceExact, estimates, estimateExact, products, serials, leads] =
    await Promise.all([
      db.customer.findMany({
        where: { shopId, OR: customerOr },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          businessName: true,
          email: true,
          phone: true,
          mobile: true,
        },
        orderBy: { updatedAt: "desc" },
        take: PER_GROUP,
      }),

      db.ticket.findMany({
        where: {
          shopId,
          OR: [
            ...(ticketNumber !== null ? [{ number: ticketNumber }] : []),
            { subject: like },
            { problemType: like },
            { customer: { OR: customerOr } },
            // The IMEI / serial and the device itself ("pixel 8").
            { asset: { OR: [{ serial: like }, { make: like }, { model: like }] } },
          ],
        },
        select: ticketSelect,
        orderBy: { updatedAt: "desc" },
        take: PER_GROUP,
      }),
      // The unique ([shopId, number]) hit is pinned to the top of its group so
      // typing "1003" can never lose ticket #1003 behind five recent matches.
      ticketNumber === null
        ? null
        : db.ticket.findFirst({
            where: { shopId, number: ticketNumber },
            select: ticketSelect,
          }),

      db.invoice.findMany({
        where: {
          shopId,
          OR: [
            ...(invoiceNumber !== null ? [{ number: invoiceNumber }] : []),
            { customer: { OR: customerOr } },
          ],
        },
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: customerSelect },
        },
        orderBy: { updatedAt: "desc" },
        take: PER_GROUP,
      }),
      invoiceNumber === null
        ? null
        : db.invoice.findFirst({
            where: { shopId, number: invoiceNumber },
            select: {
              id: true,
              number: true,
              status: true,
              customer: { select: customerSelect },
            },
          }),

      db.estimate.findMany({
        where: {
          shopId,
          OR: [
            ...(estimateNumber !== null ? [{ number: estimateNumber }] : []),
            { customer: { OR: customerOr } },
          ],
        },
        select: {
          id: true,
          number: true,
          status: true,
          customer: { select: customerSelect },
        },
        orderBy: { updatedAt: "desc" },
        take: PER_GROUP,
      }),
      estimateNumber === null
        ? null
        : db.estimate.findFirst({
            where: { shopId, number: estimateNumber },
            select: {
              id: true,
              number: true,
              status: true,
              customer: { select: customerSelect },
            },
          }),

      db.product.findMany({
        where: {
          shopId,
          OR: [{ name: like }, { sku: like }, { upc: like }, { category: like }],
        },
        select: {
          id: true,
          name: true,
          sku: true,
          stockQty: true,
          active: true,
          priceCents: true,
          category: true,
          catalogImage: true,
          attachments: PRODUCT_IMAGE_SELECT,
        },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      }),

      // Typing a serial number finds the physical unit: which product it is,
      // where it got to, and — once sold — the invoice it left on.
      db.productSerial.findMany({
        where: { shopId, serial: like },
        select: {
          id: true,
          serial: true,
          status: true,
          product: { select: { id: true, name: true, category: true, catalogImage: true } },
          invoiceLine: {
            select: { invoice: { select: { id: true, number: true } } },
          },
        },
        orderBy: { serial: "asc" },
        take: PER_GROUP,
      }),

      db.lead.findMany({
        where: {
          shopId,
          OR: [
            { name: like },
            { email: like },
            { phone: like },
            ...(phoneLeadIds.length > 0 ? [{ id: { in: phoneLeadIds } }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          source: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
        take: PER_GROUP,
      }),
    ]);

  const groups: SearchGroup[] = [
    group(
      "customer",
      customers.map((c) => ({
        type: "customer" as const,
        id: c.id,
        title: personName(c),
        subtitle:
          [c.phone ?? c.mobile, c.businessName, c.email]
            .filter(Boolean)
            .join(" · ") || undefined,
        href: `/customers/${c.id}`,
        initials: initialsOf(personName(c)),
      })),
    ),

    group(
      "ticket",
      pinExact(ticketExact, tickets).map((t) => ({
        type: "ticket" as const,
        id: t.id,
        title: `#${t.number} · ${personName(t.customer)}`,
        subtitle: [deviceLabel(t.asset), t.subject].filter(Boolean).join(" · ") || undefined,
        href: `/tickets/${t.id}`,
        badge: t.status,
        picture: devicePicture(t.asset, t.subject),
        exact: t.number === ticketNumber,
      })),
    ),

    group(
      "invoice",
      pinExact(invoiceExact, invoices).map((i) => ({
        type: "invoice" as const,
        id: i.id,
        title: `Invoice #${i.number}`,
        subtitle: personName(i.customer),
        href: `/invoices/${i.id}`,
        badge: titleCase(i.status),
        picture: "/images/home/invoice-pad.webp",
        exact: i.number === invoiceNumber,
      })),
    ),

    group(
      "estimate",
      pinExact(estimateExact, estimates).map((e) => ({
        type: "estimate" as const,
        id: e.id,
        title: `Estimate #${e.number}`,
        subtitle: personName(e.customer),
        href: `/estimates/${e.id}`,
        badge: titleCase(e.status),
        picture: "/images/home/price-tag.webp",
        exact: e.number === estimateNumber,
      })),
    ),

    group(
      "product",
      products.map((p) => ({
        type: "product" as const,
        id: p.id,
        title: p.name,
        subtitle:
          [`${p.stockQty} in stock`, p.sku ? `SKU ${p.sku}` : null]
            .filter(Boolean)
            .join(" · ") || undefined,
        href: `/inventory/${p.id}`,
        badge: p.active ? undefined : "Not for sale",
        picture: productImageSource({
          productId: p.id,
          name: p.name,
          category: p.category,
          catalogImage: p.catalogImage,
          imageUrl: p.attachments[0] ? `/files/${p.attachments[0].id}` : null,
        }).src,
        price: formatCents(p.priceCents),
      })),
    ),

    group(
      "serial",
      serials.map((unit) => ({
        type: "serial" as const,
        id: unit.id,
        title: unit.serial,
        subtitle:
          [
            unit.product.name,
            unit.invoiceLine?.invoice
              ? `Invoice #${unit.invoiceLine.invoice.number}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
        // A sold unit's story is on its invoice; anything else is answered on
        // the product's serial list.
        href: unit.invoiceLine?.invoice
          ? `/invoices/${unit.invoiceLine.invoice.id}`
          : `/inventory/${unit.product.id}`,
        badge: serialBadge(unit.status),
        picture: productImageSource({ name: unit.product.name, category: unit.product.category, catalogImage: unit.product.catalogImage }).src,
      })),
    ),

    group(
      "lead",
      leads.map((l) => ({
        type: "lead" as const,
        id: l.id,
        title: l.name,
        subtitle:
          [l.phone ?? l.email, l.source].filter(Boolean).join(" · ") || undefined,
        href: `/leads/${l.id}`,
        badge: titleCase(l.status),
        initials: initialsOf(l.name),
      })),
    ),
  ].filter((g) => g.items.length > 0);

  return NextResponse.json({ q, groups });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function group(type: SearchGroup["type"], items: SearchItem[]): SearchGroup {
  return { type, label: TYPE_LABEL[type], items: items.slice(0, PER_GROUP) };
}

/** Puts the exact-number row first, de-duped, without growing the group. */
function pinExact<T extends { id: string }>(exact: T | null, list: T[]): T[] {
  if (!exact) return list;
  return [exact, ...list.filter((row) => row.id !== exact.id)].slice(0, PER_GROUP);
}

function personName(c: {
  firstName: string;
  lastName: string;
  businessName: string | null;
}): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || c.businessName || "Unnamed";
}

/** "PA" for Priscilla Adeyemi: the picture for a person. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** "Lenovo ThinkPad T14", or the device type when make and model are blank. */
function deviceLabel(asset: { type: string; make: string | null; model: string | null } | null): string | null {
  if (!asset) return null;
  return [asset.make, asset.model].filter(Boolean).join(" ").trim() || asset.type.trim() || null;
}

/** The device-family picture (a phone, a laptop...): never an exact model. */
function devicePicture(asset: { type: string; make: string | null; model: string | null } | null, subject: string): string | null {
  const text = [asset?.type, asset?.make, asset?.model, subject].filter(Boolean).join(" ");
  return deviceImageSource(text)?.src ?? null;
}

/** IN_STOCK -> In stock. */
function serialBadge(status: string): string {
  return titleCase(status.replace("_", " "));
}

/** DRAFT -> Draft, so an enum never shouts at the user from a badge. */
function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
