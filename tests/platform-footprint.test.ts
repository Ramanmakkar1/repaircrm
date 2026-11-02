import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CHILD_TABLES,
  footprintQuery,
  footprintSources,
  groupFootprint,
  quoteIdent,
  tableLabel,
} from "@/lib/platform-footprint";

const columns = (table: string, ...names: string[]) => names.map((column) => ({ table, column }));

const CATALOG = [
  ...columns("Shop", "id", "name"),
  ...columns("Ticket", "id", "shopId", "subject"),
  ...columns("Invoice", "id", "shopId"),
  ...columns("InvoiceLine", "id", "invoiceId"),
  ...columns("Customer", "id", "shopId"),
  ...columns("Contact", "id", "customerId"),
  ...columns("UsageCounter", "shopId", "key", "day"),
  ...columns("ProductFeedback", "id", "reporterShopId"),
  ...columns("_prisma_migrations", "id"),
  ...columns('Evil"; DROP TABLE "Shop', "shopId"),
];

describe("what gets counted", () => {
  const sources = footprintSources(CATALOG);

  it("counts the shop row, every table with a shopId, and child rows through their parent", () => {
    expect(sources).toEqual([
      { kind: "shop", table: "Shop" },
      { kind: "tenant", table: "Customer" },
      { kind: "tenant", table: "Invoice" },
      { kind: "tenant", table: "Ticket" },
      { kind: "child", table: "InvoiceLine", parent: "Invoice", key: "invoiceId" },
      { kind: "child", table: "Contact", parent: "Customer", key: "customerId" },
    ]);
  });

  it("leaves out platform tables, the shopless usage buckets and any name that is not a plain identifier", () => {
    const names = sources.map((source) => source.table);
    expect(names).not.toContain("UsageCounter");
    expect(names).not.toContain("ProductFeedback");
    expect(names).not.toContain("_prisma_migrations");
    expect(names.some((name) => name.includes("DROP"))).toBe(false);
  });

  it("skips a child table whose parent or link column is missing", () => {
    expect(footprintSources([...columns("InvoiceLine", "id", "invoiceId")])).toEqual([]);
    expect(footprintSources([...columns("Invoice", "id", "shopId"), ...columns("InvoiceLine", "id")])).toEqual([
      { kind: "tenant", table: "Invoice" },
    ]);
  });

  it("knows every child table the schema documents as reached through a parent", () => {
    const schema = readFileSync(fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url)), "utf8");
    for (const child of CHILD_TABLES) {
      const model = new RegExp(`model ${child.table} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
      expect(model, child.table).toContain(`${child.key} `);
      expect(model, child.table).not.toMatch(/\n\s+shopId\s/);
      const parent = new RegExp(`model ${child.parent} \\{([\\s\\S]*?)\\n\\}`).exec(schema)?.[1] ?? "";
      expect(parent, child.parent).toMatch(/\n\s+shopId\s/);
    }
  });
});

describe("the one query", () => {
  it("is one UNION ALL with quoted identifiers and the table names as bound values", () => {
    const query = footprintQuery(footprintSources(CATALOG));
    expect(query).not.toBeNull();
    const text = query!.sql;
    expect(text.match(/UNION ALL/g)).toHaveLength(5);
    expect(text).toContain('FROM "Ticket" t GROUP BY t."shopId"');
    expect(text).toContain('FROM "InvoiceLine" t JOIN "Invoice" p ON p."id" = t."invoiceId" GROUP BY p."shopId"');
    expect(text).toContain('FROM "Shop" t GROUP BY t."id"');
    expect(text).toContain("pg_column_size(t.*)");
    expect(query!.values).toEqual(["Shop", "Customer", "Invoice", "Ticket", "InvoiceLine", "Contact"]);
  });

  it("is null when there is nothing to count", () => {
    expect(footprintQuery([])).toBeNull();
    expect(footprintQuery([{ kind: "tenant", table: "bad name" }])).toBeNull();
  });

  it("refuses identifiers that could break out of their quotes", () => {
    expect(quoteIdent("Ticket")).toBe('"Ticket"');
    expect(quoteIdent("_prisma_migrations")).toBe('"_prisma_migrations"');
    for (const bad of ['Ticket"; DROP TABLE x; --', "two words", "", "1Ticket", "x".repeat(64)]) {
      expect(quoteIdent(bad)).toBeNull();
    }
  });
});

describe("adding it up per shop", () => {
  it("totals rows and bytes per shop and lists the biggest tables first", () => {
    const shops = groupFootprint([
      { table: "Ticket", shopId: "s1", rows: BigInt(10), bytes: BigInt(4_000) },
      { table: "Customer", shopId: "s1", rows: 3, bytes: 900 },
      { table: "InvoiceLine", shopId: "s1", rows: BigInt(30), bytes: BigInt(6_000) },
      { table: "Ticket", shopId: "s2", rows: 1, bytes: 300 },
    ]);
    expect(shops.get("s1")).toEqual({
      rows: 43,
      bytes: 10_900,
      tables: [
        { table: "InvoiceLine", label: "Invoice lines", rows: 30, bytes: 6_000 },
        { table: "Ticket", label: "Repairs", rows: 10, bytes: 4_000 },
        { table: "Customer", label: "Customers", rows: 3, bytes: 900 },
      ],
    });
    expect(shops.get("s2")?.bytes).toBe(300);
  });

  it("merges two rows for the same table and ignores empty or shopless rows", () => {
    const shops = groupFootprint([
      { table: "Contact", shopId: "s1", rows: 2, bytes: 100 },
      { table: "Contact", shopId: "s1", rows: 1, bytes: 50 },
      { table: "Ticket", shopId: null, rows: 5, bytes: 500 },
      { table: "Ticket", shopId: "s1", rows: 0, bytes: null },
    ]);
    expect(shops.get("s1")).toEqual({ rows: 3, bytes: 150, tables: [{ table: "Contact", label: "Customer contacts", rows: 3, bytes: 150 }] });
    expect(shops.size).toBe(1);
  });

  it("names record types in words an owner knows", () => {
    expect(tableLabel("Ticket")).toBe("Repairs");
    expect(tableLabel("AuditLog")).toBe("Activity log");
    expect(tableLabel("RecurringInvoiceLine")).toBe("Recurring invoice line");
  });
});
