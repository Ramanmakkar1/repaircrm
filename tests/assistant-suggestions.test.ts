import { beforeEach, expect, it, vi } from "vitest";
import { handlers, resetDb, whereOf, calls } from "./helpers/db-mock";
import { clearRateLimit } from "@/lib/rate-limit";
vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(async () => ({ shopId: "s1", userId: "u1" })) }));
const { assistantSuggestions } = await import("@/app/(app)/assistant/suggestions");
beforeEach(() => { resetDb(); clearRateLimit("assistant-suggest:s1:u1"); });
it("keeps product autocomplete inside the signed-in shop and excludes inactive stock", async () => {
  handlers["product.findMany"] = () => [{ name: "iPhone X Screen", stockQty: 20 }];
  expect(await assistantSuggestions("Find product iPhone")).toEqual([{ label: "iPhone X Screen", command: "Find product iPhone X Screen", detail: "20 in stock" }]);
  expect(whereOf("product.findMany")).toMatchObject({ shopId: "s1", active: true });
});
it("scopes customer and ticket lookups to the shop without returning contact information", async () => {
  handlers["customer.findMany"] = () => [{ firstName: "Sarah", lastName: "Khan", businessName: null }];
  handlers["ticket.findMany"] = () => [{ number: 1042, subject: "Screen repair" }];
  expect(await assistantSuggestions("Find customer Sarah")).toHaveLength(1);
  expect(await assistantSuggestions("Show repair 1042")).toHaveLength(1);
  expect(whereOf("customer.findMany")).toMatchObject({ shopId: "s1" });
  expect(whereOf("ticket.findMany")).toEqual({ shopId: "s1", number: 1042 });
});
it("does not query for incomplete, oversized or mutation requests", async () => {
  for (const input of ["Find customer S", "Add 10 screens", "x".repeat(181)]) expect(await assistantSuggestions(input)).toEqual([]);
  expect(calls).toHaveLength(0);
});
