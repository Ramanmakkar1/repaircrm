import { describe, expect, it } from "vitest";

import {
  REPAIR_STAGES,
  dayWords,
  deadline,
  deviceName,
  devicePicture,
  dueDayKey,
  dueWords,
  estimateWords,
  fewProblems,
  hoursLines,
  invoiceWords,
  linkExpiredWords,
  problemHint,
  publicShop,
  repairWords,
  shopInitials,
  telHref,
  whenWords,
} from "@/lib/portal-display";
import { DEFAULT_TICKET_STATUSES } from "@/components/tickets/ticket-meta";

/** Intl puts a narrow no-break space before AM/PM; compare on plain spaces. */
const plain = (text: string) => text.replace(/ /g, " ");

describe("repairWords: the shop's status in customer words", () => {
  it("maps every default status to one of four stages, in customer words", () => {
    const words = DEFAULT_TICKET_STATUSES.map((status) => [status, repairWords(status).label, repairWords(status).stage]);
    expect(words).toEqual([
      ["New", "Received", 0],
      ["In Progress", "We are fixing it", 1],
      ["Waiting for Parts", "Waiting for a part", 1],
      ["Waiting on Customer", "Waiting for your answer", 1],
      ["Ready for Pickup", "Ready to collect", 2],
      ["Resolved", "Done", 3],
    ]);
    expect(REPAIR_STAGES).toHaveLength(4);
  });

  it("never shows a staff word (Ready vs Ready for Pickup, In Progress) to the customer", () => {
    for (const status of DEFAULT_TICKET_STATUSES) {
      const label = repairWords(status).label;
      expect(label).not.toBe(status === "Ready for Pickup" ? "Ready" : status);
    }
  });

  it("flags the states where the shop is waiting on the customer", () => {
    expect(repairWords("Ready for Pickup").needsYou).toBe(true);
    expect(repairWords("Waiting on Customer").needsYou).toBe(true);
    expect(repairWords("Awaiting approval").needsYou).toBe(true);
    expect(repairWords("In Progress").needsYou).toBe(false);
  });

  it("reads a shop's own status names by their words, and never falls back to a dead end", () => {
    expect(repairWords("Diagnosing").stage).toBe(1);
    expect(repairWords("On the bench").stage).toBe(1);
    expect(repairWords("Parts ordered").label).toBe("Waiting for a part");
    expect(repairWords("Picked up").stage).toBe(3);
    expect(repairWords("Cancelled").stage).toBeNull();
    expect(repairWords("Cancelled").label).toBe("Closed");
  });

  it("names the device in the sentence when it is known", () => {
    expect(repairWords("Ready for Pickup", "iPhone 14 Pro").headline).toBe("Your iPhone 14 Pro is ready to collect");
    expect(repairWords("New").headline).toBe("We have your device");
  });
});

