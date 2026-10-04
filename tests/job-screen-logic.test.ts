import { describe, expect, it } from "vitest";

import {
  DEFAULT_JOB_TAB,
  JOB_TABS,
  inProgressTarget,
  intakePhotoId,
  invoiceOwes,
  jobActionCopy,
  jobActions,
  jobSteps,
  jobTabCount,
  jobTabHref,
  openPartCount,
  parseCompose,
  parseJobTab,
  phoneLinks,
  pickJobInvoice,
  priorityWords,
  sheetShortcut,
} from "@/components/tickets/job-screen-logic";
import { DEFAULT_TICKET_STATUSES } from "@/components/tickets/ticket-meta";

const STATUSES = [...DEFAULT_TICKET_STATUSES];

describe("the section tabs", () => {
  it("has the five sections, Work first", () => {
    expect(JOB_TABS.map((tab) => tab.label)).toEqual(["Work", "Updates", "Photos", "Customer", "Money"]);
    expect(DEFAULT_JOB_TAB).toBe("work");
  });

  it("reads ?tab=, ignoring case, and falls back to Work for anything unknown", () => {
    expect(parseJobTab("money")).toBe("money");
    expect(parseJobTab("Updates")).toBe("updates");
    expect(parseJobTab(["photos", "money"])).toBe("photos");
    expect(parseJobTab("billing")).toBe("work");
    expect(parseJobTab("")).toBe("work");
    expect(parseJobTab(undefined)).toBe("work");
  });

  it("reads ?compose= as a note or a message, nothing else", () => {
    expect(parseCompose("note")).toBe("note");
    expect(parseCompose("MESSAGE")).toBe("message");
    expect(parseCompose("email")).toBeNull();
    expect(parseCompose(undefined)).toBeNull();
  });

  it("links Work to the plain repair address and the rest to ?tab=", () => {
    expect(jobTabHref("t1", "work")).toBe("/tickets/t1");
    expect(jobTabHref("t1", "money")).toBe("/tickets/t1?tab=money");
    expect(jobTabHref("t1", "updates", "message")).toBe("/tickets/t1?tab=updates&compose=message");
  });

  it("counts only where a count says something", () => {
    const counts = { openParts: 0, comments: 4, attachments: 0, charges: 2 };
    expect(jobTabCount("work", counts)).toBeUndefined();
    expect(jobTabCount("updates", counts)).toBe(4);
    expect(jobTabCount("photos", counts)).toBeUndefined();
    expect(jobTabCount("customer", counts)).toBeUndefined();
    expect(jobTabCount("money", counts)).toBe(2);
  });

  it("counts only the part orders still being chased", () => {
    expect(openPartCount([{ status: "NEEDED" }, { status: "ORDERED" }, { status: "RECEIVED" }, { status: "CANCELED" }])).toBe(2);
    expect(openPartCount([])).toBe(0);
  });
});

describe("jobSteps", () => {
  it("ticks what is behind, fills the current one and leaves the rest", () => {
    const steps = jobSteps(STATUSES, "Waiting for Parts");
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current", "todo", "todo", "todo"]);
    expect(steps.map((step) => step.status)).toEqual(STATUSES);
  });

  it("starts with nothing done on a New repair", () => {
    expect(jobSteps(STATUSES, "New").map((step) => step.state)).toEqual(["current", "todo", "todo", "todo", "todo", "todo"]);
  });

  it("keeps Resolved as the one current step, with every step before it done", () => {
    const steps = jobSteps(STATUSES, "Resolved");
    expect(steps.filter((step) => step.state === "current")).toHaveLength(1);
    expect(steps[5].state).toBe("current");
    expect(steps.slice(0, 5).every((step) => step.state === "done")).toBe(true);
  });

  it("matches a status without regard to case or padding", () => {
    expect(jobSteps(STATUSES, " in progress ")[1].state).toBe("current");
  });

  it("adds a status the shop has since renamed away as the current step, so the row never lies", () => {
    const steps = jobSteps(STATUSES, "Awaiting Quote");
    expect(steps).toHaveLength(7);
    expect(steps[6]).toEqual({ status: "Awaiting Quote", state: "current" });
    expect(steps.slice(0, 6).every((step) => step.state === "done")).toBe(true);
  });

  it("follows a shop's own pipeline", () => {
    const steps = jobSteps(["Intake", "Bench", "Done"], "Bench");
    expect(steps.map((step) => step.state)).toEqual(["done", "current", "todo"]);
  });
});

