import { describe, expect, it } from "vitest";

import {
  buildViewCounts,
  deviceName,
  dueWords,
  pickIntakePhotoId,
  repairChips,
  repairEmpty,
  repairFacts,
  repairNextStep,
  repairSubtitle,
  repairViews,
  viewCount,
  viewIsActive,
  viewPatch,
} from "@/components/tickets/repair-card-facts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 9, 3, 12, 0, 0);

describe("dueWords", () => {
  it("says how long is left when it is due within a day", () => {
    expect(dueWords(new Date(now + 23 * HOUR), false, now)).toEqual({ label: "Due in 23h", alert: false });
  });

  it("says how late it is, and flags it, once it is overdue", () => {
    expect(dueWords(new Date(now - 2 * DAY), false, now)).toEqual({ label: "Overdue 2d", alert: true });
  });

  it("gives a calendar date for later, without an alert", () => {
    const words = dueWords(new Date(now + 10 * DAY), false, now);
    expect(words?.label).toMatch(/^Due [A-Z][a-z]{2} \d{1,2}$/);
    expect(words?.alert).toBe(false);
  });

  it("says nothing without a date or for a closed repair", () => {
    expect(dueWords(null, false, now)).toBeNull();
    expect(dueWords(new Date(now - DAY), true, now)).toBeNull();
  });
});

describe("deviceName and repairSubtitle", () => {
  it("names the device from make and model, else its type", () => {
    expect(deviceName({ type: "Laptop", make: "Lenovo", model: "ThinkPad T14 Gen 3" })).toBe("Lenovo ThinkPad T14 Gen 3");
    expect(deviceName({ type: "Laptop", make: null, model: null })).toBe("Laptop");
    expect(deviceName(null)).toBeNull();
  });

  it("does not repeat a device the subject already names", () => {
    expect(repairSubtitle("ThinkPad T14 — pop-ups and browser redirects", "Lenovo ThinkPad T14 Gen 3")).toBe(
      "ThinkPad T14 — pop-ups and browser redirects",
    );
  });

  it("puts the device in front of a subject that is only the fault", () => {
    expect(repairSubtitle("Cracked screen", "Dell XPS 13")).toBe("Dell XPS 13 · Cracked screen");
  });

  it("falls back to whichever half it has", () => {
    expect(repairSubtitle("No power", null)).toBe("No power");
    expect(repairSubtitle("", "Dell XPS 13")).toBe("Dell XPS 13");
  });
});

describe("pickIntakePhotoId", () => {
  it("takes the first image that looks like a photo of the device", () => {
    expect(
      pickIntakePhotoId([
        { id: "r", fileName: "receipt.png" },
        { id: "s", fileName: "customer-signature.png" },
        { id: "p", fileName: "IMG_2031.jpg" },
        { id: "q", fileName: "device-back.jpg" },
      ]),
    ).toBe("p");
  });

  it("is undefined when there is nothing that qualifies", () => {
    expect(pickIntakePhotoId([{ id: "r", fileName: "invoice-scan.png" }])).toBeUndefined();
    expect(pickIntakePhotoId(undefined)).toBeUndefined();
  });
});

describe("repairFacts and repairChips", () => {
  const busy = {
    status: "In Progress",
    priority: "HIGH",
    needsReply: true,
    partOrders: [{ status: "ORDERED" }],
    depositCents: 5000,
    checklist: { done: 3, total: 8 },
  };

  it("lists the facts most urgent first, in words", () => {
    expect(repairFacts(busy).map((fact) => fact.label)).toEqual([
      "High priority",
      "Needs reply",
      "Parts: 1 ordered",
      "Deposit $50.00",
      "Checklist 3 of 8",
    ]);
  });

  it("skips what is not worth saying", () => {
    expect(repairFacts({ status: "New", priority: "NORMAL", depositCents: 0, checklist: { done: 0, total: 0 } })).toEqual([]);
    expect(repairFacts({ status: "New", priority: "URGENT" })).toEqual([{ kind: "priority", label: "Urgent", alert: true }]);
  });

  it("keeps up to three facts as they are", () => {
    const chips = repairChips({ status: "New", priority: "HIGH", needsReply: true, partOrders: [{ status: "NEEDED" }] }, now);
    expect(chips.shown.map((fact) => fact.label)).toEqual(["High priority", "Needs reply", "Parts: 1 needed"]);
    expect(chips.more).toBeNull();
  });

  it("folds everything past the second fact into one +N more", () => {
    const chips = repairChips({ ...busy, dueDate: new Date(now - DAY) }, now);
    expect(chips.due).toEqual({ label: "Overdue 1d", alert: true });
    expect(chips.shown.map((fact) => fact.label)).toEqual(["High priority", "Needs reply"]);
    expect(chips.more).toEqual({ label: "+3 more", detail: "Parts: 1 ordered, Deposit $50.00, Checklist 3 of 8" });
  });

  it("drops the due date for a resolved repair", () => {
    expect(repairChips({ status: "Resolved", dueDate: new Date(now - DAY) }, now).due).toBeNull();
  });
});

