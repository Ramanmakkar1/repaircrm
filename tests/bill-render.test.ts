import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/invoices" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement("a", { href, ...rest }, children),
}));
// The signature pad is only drawn when its dialog is open; these tests never open it.
vi.mock("react-signature-canvas", () => ({ default: () => null }));

const { balanceBlock, invoiceActivity, quoteBlock } = await import("@/components/billing/bill-display");
const { BackLink, BalanceHero, BillSummary, CallLink, PinnedAction, QuoteHero } = await import("@/components/billing/bill-hero");
const { ActivityList, EmptyLines, FactList, LineList, MoneyRows, Section, TotalsBlock } = await import("@/components/billing/bill-lines");
const { CopyLinkTile, EmailReceiptTile } = await import("@/components/billing/quick-tiles");
const { SendDocumentDialog } = await import("@/components/billing/send-dialog");
const { InvoiceActionMenu } = await import("@/components/billing/invoice-action-menu");
const { EstimateActionMenu } = await import("@/components/billing/estimate-action-menu");
const { ShareRow } = await import("@/components/billing/send-links");
const { UnbilledTimeBanner } = await import("@/components/billing/unbilled-time-banner");
const { BillDetailSkeleton } = await import("@/components/billing/skeletons");
const { TILE_CLASS, BIG_BUTTON_SLOT } = await import("@/components/billing/tile-style");
const { MethodTiles } = await import("@/components/billing/payment-dialog");

/** The page always passes children; createElement's extra arguments are how a test does. */
const Pinned = PinnedAction as ComponentType<{ caption?: { label: string; value: string } | null }>;

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const html = (node: ReactNode) => renderToStaticMarkup(node as never);

