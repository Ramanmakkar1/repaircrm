import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SearchGroup, SearchItem } from "@/components/search/types";
import { TYPE_LABEL } from "@/components/search/types";

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
  /** Numeric query -> also try it as a ticket / invoice / estimate number. */
  const number = /^\d{1,9}$/.test(q) ? Number(q) : null;

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

  const customerOr: Prisma.CustomerWhereInput[] = [
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

  const [customers, tickets, ticketExact, invoices, invoiceExact, estimates, estimateExact, products, leads] =
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
            ...(number !== null ? [{ number }] : []),
            { subject: like },
            { problemType: like },
            { customer: { OR: customerOr } },
          ],
        },
        select: {
          id: true,
          number: true,
          subject: true,
          status: true,
          customer: { select: customerSelect },
        },
        orderBy: { updatedAt: "desc" },
        take: PER_GROUP,
      }),
      // The unique ([shopId, number]) hit is pinned to the top of its group so
      // typing "1003" can never lose ticket #1003 behind five recent matches.
      number === null
        ? null
        : db.ticket.findFirst({
            where: { shopId, number },
            select: {
              id: true,
              number: true,
              subject: true,
              status: true,
              customer: { select: customerSelect },
            },
          }),

      db.invoice.findMany({
        where: {
          shopId,
          OR: [
            ...(number !== null ? [{ number }] : []),
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
      number === null
        ? null
        : db.invoice.findFirst({
            where: { shopId, number },
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
            ...(number !== null ? [{ number }] : []),
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
      number === null
        ? null
        : db.estimate.findFirst({
            where: { shopId, number },
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
        },
        orderBy: { name: "asc" },
        take: PER_GROUP,
      }),

      db.lead.findMany({
        where: {
          shopId,
          OR: [{ name: like }, { email: like }, { phone: like }],
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
          [c.businessName, c.email, c.phone ?? c.mobile]
            .filter(Boolean)
            .join(" · ") || undefined,
        href: `/customers/${c.id}`,
      })),
    ),

    group(
      "ticket",
      pinExact(ticketExact, tickets).map((t) => ({
        type: "ticket" as const,
        id: t.id,
        title: `#${t.number} · ${t.subject}`,
        subtitle: personName(t.customer),
        href: `/tickets/${t.id}`,
        badge: t.status,
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
      })),
    ),

    group(
      "product",
      products.map((p) => ({
        type: "product" as const,
        id: p.id,
        title: p.name,
        subtitle:
          [p.sku ? `SKU ${p.sku}` : null, `${p.stockQty} in stock`]
            .filter(Boolean)
            .join(" · ") || undefined,
        href: `/inventory/${p.id}`,
        badge: p.active ? undefined : "Inactive",
      })),
    ),

    group(
      "lead",
      leads.map((l) => ({
        type: "lead" as const,
        id: l.id,
        title: l.name,
        subtitle:
          [l.email ?? l.phone, l.source].filter(Boolean).join(" · ") || undefined,
        href: `/leads/${l.id}`,
        badge: titleCase(l.status),
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

/** DRAFT -> Draft, so an enum never shouts at the user from a badge. */
function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
