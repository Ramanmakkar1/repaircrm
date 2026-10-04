import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/invoices" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
// The signature pad is only drawn when its dialog is open; the menu test never opens it.
vi.mock("react-signature-canvas", () => ({ default: () => null }));

const { EstimateCard, InvoiceCard, ScheduleCard } = await import("@/components/billing/document-cards");
const { Pagination } = await import("@/components/billing/pagination");
const { BillingFilterBar } = await import("@/components/billing/filter-bar");
const { ActionSlot, DocumentHeader } = await import("@/components/billing/document-header");
const { EstimateActionMenu } = await import("@/components/billing/estimate-action-menu");
const { SendDocumentDialog } = await import("@/components/billing/send-dialog");

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const html = (node: ReactNode) => renderToStaticMarkup(node as never);

const invoice = {
  id: "inv_1",
  number: 1014,
  customerName: "Okonkwo Dental Group",
  status: "SENT",
  createdAt: day(2026, 9, 18),
  dueDate: day(2026, 10, 2),
  paidAt: null,
  totalCents: 45000,
  balanceCents: 45000,
};

describe("InvoiceCard", () => {
  it("is one link to the invoice, with number, customer, dates and the amount in words", () => {
    const out = html(createElement(InvoiceCard, { invoice, now: NOW }));
    expect(out).toContain('href="/invoices/inv_1"');
    expect(out).toContain("#1014 · Okonkwo Dental Group");
    expect(out).toContain("Raised Sep 18");
    expect(out).toContain("due Oct 2");
    expect(out).toContain("$450.00 due");
    // Status always shows its word.
    expect(out).toContain(">Sent<");
  });

  it("flags an overdue bill with words as well as colour", () => {
    const out = html(createElement(InvoiceCard, { invoice, now: NOW }));
    expect(out).toContain("1 day overdue");
    expect(out).toContain("text-status-overdue-fg");
    // A full tinted border, never a left/right stripe.
    expect(out).toContain("border-status-overdue/50");
    expect(out).not.toMatch(/border-[lr]-/);
  });

  it("shows a settled bill as Paid with no overdue chip, even past its due date", () => {
    const out = html(
      createElement(InvoiceCard, { invoice: { ...invoice, status: "PAID", balanceCents: 0, paidAt: day(2026, 9, 25) }, now: NOW }),
    );
    expect(out).toContain("Paid Sep 25");
    expect(out).toContain(">Paid<");
    expect(out).not.toContain("overdue");
    expect(out).not.toContain(" due");
  });

  it("shows a part-paid bill's remaining balance, not its total", () => {
    const out = html(
      createElement(InvoiceCard, {
        invoice: { ...invoice, number: 1011, status: "PARTIAL", dueDate: null, totalCents: 5410, balanceCents: 2705 },
        now: NOW,
      }),
    );
    expect(out).toContain("$54.10");
    expect(out).toContain("$27.05 due");
    expect(out).toContain(">Partial<");
  });

  it("strikes through a void bill and says Voided", () => {
    const out = html(createElement(InvoiceCard, { invoice: { ...invoice, status: "VOID" }, now: NOW }));
    expect(out).toContain("Voided");
    expect(out).toContain("line-through");
    expect(out).not.toContain("overdue");
  });

  it("draws the money twice and lets CSS pick, so a phone gets the amount under the chips", () => {
    const out = html(createElement(InvoiceCard, { invoice, now: NOW }));
    expect(out.match(/\$450\.00 due/g)).toHaveLength(2);
    expect(out).toContain("sm:hidden");
    expect(out).toContain("max-sm:[&amp;&gt;span:last-child]:hidden");
  });
});

describe("EstimateCard", () => {
  const estimate = {
    id: "est_1",
    number: 1001,
    customerName: "Daniel Brooks",
    status: "SENT",
    createdAt: day(2026, 9, 28),
    expiresAt: day(2026, 10, 10),
    approvedAt: null,
    totalCents: 16549,
  };

  it("links to the estimate and says what happens next", () => {
    const out = html(createElement(EstimateCard, { estimate, now: NOW }));
    expect(out).toContain('href="/estimates/est_1"');
    expect(out).toContain("#1001 · Daniel Brooks");
    expect(out).toContain("expires Oct 10");
    expect(out).toContain("Waiting for a yes");
    expect(out).toContain(">Sent<");
    expect(out).not.toContain("Quote expired");
  });

  it("flags an open quote past its expiry in words", () => {
    const out = html(createElement(EstimateCard, { estimate: { ...estimate, expiresAt: day(2026, 10, 1) }, now: NOW }));
    expect(out).toContain("Quote expired");
    expect(out).toContain("expired Oct 1");
  });
});