/** What no Easy-mode bill markup may ever contain: a coloured side stripe or a raw colour. */
function expectCalm(out: string) {
  expect(out).not.toMatch(/border-[lr]-(?!\[)/);
  // A colour written by hand would sit in a class or a style; "#1014" in the text is an invoice number.
  const attributes = [...out.matchAll(/(?:class|style)="([^"]*)"/g)].map((match) => match[1]).join(" ");
  expect(attributes).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(out).not.toMatch(/\bbg-white\b/);
}

const sent = {
  status: "SENT",
  totalCents: 45000,
  paidCents: 0,
  refundedCents: 0,
  balanceCents: 45000,
  dueDate: day(2026, 10, 2),
  paidAt: null as Date | null,
};

describe("BalanceHero", () => {
  it("is the amount due in very large type with the lateness in words (overdue)", () => {
    const out = html(createElement(BalanceHero, { block: balanceBlock(sent, NOW) }));
    expect(out).toContain('data-state="overdue"');
    expect(out).toContain("$450.00");
    expect(out).toContain(">due<");
    expect(out).toContain("Overdue since Oct 2 · 1 day late");
    expect(out).toContain("Nothing collected yet");
    expect(out).toContain("text-[44px]");
    expect(out).toContain("tabular-nums");
    expect(out).toContain("text-status-overdue-fg");
    expectCalm(out);
  });

  it("shows the balance and what has been collected when part-paid", () => {
    const out = html(
      createElement(BalanceHero, {
        block: balanceBlock({ ...sent, status: "PARTIAL", totalCents: 5410, paidCents: 2705, balanceCents: 2705, dueDate: day(2026, 10, 12) }, NOW),
      }),
    );
    expect(out).toContain('data-state="due"');
    expect(out).toContain("$27.05");
    expect(out).toContain("Due Oct 12");
    expect(out).toContain("Collected so far $27.05 of $54.10");
    expect(out).not.toContain("text-status-overdue-fg");
  });

  it("says Paid in full in words, with the day, and no amount due", () => {
    const out = html(
      createElement(BalanceHero, {
        block: balanceBlock({ ...sent, status: "PAID", paidCents: 45000, balanceCents: 0, paidAt: day(2026, 9, 25) }, NOW),
      }),
    );
    expect(out).toContain('data-state="paid"');
    expect(out).toContain("Paid in full");
    expect(out).toContain("Paid Sep 25");
    expect(out).toContain("Collected $450.00");
    expect(out).not.toContain(">due<");
    expect(out).toContain("text-status-resolved-fg");
    expectCalm(out);
  });

  it("says Draft, with the total and no balance", () => {
    const out = html(createElement(BalanceHero, { block: balanceBlock({ ...sent, status: "DRAFT" }, NOW) }));
    expect(out).toContain('data-state="draft"');
    expect(out).toContain(">Draft<");
    expect(out).toContain("Not sent yet");
    expect(out).toContain("Total $450.00");
    expect(out).not.toContain(">due<");
  });

  it("says Voided and strikes it through", () => {
    const out = html(createElement(BalanceHero, { block: balanceBlock({ ...sent, status: "VOID" }, NOW) }));
    expect(out).toContain('data-state="void"');
    expect(out).toContain("Voided");
    expect(out).toContain("line-through");
    expect(out).toContain("Nothing is owed on this invoice");
  });
});

describe("QuoteHero", () => {
  const quote = { status: "SENT", totalCents: 16549, expiresAt: day(2026, 10, 10), approvedAt: null, expired: false };

  it("shows the quoted total, where the quote stands and its expiry", () => {
    const out = html(createElement(QuoteHero, { block: quoteBlock(quote, NOW), expired: false }));
    expect(out).toContain("$165.49");
    expect(out).toContain(">estimate<");
    expect(out).toContain("Waiting for a yes");
    expect(out).toContain("Expires Oct 10");
    expectCalm(out);
  });

  it("says Expired in words and the alert colour once it has lapsed", () => {
    const out = html(createElement(QuoteHero, { block: quoteBlock({ ...quote, expiresAt: day(2026, 10, 1), expired: true }, NOW), expired: true }));
    expect(out).toContain("Expired Oct 1");
    expect(out).toContain("text-status-overdue-fg");
    expect(out).toContain('data-state="expired"');
  });
});

describe("LineList", () => {
  const lines = [
    { id: "l1", description: "Managed IT — monthly retainer (12 seats)", quantity: 1, unitPriceCents: 39000, taxable: true, serial: null },
    { id: "l2", description: "1TB NVMe SSD (replacement)", quantity: 2, unitPriceCents: 6000, taxable: false, serial: "NV-7734-KX" },
  ];

  it("is a list of card rows, not a table", () => {
    const out = html(createElement(LineList, { lines }));
    expect(out).not.toContain("<table");
    expect(out).not.toContain("<th");
    expect(out.match(/<li /g)).toHaveLength(2);
    expect(out).toContain("Managed IT — monthly retainer (12 seats)");
    expectCalm(out);
  });

  it("puts quantity x rate, the tax flag and the amount on every row", () => {
    const out = html(createElement(LineList, { lines }));
    expect(out).toContain("1 × $390.00");
    expect(out).toContain("2 × $60.00");
    expect(out).toContain("Taxable");
    expect(out).toContain("No tax");
    expect(out).toContain("$390.00");
    expect(out).toContain("$120.00");
    expect(out).toContain("tabular-nums");
  });

  it("shows the serial under the description only when the line has one", () => {
    const out = html(createElement(LineList, { lines }));
    expect(out).toContain("Serial");
    expect(out).toContain("NV-7734-KX");
    expect(out.match(/Serial/g)).toHaveLength(1);
  });

  it("strikes the amounts of a voided bill", () => {
    expect(html(createElement(LineList, { lines, struck: true }))).toContain("line-through");
    expect(html(createElement(LineList, { lines }))).not.toContain("line-through");
  });
});

describe("TotalsBlock", () => {
  it("is a right-aligned receipt block with the total large", () => {
    const out = html(
      createElement(TotalsBlock, {
        rows: [
          { label: "Subtotal", value: "$360.00" },
          { label: "Williamson County 6.75%", value: "$24.30" },
          { label: "Total", value: "$384.30", size: "large" as const, divider: true },
          { label: "Balance", value: "Paid in full", size: "large" as const, tone: "good" as const, divider: true },
        ],
      }),
    );
    expect(out).toContain("ml-auto");
    expect(out).toContain("<dl");
    expect(out).toContain("Williamson County 6.75%");
    expect(out).toContain("text-[28px]");
    expect(out).toContain("Paid in full");
    expect(out).toContain("text-status-resolved-fg");
    expect(out).toContain("border-t");
    expectCalm(out);
  });

  it("strikes a voided total and shows an alert balance", () => {
    const out = html(
      createElement(TotalsBlock, {
        rows: [
          { label: "Total", value: "$529.34", size: "large" as const, struck: true },
          { label: "Balance due", value: "$450.00", size: "large" as const, tone: "alert" as const },
        ],
      }),
    );
    expect(out).toContain("line-through");
    expect(out).toContain("text-status-overdue-fg");
  });
});

describe("MoneyRows", () => {
  const payment = {
    id: "p1",
    kind: "payment" as const,
    title: "Card (online)",
    detail: "Sep 19, 2026, 6:00 PM · taken by Priya Shah",
    amountCents: 5410,
  };

  it("lists a payment with its method in words, when, who and the amount", () => {
    const out = html(createElement(MoneyRows, { rows: [payment] }));
    expect(out).toContain("Card (online)");
    expect(out).toContain("taken by Priya Shah");
    expect(out).toContain("$54.10");
    expect(out).toContain("text-status-resolved-fg");
    expect(out).not.toContain("−");
    expectCalm(out);
  });

  it("signs and reddens a refund so money leaving is never mistaken for money collected", () => {
    const out = html(
      createElement(MoneyRows, {
        rows: [{ ...payment, id: "r1", kind: "refund" as const, title: "Card · against Card (online)", note: "Returned unopened", amountCents: 2705, failed: true }],
      }),
    );
    expect(out).toContain("−$27.05");
    expect(out).toContain("text-destructive");
    expect(out).toContain("Returned unopened");
    expect(out).toContain("line-through");
  });

  it("carries a copyable reference and the refund button under the list when the page gives them", () => {
    const out = html(
      createElement(MoneyRows, {
        rows: [{ ...payment, reference: createElement("span", null, "cs_test_123") }],
        footer: createElement("button", null, "Refund"),
      }),
    );
    expect(out).toContain("cs_test_123");
    expect(out).toContain(">Refund<");
  });

  it("says why it is empty, or draws nothing when there is no sentence", () => {
    expect(html(createElement(MoneyRows, { rows: [], empty: "Nothing collected yet." }))).toContain("Nothing collected yet.");
    expect(html(createElement(MoneyRows, { rows: [] }))).toBe("");
  });
});

describe("ActivityList", () => {
  it("shows each event with its date, outcome in words and signed amount", () => {
    const items = invoiceActivity({
      createdAt: new Date(Date.UTC(2026, 8, 19, 18, 0, 0)),
      paidAt: null,
      settled: false,
      payments: [{ id: "p1", createdAt: new Date(Date.UTC(2026, 8, 19, 18, 5, 0)), amountCents: 5410, label: "Card (reader)", takenBy: "Priya Shah" }],
      refunds: [],
      messages: [
        { id: "m1", createdAt: new Date(Date.UTC(2026, 8, 19, 18, 1, 0)), type: "EMAIL", direction: "OUT", to: "a@b.co", subject: "Invoice #1011", status: "skipped: opted out" },
      ],
    });
    const out = html(createElement(ActivityList, { items }));
    expect(out).toContain("Invoice written");
    expect(out).toContain("Emailed to a@b.co");
    expect(out).toContain("Not sent: opted out");
    expect(out).toContain("text-status-overdue-fg");
    expect(out).toContain("Payment taken: Card (reader)");
    expect(out).toContain("$54.10");
    expect(out).toContain("Sep 19, 2026");
    expectCalm(out);
  });

  it("is empty-safe", () => {
    expect(html(createElement(ActivityList, { items: [] }))).toBe("");
    expect(html(createElement(ActivityList, { items: [], empty: "Nothing yet." }))).toContain("Nothing yet.");
  });
});

describe("FactList, Section and EmptyLines", () => {
  it("shows facts as label/value pairs, not nested cards", () => {
    const out = html(
      createElement(FactList, {
        facts: [
          { label: "Issued", value: "Sep 18, 2026" },
          { label: "Due", value: "Oct 2, 2026 (overdue)" },
        ],
      }),
    );
    expect(out.match(/<dt/g)).toHaveLength(2);
    expect(out).toContain("Oct 2, 2026 (overdue)");
    expect(out.match(/rounded-2xl/g)).toHaveLength(1);
  });

  it("gives a section one plain heading and its action", () => {
    const out = html(createElement(
        Section as ComponentType<{ title: string; action?: ReactNode }>,
        { title: "Payments", action: createElement("span", null, "$384.30 collected") },
        createElement("p", null, "body"),
      ));
    expect(out.match(/<h2/g)).toHaveLength(1);
    expect(out).toContain("Payments");
    expect(out).toContain("$384.30 collected");
  });

  it("points an empty bill at the next step", () => {
    const out = html(createElement(EmptyLines, { title: "Nothing billed yet", hint: "Add the parts.", action: createElement("a", { href: "/invoices/i1/edit" }, "Add line items") }));
    expect(out).toContain("Nothing billed yet");
    expect(out).toContain('href="/invoices/i1/edit"');
  });
});

describe("BillSummary", () => {
  const props = {
    title: "Invoice #1014",
    status: createElement("span", null, "Sent"),
    customer: { name: "Okonkwo Dental Group", href: "/customers/c1", phone: "(512) 555-0122" },
    hero: createElement("div", null, "HERO"),
    primary: createElement("button", null, "Take payment"),
    tiles: [createElement("button", { key: "a" }, "Print"), createElement("button", { key: "b" }, "More")],
    tileCount: 2,
    hint: "Last sent 16d ago by email",
  };

  it("has one h1, the status word, the customer link and a big tap-to-call with the number", () => {
    const out = html(createElement(BillSummary, props));
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain("Invoice #1014");
    expect(out).toContain(">Sent<");
    expect(out).toContain('href="/customers/c1"');
    expect(out).toContain('href="tel:5125550122"');
    expect(out).toContain('aria-label="Call Okonkwo Dental Group on (512) 555-0122"');
    expect(out).toContain("(512) 555-0122");
    expect(out).toContain("min-h-12");
    expectCalm(out);
  });

  it("draws no call button when there is no phone", () => {
    const out = html(createElement(BillSummary, { ...props, customer: { ...props.customer, phone: null } }));
    expect(out).not.toContain("tel:");
    expect(out).not.toContain(">Call<");
  });

  it("hides the big button on a phone, where it is pinned instead, and keeps the tiles and the hint", () => {
    const out = html(createElement(BillSummary, props));
    expect(out).toMatch(/class="hidden sm:block"><button>Take payment<\/button>/);
    expect(out).toContain("HERO");
    expect(out).toContain(">Print<");
    expect(out).toContain("Last sent 16d ago by email");
  });

  it("is the right-hand rail from lg and two columns before that", () => {
    const out = html(createElement(BillSummary, props));
    expect(out).toContain("sm:grid-cols-2");
    expect(out).toContain("lg:flex");
  });

  it("draws no big button when the state has none", () => {
    const out = html(createElement(BillSummary, { ...props, primary: null }));
    expect(out).not.toContain("Take payment");
  });
});

describe("PinnedAction", () => {
  it("is a phone-only bar that sticks above the bottom tab bar, with the amount beside the button", () => {
    const out = html(
      createElement(
        Pinned,
        { caption: { label: "Balance due", value: "$450.00" } },
        createElement("button", null, "Take payment"),
      ),
    );
    expect(out).toContain("sticky");
    expect(out).toContain("bottom-[-6.25rem]");
    expect(out).toContain("sm:hidden");
    expect(out).toContain("Balance due");
    expect(out).toContain("$450.00");
    expect(out).toContain("Take payment");
    expectCalm(out);
  });

  it("is only the button when there is no amount to show", () => {
    const out = html(createElement(Pinned, {}, createElement("button", null, "Print receipt")));
    expect(out).toContain("Print receipt");
    expect(out).not.toContain("Balance due");
  });
});

describe("small pieces", () => {
  it("BackLink and CallLink are 48px touch targets", () => {
    expect(html(createElement(BackLink, { label: "Invoices", href: "/invoices" }))).toContain("min-h-12");
    expect(html(createElement(CallLink, { phone: "+1 512 555 0100", who: "Dana" }))).toContain('href="tel:+15125550100"');
  });

  it("the quick tiles are 64px tall and the big button slot is 56px", () => {
    expect(TILE_CLASS).toContain("min-h-16");
    expect(BIG_BUTTON_SLOT).toContain("h-14");
  });

  it("CopyLinkTile and EmailReceiptTile are tiles with a word", () => {
    const copy = html(createElement(CopyLinkTile, { url: "https://example.test/portal/i/x" }));
    expect(copy).toContain("Copy link");
    expect(copy).toContain("min-h-16");
    const receipt = html(createElement(EmailReceiptTile, { invoiceId: "i1", action: vi.fn(), blockedReason: null }));
    expect(receipt).toContain("Send receipt");
    expect(receipt).toContain("min-h-16");
  });

  it("ShareRow keeps both links and goes to 48px buttons in Easy mode", () => {
    const action = vi.fn();
    const large = html(createElement(ShareRow, { viewUrl: "https://example.test/i", payment: { invoiceId: "i1", action }, large: true }));
    expect(large).toContain("Copy view link");
    expect(large).toContain("Copy payment link");
    expect(large).toContain("h-12");
    expect(large).not.toContain(">Share<");
    const plain = html(createElement(ShareRow, { viewUrl: "https://example.test/i", payment: { invoiceId: "i1", action } }));
    expect(plain).toContain(">Share<");
    expect(plain).not.toContain("h-12");
  });

  it("UnbilledTimeBanner is bigger in Easy mode and unchanged otherwise", () => {
    const props = { invoiceId: "i1", entryCount: 2, durationLabel: "0:45", amountLabel: "$71.25" };
    const large = html(createElement(UnbilledTimeBanner, { ...props, large: true }));
    expect(large).toContain("2 unbilled time entries");
    expect(large).toContain("h-12");
    expect(large).toContain("rounded-2xl");
    const plain = html(createElement(UnbilledTimeBanner, props));
    expect(plain).not.toContain("h-12");
    expect(plain).toContain("rounded-lg");
  });

  it("BillDetailSkeleton draws the summary first on a phone and the bill first on a wide screen", () => {
    const out = html(createElement(BillDetailSkeleton));
    expect(out).toContain("lg:grid-cols-[minmax(0,1fr)_22rem]");
    expect(out).toContain("order-1");
  });
});

describe("SendDocumentDialog on the bill screen", () => {
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
    lastSentHint: null,
  };
  const props = { doc, previewAction: vi.fn(), sendAction: vi.fn() };

  it("big is the 56px full-width black split button", () => {
    const out = html(createElement(SendDocumentDialog, { ...props, appearance: "big", size: "lg" }));
    expect(out).toContain("h-14");
    expect(out).toContain("bg-accent");
    expect(out).toContain("Send again");
    expect(out).toContain('aria-label="More send options"');
  });

  it("tiles are two quick tiles, Send again and Message, with no split button", () => {
    const out = html(createElement(SendDocumentDialog, { ...props, appearance: "tiles" }));
    expect(out).toContain("Send again");
    expect(out).toContain(">Message<");
    expect(out).toContain('aria-label="Message Okonkwo Dental Group"');
    expect(out.match(/min-h-16/g)).toHaveLength(2);
    expect(out).not.toContain("More send options");
    expect(out).not.toContain("bg-accent ");
  });

  it("a draft's tile just says Send", () => {
    const out = html(createElement(SendDocumentDialog, { ...props, doc: { ...doc, alreadySent: false }, appearance: "tiles" }));
    expect(out).toContain(">Send<");
    expect(out).not.toContain("Send again");
  });
});

