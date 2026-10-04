import { describe, expect, it } from "vitest";

import {
  balanceBlock,
  docTabHref,
  docTabs,
  estimateActivity,
  estimatePrimaryLabel,
  estimateTiles,
  invoiceActivity,
  invoicePrimaryLabel,
  invoiceTiles,
  lineRow,
  messageOutcome,
  parseDocTab,
  quoteBlock,
  tilesLayoutClass,
} from "@/components/billing/bill-display";
import { estimatePrimaryAction, invoicePrimaryAction } from "@/components/billing/primary-action";

/** Friday 3 Oct 2026, midday UTC: the same "today" the list-card tests use. */
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const sent = {
  status: "SENT",
  totalCents: 45000,
  paidCents: 0,
  refundedCents: 0,
  balanceCents: 45000,
  dueDate: day(2026, 10, 2),
  paidAt: null,
};

describe("balanceBlock (the hero of the invoice screen)", () => {
  it("says the amount due and how late it is, in words", () => {
    const block = balanceBlock(sent, NOW);
    expect(block.state).toBe("overdue");
    expect(block.figure).toBe("$450.00");
    expect(block.word).toBe("due");
    expect(block.headline).toBe("$450.00 due");
    expect(block.when).toBe("Overdue since Oct 2 · 1 day late");
    expect(block.whenTone).toBe("alert");
    expect(block.collected).toBe("Nothing collected yet");
  });

  it("counts the days in the plural", () => {
    const block = balanceBlock({ ...sent, dueDate: day(2026, 9, 21) }, NOW);
    expect(block.when).toBe("Overdue since Sep 21 · 12 days late");
  });

  it("is plainly due, not overdue, before the due day", () => {
    const block = balanceBlock({ ...sent, dueDate: day(2026, 10, 12) }, NOW);
    expect(block.state).toBe("due");
    expect(block.when).toBe("Due Oct 12");
    expect(block.whenTone).toBe("plain");
  });

  it("says Due today on the due day itself, and Due on receipt with no date", () => {
    const today = balanceBlock({ ...sent, dueDate: day(2026, 10, 3) }, NOW);
    expect(today.state).toBe("overdue");
    expect(today.when).toBe("Due today");
    const none = balanceBlock({ ...sent, dueDate: null }, NOW);
    expect(none.state).toBe("due");
    expect(none.when).toBe("Due on receipt");
  });

  it("shows only what is left on a part-paid bill, and what has come in so far", () => {
    const block = balanceBlock(
      { ...sent, status: "PARTIAL", totalCents: 5410, paidCents: 2705, balanceCents: 2705, dueDate: null },
      NOW,
    );
    expect(block.headline).toBe("$27.05 due");
    expect(block.collected).toBe("Collected so far $27.05 of $54.10");
  });

  it("names a refund instead of reading as if nothing had been taken back", () => {
    const block = balanceBlock(
      { ...sent, status: "PARTIAL", totalCents: 5410, paidCents: 5410, refundedCents: 2705, balanceCents: 2705, dueDate: null },
      NOW,
    );
    // The refund is why it owes: said in words, not left to look like an unpaid bill.
    expect(block.headline).toBe("$27.05 owing again");
    expect(block.word).toBe("owing again");
    expect(block.collected).toBe("Collected $54.10, refunded $27.05");
  });

  it("is Paid in full with the day it was paid and no figure", () => {
    const block = balanceBlock(
      { ...sent, status: "PAID", paidCents: 45000, balanceCents: 0, paidAt: day(2026, 9, 25) },
      NOW,
    );
    expect(block.state).toBe("paid");
    expect(block.figure).toBeNull();
    expect(block.headline).toBe("Paid in full");
    expect(block.when).toBe("Paid Sep 25");
    expect(block.whenTone).toBe("good");
    expect(block.collected).toBe("Collected $450.00");
  });

  it("is never overdue once nothing is owed, even past the due date", () => {
    const block = balanceBlock({ ...sent, status: "PAID", paidCents: 45000, balanceCents: 0, paidAt: null }, NOW);
    expect(block.state).toBe("paid");
    expect(block.when).toBe("Nothing left to pay");
  });

  it("says so when the customer overpaid", () => {
    const block = balanceBlock({ ...sent, status: "PAID", paidCents: 50000, balanceCents: -5000, paidAt: day(2026, 9, 25) }, NOW);
    expect(block.state).toBe("paid");
    expect(block.when).toBe("Overpaid by $50.00");
  });

  it("is a Draft with no balance and the total beside it", () => {
    const block = balanceBlock({ ...sent, status: "DRAFT" }, NOW);
    expect(block.state).toBe("draft");
    expect(block.figure).toBeNull();
    expect(block.headline).toBe("Draft");
    expect(block.when).toBe("Not sent yet");
    expect(block.collected).toBe("Total $450.00");
  });

  it("is Voided with nothing owed", () => {
    const block = balanceBlock({ ...sent, status: "VOID" }, NOW);
    expect(block.state).toBe("void");
    expect(block.headline).toBe("Voided");
    expect(block.when).toBe("Nothing is owed on this invoice");
    expect(block.figure).toBeNull();
  });

  it("puts the year on a date from another year", () => {
    const block = balanceBlock({ ...sent, dueDate: day(2025, 12, 31) }, NOW);
    expect(block.when).toContain("Dec 31, 2025");
  });
});