describe("ScheduleCard", () => {
  const schedule = {
    id: "sch_1",
    name: "Okonkwo Dental - managed IT retainer",
    customerName: "Okonkwo Dental Group",
    cadence: "Every month",
    nextRunAt: day(2026, 10, 18),
    active: true,
    due: false,
    autoSend: true,
    autoCharge: true,
    lastChargeError: null,
    invoiceCount: 2,
    totalCents: 45000,
    state: { label: "Active", tone: "success" as const },
  };

  it("shows the plan, when it runs next and what it does by itself", () => {
    const out = html(createElement(ScheduleCard, { schedule, now: NOW }));
    expect(out).toContain('href="/invoices/recurring/sch_1"');
    expect(out).toContain("next on Oct 18");
    expect(out).toContain(">Active<");
    expect(out).toContain("Sends and charges itself");
    expect(out).toContain("2 invoices so far");
    expect(out).toContain("each time");
  });

  it("names a failed charge in words", () => {
    const out = html(createElement(ScheduleCard, { schedule: { ...schedule, lastChargeError: "Card declined" }, now: NOW }));
    expect(out).toContain("Charge failed");
    expect(out).toContain('title="Card declined"');
  });
});

describe("Pagination big", () => {
  const params = { q: "okon", status: "unpaid" };

  it("renders nothing when everything fits on one page", () => {
    expect(html(createElement(Pagination, { basePath: "/invoices", page: 1, total: 25, params, big: true }))).toBe("");
  });

  it("is two big Previous / Next links with the page in words, carrying the filters", () => {
    const out = html(createElement(Pagination, { basePath: "/invoices", page: 2, total: 60, params, big: true }));
    expect(out).toContain("Page 2 of 3");
    expect(out).toContain("26–50 of 60");
    expect(out).toContain('href="/invoices?q=okon&amp;status=unpaid"');
    expect(out).toContain('href="/invoices?q=okon&amp;status=unpaid&amp;page=3"');
    expect(out).toContain("h-12");
  });

  it("disables Previous on the first page and Next on the last (a dead button, not a link)", () => {
    const first = html(createElement(Pagination, { basePath: "/invoices", page: 1, total: 60, params, big: true }));
    expect(first).toMatch(/<button[^>]*disabled[^>]*><span>[^<]*<svg[^>]*>.*?<\/svg>Previous<\/span>/);
    expect(first).toContain("page=2");

    const last = html(createElement(Pagination, { basePath: "/invoices", page: 3, total: 60, params, big: true }));
    expect(last).toMatch(/<button[^>]*disabled[^>]*><span>Next<svg/);
    expect(last).not.toContain("page=4");
    expect(last).toContain("page=2");
  });

  it("keeps the table footer unchanged in Full mode", () => {
    const out = html(createElement(Pagination, { basePath: "/invoices", page: 1, total: 8, params }));
    expect(out).toContain("1–8 of 8");
    expect(out).toContain("border-t");
  });
});

describe("BillingFilterBar large", () => {
  const props = { basePath: "/invoices", q: "", status: "", placeholder: "Name, phone or number" };

  it("is a 48px field with big buttons in Easy mode, and unchanged otherwise", () => {
    const large = html(createElement(BillingFilterBar, { ...props, large: true }));
    expect(large).toContain("h-12");
    expect(large).toContain('role="search"');
    const plain = html(createElement(BillingFilterBar, props));
    expect(plain).not.toContain("h-12");
  });

  it("offers Clear once something is typed", () => {
    expect(html(createElement(BillingFilterBar, { ...props, q: "okon", large: true }))).toContain("Clear");
    expect(html(createElement(BillingFilterBar, { ...props, large: true }))).not.toContain("Clear");
  });
});