describe("the More tile", () => {
  const invoiceMenu = {
    invoiceId: "i1",
    invoiceNumber: 1014,
    customerName: "Okonkwo Dental Group",
    printHref: "/print/invoices/i1",
    editHref: "/invoices/i1/edit",
    receipt: null,
    signature: null,
    chargeCard: null,
    refund: null,
    voidInvoice: null,
  };

  it("is a tile (icon over the word) for the invoice, and still the compact icon or the 48px button otherwise", () => {
    const tile = html(createElement(InvoiceActionMenu, { ...invoiceMenu, tile: true }));
    expect(tile).toContain("min-h-16");
    expect(tile).toContain("More");
    expect(tile).toContain('aria-label="More invoice actions"');
    const large = html(createElement(InvoiceActionMenu, { ...invoiceMenu, large: true }));
    expect(large).toContain("h-12");
    expect(large).not.toContain("min-h-16");
    const compact = html(createElement(InvoiceActionMenu, invoiceMenu));
    expect(compact).not.toContain("h-12");
    expect(compact).not.toContain("min-h-16");
  });

  it("is a tile for the estimate too", () => {
    const base = {
      estimateId: "e1",
      estimateNumber: 1003,
      customerName: "Okonkwo Dental Group",
      printHref: "/print/estimates/e1",
      editHref: "/estimates/e1/edit",
      approve: null,
      approveWithSignature: null,
      decline: null,
      convert: null,
    };
    const tile = html(createElement(EstimateActionMenu, { ...base, tile: true }));
    expect(tile).toContain("min-h-16");
    expect(tile).toContain('aria-label="More estimate actions"');
    expect(html(createElement(EstimateActionMenu, base))).not.toContain("min-h-16");
  });
});

describe("the payment method tiles", () => {
  const out = html(createElement(MethodTiles, { value: "CASH", onChange: vi.fn() }));

  it("offers the same five methods as the drop-down did, in words", () => {
    for (const word of ["Card", "Cash", "Check", "Store credit", "Other"]) expect(out).toContain(`>${word}<`);
    expect(out.match(/role="radio"/g)).toHaveLength(5);
    expect(out).toContain('role="radiogroup"');
  });

  it("posts the chosen method in the same `method` field", () => {
    expect(out).toContain('<input type="hidden" name="method" value="CASH"/>');
  });

  it("marks only the chosen tile, filled, and keeps every tile 56px or taller", () => {
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out.match(/aria-checked="false"/g)).toHaveLength(4);
    expect(out).toContain("bg-accent");
    expect(out.match(/min-h-14/g)).toHaveLength(5);
    expectCalm(out);
  });
});