describe("inProgressTarget", () => {
  it("is the shop's In Progress, in the shop's spelling", () => {
    expect(inProgressTarget(STATUSES, "New")).toBe("In Progress");
    expect(inProgressTarget(["New", "in progress", "Done"], "New")).toBe("in progress");
  });

  it("falls back to the next step when the pipeline has no In Progress", () => {
    expect(inProgressTarget(["Intake", "Bench", "Done"], "Intake")).toBe("Bench");
  });

  it("is null when there is nowhere to go", () => {
    expect(inProgressTarget(["Intake"], "Intake")).toBeNull();
  });
});

describe("jobActions: the one big button by status", () => {
  const base = { pickedUp: false, unbilled: false, invoice: null };
  const pick = (status: string, over: Partial<Parameters<typeof jobActions>[0]> = {}) => jobActions({ status, ...base, ...over });

  it("New starts the repair", () => {
    expect(pick("New")).toEqual({ primary: "start", secondary: null });
  });

  it("In Progress marks it ready for pickup, which tells the customer", () => {
    expect(pick("In Progress")).toEqual({ primary: "ready", secondary: null });
  });

  it("either Waiting state resumes the repair", () => {
    expect(pick("Waiting for Parts")).toEqual({ primary: "resume", secondary: null });
    expect(pick("Waiting on Customer")).toEqual({ primary: "resume", secondary: null });
  });

  it("a state the shop invented is treated as work in progress", () => {
    expect(pick("Awaiting Quote")).toEqual({ primary: "ready", secondary: null });
  });

  describe("Ready for Pickup", () => {
    it("takes payment on an invoice that still owes, and offers the hand-over beside it", () => {
      expect(pick("Ready for Pickup", { invoice: { status: "SENT" } })).toEqual({ primary: "payment", secondary: "handover" });
      expect(pick("Ready for Pickup", { invoice: { status: "PARTIAL" } })).toEqual({ primary: "payment", secondary: "handover" });
      expect(pick("Ready for Pickup", { invoice: { status: "DRAFT" } })).toEqual({ primary: "payment", secondary: "handover" });
    });

    it("makes the invoice first when there is work nobody has billed", () => {
      expect(pick("Ready for Pickup", { unbilled: true })).toEqual({ primary: "invoice", secondary: "handover" });
    });

    it("hands the device over when nothing is left to pay", () => {
      expect(pick("Ready for Pickup")).toEqual({ primary: "handover", secondary: null });
      expect(pick("Ready for Pickup", { invoice: { status: "PAID" } })).toEqual({ primary: "handover", secondary: "view-invoice" });
    });
  });

  describe("Resolved", () => {
    it("views the invoice and offers to reopen", () => {
      expect(pick("Resolved", { invoice: { status: "PAID" } })).toEqual({ primary: "view-invoice", secondary: "reopen" });
    });

    it("makes the invoice when work is unbilled", () => {
      expect(pick("Resolved", { unbilled: true })).toEqual({ primary: "invoice", secondary: "reopen" });
    });

    it("reopens when there is no money to look at", () => {
      expect(pick("Resolved")).toEqual({ primary: "reopen", secondary: null });
    });
  });

  it("once the device has gone home only the money is left, and there is no hand-over", () => {
    expect(pick("Resolved", { pickedUp: true, invoice: { status: "PAID" } })).toEqual({ primary: "view-invoice", secondary: null });
    expect(pick("Resolved", { pickedUp: true, unbilled: true })).toEqual({ primary: "invoice", secondary: null });
    expect(pick("Resolved", { pickedUp: true })).toEqual({ primary: null, secondary: null });
  });

  it("never offers a hand-over for a repair that is not on the shelf", () => {
    for (const status of ["New", "In Progress", "Waiting for Parts", "Waiting on Customer", "Resolved"]) {
      const { primary, secondary } = pick(status, { unbilled: true, invoice: { status: "SENT" } });
      expect(primary).not.toBe("handover");
      expect(secondary).not.toBe("handover");
    }
  });
});

