import { describe, expect, it } from "vitest";

import { MissingIdError, assertIdPresent } from "@/lib/db-guard";

/**
 * lib/db-guard.ts runs inside the Prisma client for every query. These pin the
 * two halves of its contract: a present-but-undefined `id` is refused on the
 * operations where Prisma would silently widen it, and nothing else changes.
 */
describe("assertIdPresent", () => {
  it("refuses bulk writes and findFirst that name an undefined id", () => {
    for (const operation of ["updateMany", "deleteMany", "findFirst", "findFirstOrThrow"]) {
      expect(() =>
        assertIdPresent("Customer", operation, { where: { id: undefined, shopId: "s1" } }),
      ).toThrow(MissingIdError);
    }
  });

  it("lets a whole-shop query through — no id key at all is a real intent", () => {
    expect(() => assertIdPresent("Ticket", "updateMany", { where: { shopId: "s1" } })).not.toThrow();
    expect(() => assertIdPresent("Ticket", "deleteMany", {})).not.toThrow();
  });

  it("lets a real id, a null id and an id filter through", () => {
    for (const id of ["c1", null, { in: ["a", "b"] }, { not: "x" }]) {
      expect(() => assertIdPresent("Customer", "updateMany", { where: { id, shopId: "s1" } })).not.toThrow();
    }
  });

  it("does not interfere with operations Prisma already rejects on a missing id", () => {
    // `update`/`delete`/`findUnique` take a unique where — Prisma throws itself.
    for (const operation of ["update", "delete", "findUnique", "findMany", "create"]) {
      expect(() => assertIdPresent("Customer", operation, { where: { id: undefined } })).not.toThrow();
    }
  });
});