describe("quoteBlock (the hero of the estimate screen)", () => {
  const quote = { status: "SENT", totalCents: 16549, expiresAt: day(2026, 10, 10), approvedAt: null, expired: false };

  it("shows the quoted total, where it stands and when it expires", () => {
    const block = quoteBlock(quote, NOW);
    expect(block.figure).toBe("$165.49");
    expect(block.word).toBe("estimate");
    expect(block.state).toBe("Waiting for a yes");
    expect(block.when).toBe("Expires Oct 10");
  });

  it("flags an expired open quote in words", () => {
    const block = quoteBlock({ ...quote, expiresAt: day(2026, 10, 1), expired: true }, NOW);
    expect(block.when).toBe("Expired Oct 1");
    expect(block.whenTone).toBe("alert");
  });

  it("shows the approval day on an approved or converted quote, and no expiry", () => {
    const approved = quoteBlock({ ...quote, status: "APPROVED", approvedAt: day(2026, 9, 24) }, NOW);
    expect(approved.state).toBe("Ready to bill");
    expect(approved.when).toBe("Approved Sep 24");
    const converted = quoteBlock({ ...quote, status: "CONVERTED", approvedAt: day(2026, 9, 24) }, NOW);
    expect(converted.state).toBe("Now an invoice");
  });

  it("has nothing to say about dates on a declined or new draft quote with no expiry", () => {
    expect(quoteBlock({ ...quote, status: "DECLINED" }, NOW).when).toBeNull();
    expect(quoteBlock({ ...quote, status: "DRAFT", expiresAt: null }, NOW).state).toBe("Not sent yet");
    expect(quoteBlock({ ...quote, status: "DRAFT", expiresAt: null }, NOW).when).toBeNull();
  });
});

describe("the one big button, by state", () => {
  const send = { alreadySent: true, receiptable: false };

  it("labels each invoice state from the action the page already chose", () => {
    const label = (input: Parameters<typeof invoicePrimaryAction>[0], extra = send) =>
      invoicePrimaryLabel(invoicePrimaryAction(input), extra);
    expect(label({ status: "SENT", voided: false, canTakePayment: true })).toBe("Take payment");
    expect(label({ status: "PARTIAL", voided: false, canTakePayment: true })).toBe("Take payment");
    expect(label({ status: "DRAFT", voided: false, canTakePayment: true }, { alreadySent: false, receiptable: false })).toBe("Send");
    expect(label({ status: "PAID", voided: false, canTakePayment: false }, { alreadySent: true, receiptable: true })).toBe("Print receipt");
    expect(label({ status: "PAID", voided: false, canTakePayment: false })).toBe("Print");
    expect(label({ status: "VOID", voided: true, canTakePayment: false })).toBeNull();
  });

  it("labels each estimate state", () => {
    const label = (status: string, canConvert: boolean, invoiceNumber: number | null = null) =>
      estimatePrimaryLabel(estimatePrimaryAction({ status, canConvert, hasInvoice: invoiceNumber !== null }), {
        alreadySent: status !== "DRAFT",
        invoiceNumber,
        declined: status === "DECLINED",
      });
    expect(label("DRAFT", true)).toBe("Send");
    expect(label("SENT", true)).toBe("Customer said yes");
    expect(label("APPROVED", true)).toBe("Convert to invoice");
    expect(label("CONVERTED", false, 1001)).toBe("Open invoice #1001");
    expect(label("CONVERTED", false)).toBeNull();
    expect(label("DECLINED", false)).toBe("They said yes after all");
  });
});