describe("invoices of a repair", () => {
  it("picks the newest invoice that is not void", () => {
    const list = [
      { id: "c", status: "VOID" },
      { id: "b", status: "PAID" },
      { id: "a", status: "SENT" },
    ];
    expect(pickJobInvoice(list)?.id).toBe("b");
    expect(pickJobInvoice([{ id: "x", status: "VOID" }])).toBeNull();
    expect(pickJobInvoice([])).toBeNull();
  });

  it("owes money while it is a draft, sent or part paid", () => {
    expect(invoiceOwes({ status: "DRAFT" })).toBe(true);
    expect(invoiceOwes({ status: "SENT" })).toBe(true);
    expect(invoiceOwes({ status: "PARTIAL" })).toBe(true);
    expect(invoiceOwes({ status: "PAID" })).toBe(false);
    expect(invoiceOwes({ status: "VOID" })).toBe(false);
    expect(invoiceOwes(null)).toBe(false);
  });
});

describe("jobActionCopy", () => {
  it("says what each button does in plain words", () => {
    expect(jobActionCopy("start").label).toBe("Start repair");
    expect(jobActionCopy("ready", { customerName: "Owen" })).toEqual({
      label: "Mark ready for pickup",
      hint: "Tells Owen by text or email.",
    });
    expect(jobActionCopy("ready").hint).toBe("Tells the customer by text or email.");
    expect(jobActionCopy("resume").label).toBe("Resume repair");
    expect(jobActionCopy("payment", { invoiceNumber: 1014 })).toEqual({ label: "Take payment", hint: "Opens invoice #1014." });
    expect(jobActionCopy("invoice").label).toBe("Make invoice");
    expect(jobActionCopy("handover").label).toBe("Hand over to customer");
    expect(jobActionCopy("view-invoice", { invoiceNumber: 7 }).label).toBe("View invoice #7");
    expect(jobActionCopy("view-invoice").label).toBe("View invoice");
    expect(jobActionCopy("reopen").label).toBe("Reopen repair");
  });

  it("names the shop's own In Progress in the hint", () => {
    expect(jobActionCopy("start", { inProgress: "On the bench" }).hint).toBe("Moves this repair to On the bench.");
  });
});

describe("phoneLinks", () => {
  it("builds tel: and sms: links from the number as written", () => {
    expect(phoneLinks("(512) 555-0189")).toEqual({
      display: "(512) 555-0189",
      tel: "tel:5125550189",
      sms: "sms:5125550189",
    });
    expect(phoneLinks("+1 780 555 0142")?.tel).toBe("tel:+17805550142");
  });

  it("is null when there is nothing to dial", () => {
    expect(phoneLinks(null)).toBeNull();
    expect(phoneLinks("  ")).toBeNull();
    expect(phoneLinks("none")).toBeNull();
  });
});

describe("priorityWords", () => {
  it("says the priority in words", () => {
    expect(priorityWords("LOW")).toBe("Low priority");
    expect(priorityWords("URGENT")).toBe("Urgent priority");
    expect(priorityWords("nonsense")).toBe("Normal priority");
    expect(priorityWords(null)).toBe("Normal priority");
  });
});

describe("intakePhotoId", () => {
  it("picks the photo taken first, from images only", () => {
    // Newest first, the way the page selects them.
    const attachments = [
      { id: "c", fileName: "photo-later.jpg", mimeType: "image/jpeg" },
      { id: "b", fileName: "device-log.txt", mimeType: "text/plain" },
      { id: "a", fileName: "photo-intake.jpg", mimeType: "image/jpeg" },
    ];
    expect(intakePhotoId(attachments)).toBe("a");
  });

  it("has none when there are no device photos", () => {
    expect(intakePhotoId([])).toBeUndefined();
    expect(intakePhotoId([{ id: "x", fileName: "receipt.png", mimeType: "image/png" }])).toBeUndefined();
  });
});

describe("sheetShortcut", () => {
  it("offers to tell the customer when moving to Ready for Pickup", () => {
    expect(sheetShortcut("Ready for Pickup", "In Progress", false)).toBe("notify");
  });

  it("offers the hand-over when closing a repair that is on the shelf", () => {
    expect(sheetShortcut("Resolved", "Ready for Pickup", false)).toBe("handover");
  });

  it("offers nothing for a plain move, for a move to where it already is, or once it has gone", () => {
    expect(sheetShortcut("In Progress", "New", false)).toBeNull();
    expect(sheetShortcut("Ready for Pickup", "Ready for Pickup", false)).toBeNull();
    expect(sheetShortcut("Resolved", "Ready for Pickup", true)).toBeNull();
    expect(sheetShortcut("Resolved", "In Progress", false)).toBeNull();
  });
});
