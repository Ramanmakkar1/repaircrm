import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, fakeClient, handlers, resetDb } from "./helpers/db-mock";

vi.mock("@/lib/db", () => ({ db: fakeClient }));

import {
  customerIdsByPhone,
  customerMatchClauses,
  documentNumber,
  phoneQueryDigits,
} from "@/lib/customers/phone-search";

beforeEach(resetDb);

describe("phoneQueryDigits", () => {
  it("reads a phone number however it was typed", () => {
    expect(phoneQueryDigits("5125550178")).toBe("5125550178");
    expect(phoneQueryDigits("(512) 555-0178")).toBe("5125550178");
    expect(phoneQueryDigits("+1 512.555.0178")).toBe("15125550178");
    expect(phoneQueryDigits("555-0178")).toBe("5550178");
  });

  it("leaves words, devices and short numbers alone", () => {
    expect(phoneQueryDigits("iphone 12")).toBeNull();
    expect(phoneQueryDigits("elena")).toBeNull();
    expect(phoneQueryDigits("104")).toBeNull();
  });
});

describe("documentNumber", () => {
  it("reads a ticket or invoice number", () => {
    expect(documentNumber("#1042")).toBe(1042);
    expect(documentNumber("1042")).toBe(1042);
  });

  it("refuses a phone number, which would overflow the Int column", () => {
    expect(documentNumber("5125550178")).toBeNull();
    expect(documentNumber("12 main st")).toBeNull();
  });
});

describe("customerIdsByPhone", () => {
  it("compares digits inside the shop", async () => {
    handlers["$queryRaw"] = () => [{ id: "c1" }];
    expect(await customerIdsByPhone("s1", "5125550178")).toEqual(["c1"]);
    expect(callsTo("$queryRaw")[0].args.values).toEqual(["s1", "%5125550178%", "%5125550178%", 50]);
  });

  it("does not query for a fragment too short to be a phone", async () => {
    expect(await customerIdsByPhone("s1", "12")).toEqual([]);
    expect(callsTo("$queryRaw")).toHaveLength(0);
  });
});

describe("customerMatchClauses", () => {
  it("adds the phone matches to the name and email clauses", async () => {
    handlers["$queryRaw"] = () => [{ id: "c1" }];
    const clauses = await customerMatchClauses("s1", "512 555 0178");
    expect(clauses).toContainEqual({ id: { in: ["c1"] } });
  });

  it("never touches SQL for a name", async () => {
    const clauses = await customerMatchClauses("s1", "elena");
    expect(clauses).toHaveLength(4);
    expect(callsTo("$queryRaw")).toHaveLength(0);
  });
});
