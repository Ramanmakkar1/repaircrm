import { beforeEach, describe, expect, it, vi } from "vitest";
import { callsTo, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});
const session = vi.hoisted(() => ({ value: { userId: "u1", shopId: "shop_1", role: "OWNER", name: "Dana", email: "d@x" } as Record<string, string> | null }));
vi.mock("@/lib/auth", () => ({ getSession: async () => session.value }));

import { numberFor, parseRecordQuery } from "@/components/search/record-number";
import { arrangeResults, TYPE_LABEL, type SearchGroup } from "@/components/search/types";
import { localMatches, PLACES, START_TILES } from "@/components/search/places";

const { GET } = await import("@/app/api/app-search/route");

describe("record numbers, written the way people write them", () => {
  it.each([
    ["1012", 1012, null],
    ["#1012", 1012, null],
    [" # 1012 ", 1012, null],
    ["no. 1012", 1012, null],
    ["INV-1012", 1012, "invoice"],
    ["inv 1012", 1012, "invoice"],
    ["Invoice #1012", 1012, "invoice"],
    ["R-1012", 1012, "ticket"],
    ["repair 1012", 1012, "ticket"],
    ["Repair no. 1012", 1012, "ticket"],
    ["ticket #1012", 1012, "ticket"],
    ["work order 1012", 1012, "ticket"],
    ["EST1012", 1012, "estimate"],
    ["quote 7", 7, "estimate"],
  ])("%s -> #%s (%s)", (query, number, kind) => {
    expect(parseRecordQuery(query)).toEqual({ number, kind });
  });

  it.each(["", "marquez", "555-0178", "(512) 555-0142", "iphone 12", "1TB NVMe", "#", "inv", "1234567890"])("%s is not a record number", (query) => {
    expect(parseRecordQuery(query)).toBeNull();
  });

  it("a kind word limits the lookup to that kind; a bare number tries all three", () => {
    const bare = parseRecordQuery("#1012");
    expect([numberFor(bare, "ticket"), numberFor(bare, "invoice"), numberFor(bare, "estimate")]).toEqual([1012, 1012, 1012]);
    const invoice = parseRecordQuery("INV-1012");
    expect([numberFor(invoice, "ticket"), numberFor(invoice, "invoice"), numberFor(invoice, "estimate")]).toEqual([null, 1012, null]);
    expect(numberFor(null, "ticket")).toBeNull();
  });
});

describe("result groups", () => {
  const group = (type: SearchGroup["type"], ids: string[], exact?: string): SearchGroup => ({
    type,
    label: TYPE_LABEL[type],
    items: ids.map((id) => ({ type, id, title: id, href: `/${id}`, exact: id === exact })),
  });

  it("orders groups Repairs, Customers, Invoices, Products and lifts the typed number out as the top match", () => {
    const { exact, groups } = arrangeResults([
      group("customer", ["c1"]),
      group("product", ["p1"]),
      group("invoice", ["i1", "i2"], "i2"),
      group("ticket", ["t1"]),
    ]);
    expect(exact.map((item) => item.id)).toEqual(["i2"]);
    expect(groups.map((g) => g.type)).toEqual(["ticket", "customer", "invoice", "product"]);
    expect(groups.find((g) => g.type === "invoice")?.items.map((item) => item.id)).toEqual(["i1"]);
  });

  it("drops a group the top match emptied", () => {
    const { groups } = arrangeResults([group("ticket", ["t1"], "t1"), group("customer", ["c1"])]);
    expect(groups.map((g) => g.type)).toEqual(["customer"]);
  });

  it("uses plain nouns: no Tickets, Leads, Inventory or Point of sale", () => {
    const words = [...Object.values(TYPE_LABEL), ...PLACES.map((p) => p.title), ...START_TILES.map((s) => s.title)].join(" | ");
    expect(words).not.toMatch(/\bTickets?\b|\bLeads?\b|Inventory|Point of sale|Dashboard|Vendors?/);
    expect(TYPE_LABEL.ticket).toBe("Repairs");
    expect(TYPE_LABEL.lead).toBe("Enquiries");
  });

  it("matches places as you type, and hides money places from technicians", () => {
    expect(localMatches("inv", true).places.map((p) => p.title)).toContain("Invoices");
    expect(localMatches("inv", false).places.map((p) => p.title)).not.toContain("Invoices");
    expect(localMatches("new rep", true).starts.map((s) => s.title)).toEqual(["New repair"]);
    expect(localMatches("", true)).toEqual({ starts: [], places: [] });
  });
});