describe("repair views (the Easy mode tabs)", () => {
  const pipeline = ["New", "In Progress", "Waiting for Parts", "Waiting on Customer", "Ready for Pickup", "Resolved"];

  it("puts the all-day views first, then the other statuses in the shop's order", () => {
    expect(repairViews(pipeline).map((view) => view.label)).toEqual([
      "Open jobs",
      "Ready for pickup",
      "Needs reply",
      "Overdue",
      "All",
      "New",
      "In Progress",
      "Waiting for Parts",
      "Waiting on Customer",
      "Resolved",
    ]);
  });

  it("uses the shop's own spelling for the ready status, and offers none if it has none", () => {
    expect(repairViews(["New", "ready for pickup"]).find((view) => view.id === "ready")?.status).toBe("ready for pickup");
    expect(repairViews(["Open", "Closed"]).some((view) => view.id === "ready")).toBe(false);
  });

  const counts = buildViewCounts(
    [
      { status: "New", count: 2 },
      { status: "In Progress", count: 4 },
      { status: "Ready for Pickup", count: 2 },
      { status: "Resolved", count: 4 },
    ],
    { needsReply: 1, overdue: 9 },
  );

  it("counts open as everything but Resolved, and all as everything", () => {
    expect(counts.open).toBe(8);
    expect(counts.all).toBe(12);
    expect(counts.byStatus["In Progress"]).toBe(4);
  });

  it("gives every tab the number it will open", () => {
    const views = repairViews(pipeline);
    const byId = Object.fromEntries(views.map((view) => [view.id, viewCount(view, counts)]));
    expect(byId.open).toBe(8);
    expect(byId.ready).toBe(2);
    expect(byId["needs-reply"]).toBe(1);
    expect(byId.overdue).toBe(9);
    expect(byId.all).toBe(12);
    expect(byId["status:Waiting for Parts"]).toBe(0);
    expect(viewCount(views[0], null)).toBeUndefined();
  });

  it("lights one tab: Overdue is a due-date lens and wins over the status it rides on", () => {
    const views = repairViews(pipeline);
    const lit = (current: { status: string; due: string }) => views.filter((view) => viewIsActive(view, current)).map((view) => view.id);
    expect(lit({ status: "open", due: "all" })).toEqual(["open"]);
    expect(lit({ status: "open", due: "overdue" })).toEqual(["overdue"]);
    expect(lit({ status: "Ready for Pickup", due: "all" })).toEqual(["ready"]);
    expect(lit({ status: "needs-reply", due: "all" })).toEqual(["needs-reply"]);
    expect(lit({ status: "In Progress", due: "all" })).toEqual(["status:In Progress"]);
    expect(lit({ status: "open", due: "today" })).toEqual(["open"]);
  });

  it("sets the due lens from Overdue and clears it when you leave", () => {
    const [open, ready, , overdue] = repairViews(pipeline);
    expect(viewPatch(overdue, "all")).toEqual({ status: "open", due: "overdue" });
    expect(viewPatch(ready, "overdue")).toEqual({ status: "Ready for Pickup", due: "all" });
    expect(viewPatch(open, "today")).toEqual({ status: "open" });
  });
});

describe("repairEmpty", () => {
  it("names a next step for every empty view", () => {
    expect(repairEmpty({ status: "needs-reply", due: "all", filtered: true })).toMatchObject({ title: "Nobody is waiting on you", action: "open" });
    expect(repairEmpty({ status: "open", due: "overdue", filtered: true })).toMatchObject({ title: "Nothing is overdue", action: "open" });
    expect(repairEmpty({ status: "Ready for Pickup", due: "all", filtered: true })).toMatchObject({ title: "Nothing is waiting for pickup", action: "open" });
    expect(repairEmpty({ status: "open", due: "all", filtered: true })).toMatchObject({ title: "No repairs match", action: "clear" });
    expect(repairEmpty({ status: "open", due: "all", filtered: false })).toMatchObject({ title: "No repairs yet", action: "new" });
  });
});

describe("repairNextStep", () => {
  it("is the pickup step while the device is still here", () => {
    expect(repairNextStep({ pickedUp: false, nothingToBill: true })).toBe("pickup");
    expect(repairNextStep({ pickedUp: false, nothingToBill: false })).toBe("pickup");
  });

  it("is the invoice once it has gone home, if there is anything to bill", () => {
    expect(repairNextStep({ pickedUp: true, nothingToBill: false })).toBe("invoice");
  });

  it("is nothing, rather than a dead button, when there is nothing left to do", () => {
    expect(repairNextStep({ pickedUp: true, nothingToBill: true })).toBe("none");
  });
});
