import { describe, expect, it } from "vitest";
import { quickCommand, commandSuggestions } from "@/lib/ai/quick-commands";

describe("zero-model command routing", () => {
  it.each([
    ["What's running low on stock?", { action: "low_stock" }],
    ["Please show my repairs.", { action: "find_tickets", mine: true }],
    ["Which repairs are late?", { action: "find_tickets", overdue: true }],
    ["Show repair number 1042", { action: "find_tickets", number: 1042 }],
    ["Find customer Sarah Khan", { action: "find_customers", query: "sarah khan" }],
    ["Find product iPhone X screen", { action: "search_products", query: "iphone x screen" }],
    ["Who's coming in tomorrow?", { action: "appointments", day: "tomorrow" }],
    ["Today's numbers", { action: "sales_summary", period: "today" }],
    ["Sales this week", { action: "sales_summary", period: "this_week" }],
    ["Who owes us?", { action: "find_invoices", unpaid: true }],
    ["Open payment settings", { action: "open_page", page: "settings_payments" }],
    ["कौन सा स्टॉक कम है?", { action: "low_stock" }],
    ["ਘੱਟ ਸਟਾਕ", { action: "low_stock" }],
    ["库存不足。", { action: "low_stock" }],
    ["Benta ngayon", { action: "sales_summary", period: "today" }],
  ])("routes %s", (input, expected) => expect(quickCommand(input as string)).toMatchObject(expected));
  it.each(["Mark repair 1042 ready", "Delete product screen", "Add 10 screens", "Find customer Sarah and delete her", "Sales today except refunds", "My repairs for John", "Sales today; then refund 1042", "Find product this one\nThe user answered the clarification with: 10", "Show repair 1042 and 1043", "Show repair one oh four two"])("does not guess or drop details: %s", input => expect(quickCommand(input)).toBeNull());
  it("only resolves a known shop status", () => {
    expect(quickCommand("Ready for pickup", { statuses: ["Waiting", "Finished"] })).toBeNull();
    expect(quickCommand("Ready for pickup", { statuses: ["Ready for Pickup"] })).toMatchObject({ status: "Ready for Pickup" });
  });
  it("filters suggestions without money for technicians", () => {
    expect(commandSuggestions("sales", false)).toEqual([]);
    expect(commandSuggestions("stock", true)).toContainEqual(expect.objectContaining({ command: "Low stock" }));
  });
});