describe("DocumentHeader", () => {
  const out = html(
    createElement(DocumentHeader, {
      back: { label: "Invoices", href: "/invoices" },
      title: "Invoice #1014",
      status: createElement("span", null, "Sent"),
      customer: { name: "Okonkwo Dental Group", href: "/customers/c1" },
      amount: { value: "$450.00", hint: "Balance due - overdue" },
      facts: [
        { label: "Invoice total", value: "$450.00" },
        { label: "Repair", value: "—" },
      ],
      actions: createElement("button", null, "Take payment"),
    }),
  );

  it("has one h1 with the title, the status word, and a link to the customer", () => {
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain("Invoice #1014");
    expect(out).toContain(">Sent<");
    expect(out).toContain('href="/customers/c1"');
    expect(out).toContain('href="/invoices"');
  });

  it("shows the amount with its plain-words line and the facts as label/value pairs", () => {
    expect(out).toContain("$450.00");
    expect(out).toContain("Balance due - overdue");
    expect(out).toContain("<dt");
    expect(out).toContain("Invoice total");
    expect(out).toContain("Take payment");
  });

  it("uses no coloured side stripes", () => {
    expect(out).not.toMatch(/border-[lr]-/);
  });

  it("sizes a trigger the page does not own: black stays black, a secondary becomes an outline", () => {
    const slot = (tone: "primary" | "secondary") =>
      html(createElement(ActionSlot as ComponentType<{ tone: "primary" | "secondary" }>, { tone }, createElement("button", null, "Pay")));
    const primary = slot("primary");
    const secondary = slot("secondary");
    expect(primary).toContain("h-12");
    expect(primary).not.toContain("border-border-strong");
    expect(secondary).toContain("border-border-strong");
    expect(secondary).toContain("bg-surface");
  });
});

describe("EstimateActionMenu", () => {
  const action = vi.fn();
  const base = {
    estimateId: "est_1",
    estimateNumber: 1003,
    customerName: "Okonkwo Dental Group",
    printHref: "/print/estimates/est_1",
    editHref: "/estimates/est_1/edit",
    approve: null,
    approveWithSignature: null,
    decline: null,
    convert: null,
  };

  it("is a labelled 48px More button in Easy mode and the old compact icon otherwise", () => {
    const large = html(createElement(EstimateActionMenu, { ...base, large: true }));
    expect(large).toContain("More");
    expect(large).toContain("h-12");
    const compact = html(createElement(EstimateActionMenu, base));
    expect(compact).not.toContain("h-12");
    expect(compact).toContain('aria-label="More estimate actions"');
  });

  it("posts the estimate id only for the actions this status allows", () => {
    const none = html(createElement(EstimateActionMenu, base));
    expect(none).not.toContain("<form");

    const some = html(
      createElement(EstimateActionMenu, { ...base, decline: { action }, convert: { action } }),
    );
    expect(some.match(/<form/g)).toHaveLength(2);
    expect(some.match(/name="id" value="est_1"/g)).toHaveLength(2);
  });
});

describe("SendDocumentDialog appearance", () => {
  const doc = {
    id: "d1",
    kind: "invoice" as const,
    label: "Invoice #1014",
    customerName: "Okonkwo Dental Group",
    defaultSubject: "s",
    defaultMessage: "m",
    email: "a@b.co",
    emailOptIn: true,
    mobile: null,
    smsOptIn: false,
    alreadySent: true,
    lastSentHint: "Last sent 16d ago by email",
  };
  const props = { doc, previewAction: vi.fn(), sendAction: vi.fn() };

  it("keeps the default look for Full mode", () => {
    const out = html(createElement(SendDocumentDialog, { ...props, size: "sm" }));
    expect(out).toContain("Send again");
    expect(out).not.toContain("h-12");
    expect(out).toContain("bg-accent");
  });

  it("is the one big black button as the primary", () => {
    const out = html(createElement(SendDocumentDialog, { ...props, appearance: "primary" }));
    expect(out).toContain("h-12");
    expect(out).toContain("bg-accent");
  });

  it("is an outline as a secondary, so only one black button ever competes", () => {
    const out = html(createElement(SendDocumentDialog, { ...props, appearance: "secondary" }));
    expect(out).toContain("h-12");
    expect(out).toContain("border-border-strong");
    expect(out).not.toContain("bg-accent ");
  });
});