describe("deviceName and devicePicture", () => {
  it("prefers make and model, then the kind", () => {
    expect(deviceName({ type: "Phone", make: "Apple", model: "iPhone 14" })).toBe("Apple iPhone 14");
    expect(deviceName({ type: "Laptop", make: null, model: null })).toBe("Laptop");
    expect(deviceName(null)).toBeNull();
  });

  it("finds a family picture and falls back to the toolbox", () => {
    expect(devicePicture({ type: "Phone", make: "Apple", model: "iPhone 14" })).toMatch(/^\/images\//);
    expect(devicePicture(null)).toBe("/images/products/repair-tools.webp");
  });
});

describe("dates in the shop's own zone", () => {
  // 2026-10-04 04:30 UTC is still Oct 3 (23:30) in Chicago and 22:30 Oct 3 in Edmonton.
  const now = Date.UTC(2026, 9, 4, 4, 30);

  it("reads a date picked in a form (UTC midnight) as that calendar day, in any zone", () => {
    const picked = new Date("2026-10-06T00:00:00.000Z");
    expect(dueDayKey(picked, "America/Edmonton")).toBe("2026-10-06");
    expect(dueDayKey(picked, "Asia/Tokyo")).toBe("2026-10-06");
  });

  it("reads any other instant on the shop's wall calendar", () => {
    const instant = new Date("2026-10-07T03:00:00.000Z"); // Oct 6, 9pm in Edmonton
    expect(dueDayKey(instant, "America/Edmonton")).toBe("2026-10-06");
    expect(dueDayKey(instant, "UTC")).toBe("2026-10-07");
  });

  it("says due today / tomorrow / a date / was due, against the SHOP's today, not the server's", () => {
    // In UTC it is already Oct 4; in Edmonton it is still Oct 3.
    expect(dueWords(new Date("2026-10-03T00:00:00.000Z"), now, "America/Edmonton").text).toBe("Due today");
    expect(dueWords(new Date("2026-10-03T00:00:00.000Z"), now, "UTC").text).toBe("Was due Oct 3");
    expect(dueWords(new Date("2026-10-04T00:00:00.000Z"), now, "America/Edmonton").text).toBe("Due tomorrow");
    expect(dueWords(new Date("2026-10-06T00:00:00.000Z"), now, "America/Edmonton")).toEqual({ state: "later", text: "Due Oct 6" });
    expect(dueWords(new Date("2027-01-02T00:00:00.000Z"), now, "America/Edmonton").text).toBe("Due Jan 2, 2027");
    expect(deadline(new Date("2026-10-01T00:00:00.000Z"), now, "America/Edmonton")).toEqual({ state: "overdue", day: "Oct 1" });
  });

  it("puts a time on the shop's clock with Today / Yesterday words", () => {
    const at = new Date(Date.UTC(2026, 9, 4, 1, 15)); // Oct 3, 7:15 PM in Edmonton
    expect(plain(whenWords(at, now, "America/Edmonton"))).toBe("Today, 7:15 PM");
    expect(plain(whenWords(at, now, "UTC"))).toBe("Today, 1:15 AM");
    const yesterday = new Date(Date.UTC(2026, 9, 2, 20, 0)); // Oct 2, 2 PM in Edmonton
    expect(plain(whenWords(yesterday, now, "America/Edmonton"))).toBe("Yesterday, 2:00 PM");
    const older = new Date(Date.UTC(2026, 8, 23, 18, 30));
    expect(plain(whenWords(older, now, "America/Edmonton"))).toBe("Sep 23, 12:30 PM");
    expect(dayWords(older, now, "America/Edmonton")).toBe("Sep 23");
  });

  it("falls back to UTC for a zone the database got wrong, instead of throwing", () => {
    expect(() => whenWords(new Date(now), now, "Not/AZone")).not.toThrow();
  });
});

describe("invoiceWords: the badge comes from the balance", () => {
  const now = Date.UTC(2026, 9, 4, 18, 0);
  const zone = "America/Edmonton";

  it("a fully paid invoice whose stored status is still SENT reads Paid, never Sent", () => {
    // Seed invoice #1012: SENT, 3788 of 3788 cents paid.
    const words = invoiceWords({ status: "SENT", totalCents: 3788, paidCents: 3788, dueDate: null, nowMs: now, zone });
    expect(words).toEqual({ label: "Paid", tone: "success" });
  });

  it("an unpaid bill says when it is due, in the shop's calendar", () => {
    expect(invoiceWords({ status: "SENT", totalCents: 2705, paidCents: 0, dueDate: new Date("2026-10-06T00:00:00.000Z"), nowMs: now, zone }).label).toBe("Due Oct 6");
    expect(invoiceWords({ status: "SENT", totalCents: 2705, paidCents: 0, dueDate: new Date("2026-10-02T00:00:00.000Z"), nowMs: now, zone })).toEqual({ label: "Overdue", tone: "danger" });
    expect(invoiceWords({ status: "PARTIAL", totalCents: 2705, paidCents: 1000, dueDate: null, nowMs: now, zone }).label).toBe("Part paid");
    expect(invoiceWords({ status: "SENT", totalCents: 2705, paidCents: 0, dueDate: null, nowMs: now, zone }).label).toBe("To pay");
  });

  it("a status of PAID that still owes money follows the money", () => {
    expect(invoiceWords({ status: "PAID", totalCents: 5000, paidCents: 3000, dueDate: null, nowMs: now, zone }).label).toBe("Part paid");
  });

  it("void and zero-value bills ask for nothing", () => {
    expect(invoiceWords({ status: "VOID", totalCents: 5000, paidCents: 0, dueDate: null, nowMs: now, zone }).label).toBe("Cancelled");
    expect(invoiceWords({ status: "SENT", totalCents: 0, paidCents: 0, dueDate: null, nowMs: now, zone }).label).toBe("Nothing to pay");
  });
});

describe("estimateWords", () => {
  it("never says Sent or Converted to a customer", () => {
    expect(estimateWords("SENT").label).toBe("Waiting for your answer");
    expect(estimateWords("CONVERTED").label).toBe("Approved");
    expect(estimateWords("APPROVED").label).toBe("You said yes");
    expect(estimateWords("DECLINED").label).toBe("You said no");
  });
});

describe("shop contact", () => {
  it("dials digits only", () => {
    expect(telHref("(512) 555-0142")).toBe("tel:5125550142");
    expect(telHref("+44 20 7946 0958")).toBe("tel:+442079460958");
  });

  it("keeps hours as lines and drops blanks", () => {
    expect(hoursLines("Mon–Fri 9–6\n\n  Sat 10–4 \r\n")).toEqual(["Mon–Fri 9–6", "Sat 10–4"]);
    expect(hoursLines(null)).toEqual([]);
  });

  it("builds the public face from a shop row: address, map link, hours, a safe zone", () => {
    const shop = publicShop({
      name: "Demo Repair Shop",
      phone: " (512) 555-0142 ",
      logoUrl: "",
      address1: "1420 E 6th Street",
      city: "Austin",
      state: "TX",
      postalCode: "78702",
      timezone: "Nowhere/Invalid",
      settings: { publicHub: { hours: "Mon–Fri 9–6" } },
    });
    expect(shop.phone).toBe("(512) 555-0142");
    expect(shop.logoUrl).toBeNull();
    expect(shop.address).toBe("1420 E 6th Street · Austin, TX · 78702");
    expect(shop.mapUrl).toContain("google.com/maps");
    expect(shop.hours).toEqual(["Mon–Fri 9–6"]);
    expect(shop.timezone).toBe("UTC");
  });

  it("gives an unbranded shop two initials", () => {
    expect(shopInitials("Demo Repair Shop")).toBe("DR");
    expect(shopInitials("  ")).toBe("?");
  });
});

describe("problem boxes for a customer", () => {
  it("never cuts Other when it trims a long list", () => {
    const options = Array.from({ length: 15 }, (_, index) => `Problem ${index}`).concat("Other Repair");
    const few = fewProblems(options);
    expect(few).toHaveLength(12);
    expect(few[few.length - 1]).toBe("Other Repair");
    expect(fewProblems(["Screen", "Other"])).toEqual(["Screen", "Other"]);
  });

  it("explains shop words in customer words", () => {
    expect(problemHint("Diagnostic")).toBe("Not sure what is wrong");
    expect(problemHint("Screen Repair")).toBe("Cracked, black or not responding");
    expect(problemHint("Other Repair")).toBe("Something else");
  });
});

describe("linkExpiredWords: dead document links talk about the document", () => {
  it("says payment link for an invoice and estimate for an estimate, never the generic sign-in error", () => {
    expect(linkExpiredWords("invoice").title).toBe("This payment link has expired");
    expect(linkExpiredWords("invoice").body).toContain("Ask the shop for a new one");
    expect(linkExpiredWords("estimate").title).toBe("This estimate link has expired");
    expect(linkExpiredWords("anything").title).toBe("This link has expired");
    for (const doc of ["invoice", "estimate", "x"]) {
      expect(linkExpiredWords(doc).body).not.toMatch(/sign-in link/);
    }
  });
});