describe("the quick tiles", () => {
  it("never repeats the big button as a tile, and keeps Send and Message together", () => {
    const due = invoiceTiles({ primary: "pay", voided: false, receiptable: false });
    expect(due).toEqual(["send", "message", "print", "copy", "more"]);
    const draft = invoiceTiles({ primary: "send", voided: false, receiptable: false });
    expect(draft).toEqual(["edit", "print", "copy", "more"]);
    // Paid with money taken: the big button prints the counter slip, so the
    // letter invoice is its own "Print invoice" tile beside "Send receipt".
    const paid = invoiceTiles({ primary: "print", voided: false, receiptable: true });
    expect(paid).toEqual(["receipt", "print", "send", "message", "copy", "more"]);
    // Paid with nothing taken: the big button IS the letter print, never repeated.
    expect(invoiceTiles({ primary: "print", voided: false, receiptable: false })).not.toContain("print");
  });

  it("offers no receipt tile when there is nothing to receipt, and nothing to share on a voided bill", () => {
    expect(invoiceTiles({ primary: "print", voided: false, receiptable: false })).not.toContain("receipt");
    expect(invoiceTiles({ primary: "none", voided: true, receiptable: false })).toEqual(["print", "more"]);
  });

  it("gives every state of an estimate a way to print, copy the link and reach More", () => {
    for (const status of ["DRAFT", "SENT", "APPROVED", "DECLINED", "CONVERTED"]) {
      const primary = estimatePrimaryAction({ status, canConvert: status !== "CONVERTED", hasInvoice: status === "CONVERTED" });
      const tiles = estimateTiles({ primary, status });
      expect(tiles).toContain("print");
      expect(tiles).toContain("copy");
      expect(tiles).toContain("more");
    }
  });

  it("freezes a converted quote: no send, no edit", () => {
    expect(estimateTiles({ primary: "invoice", status: "CONVERTED" })).toEqual(["print", "copy", "more"]);
  });

  it("puts what makes sense now in front: sign for a sent quote, never send again for a declined or approved one", () => {
    expect(estimateTiles({ primary: "approve", status: "SENT" })).toEqual(["sign", "send", "message", "print", "copy", "more"]);
    expect(estimateTiles({ primary: "approve", status: "DECLINED" })).toEqual(["edit", "print", "copy", "more"]);
    expect(estimateTiles({ primary: "convert", status: "APPROVED" })).not.toContain("send");
    expect(estimateTiles({ primary: "convert", status: "APPROVED" })).not.toContain("message");
  });

  it("lays four tiles out as a square and any other number as wrapping rows", () => {
    expect(tilesLayoutClass(4)).toContain("grid-cols-2");
    expect(tilesLayoutClass(5)).toContain("flex-wrap");
    expect(tilesLayoutClass(3)).toContain("flex-wrap");
  });
});

describe("tabs", () => {
  it("reads ?tab= and falls back to the first tab for anything else", () => {
    expect(parseDocTab("customer")).toBe("customer");
    expect(parseDocTab("activity")).toBe("activity");
    expect(parseDocTab("share")).toBe("share");
    expect(parseDocTab("bill")).toBe("bill");
    expect(parseDocTab(undefined)).toBe("bill");
    expect(parseDocTab("<script>")).toBe("bill");
    expect(parseDocTab(["share", "customer"])).toBe("share");
  });

  it("keeps the first tab on the plain path", () => {
    expect(docTabHref("/invoices/abc", "bill")).toBe("/invoices/abc");
    expect(docTabHref("/invoices/abc", "share")).toBe("/invoices/abc?tab=share");
  });

  it("names the first tab Bill or Quote and marks only the current one", () => {
    const tabs = docTabs("/estimates/e1", "activity", "Quote");
    expect(tabs.map((tab) => tab.label)).toEqual(["Quote", "Customer", "Activity", "Share"]);
    expect(tabs.filter((tab) => tab.active).map((tab) => tab.label)).toEqual(["Activity"]);
    expect(docTabs("/invoices/i1", "bill", "Bill")[0]).toMatchObject({ label: "Bill", href: "/invoices/i1", active: true });
  });
});

describe("lineRow", () => {
  it("shows quantity x rate, the amount, and the tax flag in words", () => {
    expect(lineRow({ description: "Screen protector", quantity: 2, unitPriceCents: 6000, taxable: true })).toEqual({
      description: "Screen protector",
      serial: null,
      qtyLine: "2 × $60.00",
      amountCents: 12000,
      tax: "Taxable",
    });
    expect(lineRow({ description: "Labour", quantity: 1, unitPriceCents: 7500, taxable: false }).tax).toBe("No tax");
  });

  it("keeps a serial number and drops a blank one", () => {
    expect(lineRow({ description: "SSD", quantity: 1, unitPriceCents: 12900, taxable: true, serial: " NV-7734-KX " }).serial).toBe("NV-7734-KX");
    expect(lineRow({ description: "SSD", quantity: 1, unitPriceCents: 12900, taxable: true, serial: "  " }).serial).toBeNull();
    expect(lineRow({ description: "SSD", quantity: 1, unitPriceCents: 12900, taxable: true, serial: null }).serial).toBeNull();
  });
});