describe("GET /api/app-search", () => {
  const ticket = { id: "t1", number: 1012, subject: "Cracked screen", status: "In Progress", customer: { firstName: "Elena", lastName: "Marquez", businessName: null }, asset: { type: "Phone", make: "Apple", model: "iPhone 13" } };
  const invoice = { id: "i1", number: 1012, status: "SENT", customer: { firstName: "Elena", lastName: "Marquez", businessName: null } };

  beforeEach(() => {
    resetDb();
    session.value = { userId: "u1", shopId: "shop_1", role: "OWNER", name: "Dana", email: "d@x" };
    for (const path of ["customer.findMany", "ticket.findMany", "invoice.findMany", "estimate.findMany", "product.findMany", "productSerial.findMany", "lead.findMany"]) handlers[path] = () => [];
    handlers["ticket.findFirst"] = () => ticket;
    handlers["invoice.findFirst"] = () => invoice;
    handlers["estimate.findFirst"] = () => null;
    handlers["$queryRaw"] = () => [];
  });

  const search = async (q: string) => (await GET(new Request(`http://x/api/app-search?q=${encodeURIComponent(q)}`))).json();

  it("finds repair and invoice #1012 from '#1012', the way every card writes it", async () => {
    const body = await search("#1012");
    expect(callsTo("ticket.findFirst")[0].args.where).toEqual({ shopId: "shop_1", number: 1012 });
    expect(callsTo("invoice.findFirst")[0].args.where).toEqual({ shopId: "shop_1", number: 1012 });
    const repairs = body.groups.find((g: SearchGroup) => g.type === "ticket");
    expect(repairs.label).toBe("Repairs");
    expect(repairs.items[0]).toMatchObject({ title: "#1012 · Elena Marquez", exact: true, href: "/tickets/t1" });
    expect(repairs.items[0].subtitle).toContain("Apple iPhone 13");
    expect(repairs.items[0].picture).toMatch(/^\/images\//);
  });

  it("'INV-1012' looks up only the invoice by number", async () => {
    const body = await search("INV-1012");
    expect(callsTo("ticket.findFirst")).toHaveLength(0);
    expect(callsTo("estimate.findFirst")).toHaveLength(0);
    expect(callsTo("invoice.findFirst")[0].args.where).toEqual({ shopId: "shop_1", number: 1012 });
    const ticketOr = (callsTo("ticket.findMany")[0].args.where as { OR: Record<string, unknown>[] }).OR;
    expect(ticketOr.some((clause) => "number" in clause)).toBe(false);
    expect(body.groups.find((g: SearchGroup) => g.type === "invoice").items[0]).toMatchObject({ title: "Invoice #1012", exact: true });
  });

  it("'R-1012' looks up only the repair", async () => {
    await search("R-1012");
    expect(callsTo("ticket.findFirst")).toHaveLength(1);
    expect(callsTo("invoice.findFirst")).toHaveLength(0);
  });

  it("a phone number with punctuation is matched digit to digit, inside this shop", async () => {
    handlers["$queryRaw"] = () => [{ id: "c9" }];
    handlers["customer.findMany"] = () => [{ id: "c9", firstName: "Priscilla", lastName: "Adeyemi", businessName: null, email: null, phone: "(512) 555-0178", mobile: null }];
    const body = await search("(512) 555-0178");
    const raw = callsTo("$queryRaw");
    expect(raw.length).toBeGreaterThan(0);
    expect(raw.every((call) => (call.args.values as unknown[])[0] === "shop_1")).toBe(true);
    expect(raw.some((call) => (call.args.values as unknown[]).includes("%5125550178%"))).toBe(true);
    const customers = body.groups.find((g: SearchGroup) => g.type === "customer");
    expect(customers.items[0]).toMatchObject({ title: "Priscilla Adeyemi", initials: "PA", subtitle: "(512) 555-0178" });
  });

  it("keeps every lookup inside the session's shop", async () => {
    handlers["product.findMany"] = () => [{ id: "p1", name: "Silicone Case - iPhone 14", sku: "ACC-1", stockQty: 4, active: true, priceCents: 2499, category: "Accessories", catalogImage: null, attachments: [] }];
    const body = await search("case");
    for (const path of ["customer.findMany", "ticket.findMany", "invoice.findMany", "estimate.findMany", "product.findMany", "productSerial.findMany", "lead.findMany"]) {
      expect((callsTo(path)[0].args.where as { shopId: string }).shopId).toBe("shop_1");
    }
    const products = body.groups.find((g: SearchGroup) => g.type === "product");
    expect(products.label).toBe("Products");
    expect(products.items[0]).toMatchObject({ price: "$24.99", subtitle: "4 in stock · SKU ACC-1" });
  });

  it("says 401 (not a redirect) when signed out", async () => {
    session.value = null;
    const res = await GET(new Request("http://x/api/app-search?q=elena"));
    expect(res.status).toBe(401);
  });
});