describe("messageOutcome", () => {
  it("reads the raw log status in words", () => {
    expect(messageOutcome("sent")).toEqual({ text: "Sent", alert: false });
    expect(messageOutcome("logged")).toEqual({ text: "Sent", alert: false });
    expect(messageOutcome("skipped: opted out")).toEqual({ text: "Not sent: opted out", alert: true });
    expect(messageOutcome("failed: mailbox full")).toEqual({ text: "Failed: mailbox full", alert: true });
    expect(messageOutcome("failed")).toEqual({ text: "Failed", alert: true });
    expect(messageOutcome("bounced")).toEqual({ text: "Bounced", alert: true });
  });
});

describe("activity feeds", () => {
  const at = (h: number) => new Date(Date.UTC(2026, 8, 19, h, 0, 0));

  it("lists an invoice's life newest first, with money signed", () => {
    const items = invoiceActivity({
      createdAt: at(8),
      paidAt: at(14),
      settled: true,
      payments: [{ id: "p1", createdAt: at(14), amountCents: 5410, label: "Card (reader)", takenBy: "Priya Shah" }],
      refunds: [{ id: "r1", createdAt: at(16), amountCents: 2705, reason: "Returned unopened", failed: false, takenBy: "Priya Shah" }],
      messages: [
        { id: "m1", createdAt: at(9), type: "EMAIL", direction: "OUT", to: "a@b.co", subject: "Invoice #1", status: "sent" },
        { id: "m2", createdAt: at(10), type: "SMS", direction: "OUT", to: "+15125550100", subject: null, status: "skipped: opted out" },
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["refund-r1", "pay-p1", "paid", "msg-m2", "msg-m1", "created"]);
    const refund = items[0];
    expect(refund.amount).toBe("−$27.05");
    expect(refund.detail).toBe("Returned unopened · By Priya Shah");
    expect(items[1].title).toBe("Payment taken: Card (reader)");
    expect(items[1].amount).toBe("$54.10");
    const skipped = items[3];
    expect(skipped.title).toBe("Texted to +15125550100");
    expect(skipped.kind).toBe("sms");
    expect(skipped.outcome).toBe("Not sent: opted out");
    expect(skipped.alert).toBe(true);
    expect(items[4].title).toBe("Emailed to a@b.co");
    expect(items[4].detail).toBe("Invoice #1");
    expect(items[4].outcome).toBe("Sent");
  });

  it("leaves out the Paid in full entry until the invoice is settled", () => {
    const base = { createdAt: at(8), paidAt: at(14), payments: [], refunds: [], messages: [] };
    expect(invoiceActivity({ ...base, settled: false }).map((item) => item.key)).toEqual(["created"]);
    expect(invoiceActivity({ ...base, settled: true }).map((item) => item.key)).toEqual(["paid", "created"]);
  });

  it("puts the record being written last when something happened in the same moment", () => {
    const items = invoiceActivity({
      createdAt: at(8),
      paidAt: null,
      settled: false,
      payments: [{ id: "p1", createdAt: at(8), amountCents: 100, label: "Cash", takenBy: null }],
      refunds: [],
      messages: [],
    });
    expect(items.map((item) => item.key)).toEqual(["pay-p1", "created"]);
  });

  it("flags a refund that did not go through", () => {
    const items = invoiceActivity({
      createdAt: at(8),
      paidAt: null,
      settled: false,
      payments: [],
      refunds: [{ id: "r1", createdAt: at(9), amountCents: 100, reason: null, failed: true, takenBy: null }],
      messages: [],
    });
    expect(items[0].alert).toBe(true);
    expect(items[0].outcome).toBe("Failed: nothing was returned");
  });

  it("lists a quote's life: written, sent, approved and the invoice it became", () => {
    const items = estimateActivity({
      createdAt: at(8),
      approvedAt: at(12),
      messages: [{ id: "m1", createdAt: at(9), type: "EMAIL", direction: "OUT", to: "d@b.co", subject: "Estimate #1001", status: "bounced" }],
      invoices: [
        { id: "i1", number: 1001, createdAt: at(13) },
        { id: "i2", number: 1002, createdAt: null },
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["inv-i1", "approved", "msg-m1", "created"]);
    expect(items[0].title).toBe("Turned into invoice #1001");
    expect(items[2].outcome).toBe("Bounced");
    expect(items[2].alert).toBe(true);
  });
});
