import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { NeedsYouRow, PipelineTile } from "@/lib/dashboard/logic";
import type { ShopOverview } from "@/lib/dashboard/overview";

// The overview's pieces draw from plain data; the only thing they need from the app is a router that exists.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const { OverviewHeader } = await import("@/components/dashboard/overview-header");
const { TakingsHero, WeekBars } = await import("@/components/dashboard/takings-hero");
const { OwedCard } = await import("@/components/dashboard/owed-card");
const { BenchSection, BenchTile } = await import("@/components/dashboard/bench");
const { NeedsYouSection } = await import("@/components/dashboard/needs-you");
const { PopularCard, SellingCard, WorkloadCard } = await import("@/components/dashboard/team-demand");
const { AppointmentsCard, StockWatchCard } = await import("@/components/dashboard/coming-up");
const { MyQueueSection } = await import("@/components/dashboard/my-queue");
const { TodayStripView } = await import("@/components/dashboard/today-strip");
const { AssistantPanel } = await import("@/components/dashboard/assistant-panel");

/**
 * What the overview draws, from plain data: the hero and its bars, a pipeline
 * tile, the owed card, the lists, and every empty state. Static markup only, so
 * these read what a person (and a screen reader) would be given first.
 */

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const text = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const links = (markup: string) => [...markup.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));

/** A raw colour: a hex value or a Tailwind palette colour. The app only paints with theme tokens. */
const RAW_COLOUR = /#[0-9a-fA-F]{6}\b|\b(?:bg|text|border|ring|fill|stroke|from|to)-(?:red|green|blue|yellow|orange|amber|emerald|slate|gray|zinc|neutral|stone|rose|pink|purple|violet|indigo|sky|teal|cyan|lime|black)(?:-\d+)?\b/;

const today: NonNullable<ShopOverview["today"]> = {
  netCents: 10_300,
  grossCents: 13_300,
  refundCents: 3000,
  cashCents: 2500,
  cardCents: 10_000,
  otherCents: 800,
  comparison: { kind: "up", text: "$48 more than yesterday", deltaCents: 4800 },
  days: [
    { key: "2026-09-27", initial: "S", dayOfMonth: 27, label: "Sunday, Sep 27", netCents: 0, isToday: false, href: "/reports?period=custom&from=2026-09-27&to=2026-09-27" },
    { key: "2026-09-28", initial: "M", dayOfMonth: 28, label: "Monday, Sep 28", netCents: 26_959, isToday: false, href: "/reports?period=custom&from=2026-09-28&to=2026-09-28" },
    { key: "2026-09-29", initial: "T", dayOfMonth: 29, label: "Tuesday, Sep 29", netCents: 0, isToday: false, href: "/reports?period=custom&from=2026-09-29&to=2026-09-29" },
    { key: "2026-09-30", initial: "W", dayOfMonth: 30, label: "Wednesday, Sep 30", netCents: 0, isToday: false, href: "/reports?period=custom&from=2026-09-30&to=2026-09-30" },
    { key: "2026-10-01", initial: "T", dayOfMonth: 1, label: "Thursday, Oct 1", netCents: 120_000, isToday: false, href: "/reports?period=custom&from=2026-10-01&to=2026-10-01" },
    { key: "2026-10-02", initial: "F", dayOfMonth: 2, label: "Friday, Oct 2", netCents: 5500, isToday: false, href: "/reports?period=custom&from=2026-10-02&to=2026-10-02" },
    { key: "2026-10-03", initial: "S", dayOfMonth: 3, label: "Saturday, Oct 3", netCents: 10_300, isToday: true, href: "/reports?period=custom&from=2026-10-03&to=2026-10-03" },
  ],
  weekNetCents: 162_759,
  todayHref: "/reports?period=custom&from=2026-10-03&to=2026-10-03",
};

const nothingToday: NonNullable<ShopOverview["today"]> = {
  ...today,
  netCents: 0,
  grossCents: 0,
  refundCents: 0,
  cashCents: 0,
  cardCents: 0,
  otherCents: 0,
  comparison: { kind: "none", text: "Nothing taken yet today", deltaCents: 0 },
  days: today.days.map((day) => ({ ...day, netCents: 0 })),
  weekNetCents: 0,
};

const phone = { type: "Phone", make: "Apple", model: "iPhone 14 Pro" };

describe("the header", () => {
  const header = html(React.createElement(OverviewHeader, { greeting: "Good morning", firstName: "Dana", shopName: "Demo Repair Shop", branchName: "Downtown", dateLabel: "Saturday, October 3" }));

  it("greets by name and says where and when", () => {
    expect(header).toContain("Good morning, Dana");
    expect(text(header)).toContain("Shop overview · Demo Repair Shop · Downtown · Saturday, October 3");
  });

  it("has New repair first and New sale second, as big links", () => {
    expect(links(header)).toEqual(["/tickets/new", "/pos"]);
    expect(text(header).indexOf("New repair")).toBeLessThan(text(header).indexOf("New sale"));
    expect(header.match(/data-touch-control/g)).toHaveLength(2);
  });

  it("drops the name and the branch when it has none", () => {
    const bare = html(React.createElement(OverviewHeader, { greeting: "Hello", firstName: "", shopName: "Demo Repair Shop", branchName: null, dateLabel: "Saturday, October 3" }));
    expect(bare).toContain(">Hello<");
    expect(text(bare)).toContain("Shop overview · Demo Repair Shop · Saturday, October 3");
  });
});

describe("Takings today", () => {
  const hero = html(React.createElement(TakingsHero, { today }));

  it("prints the net amount big, and says in words how it compares", () => {
    expect(hero).toContain('data-testid="takings-amount"');
    expect(hero).toMatch(/data-testid="takings-amount">\$103\.00</);
    expect(text(hero)).toContain("$48 more than yesterday");
    expect(text(hero)).toContain("Takings today");
  });

  it("shows cash, card and other as chips, and the refunds when there were some", () => {
    const readable = text(hero);
    expect(readable).toContain("Cash $25");
    expect(readable).toContain("Card $100");
    expect(readable).toContain("Other $8");
    expect(readable).toContain("Refunded $30");
    expect(text(html(React.createElement(TakingsHero, { today: nothingToday })))).not.toContain("Refunded");
  });

  it("opens Reports for today", () => {
    expect(links(hero)).toContain("/reports?period=custom&from=2026-10-03&to=2026-10-03");
  });

  it("says nothing taken, in words, on a quiet day", () => {
    const quiet = html(React.createElement(TakingsHero, { today: nothingToday }));
    expect(quiet).toMatch(/data-testid="takings-amount">\$0\.00</);
    expect(text(quiet)).toContain("Nothing taken yet today");
    expect(text(quiet)).toContain("Cash $0");
  });

  it("has no raw colours: only theme tokens", () => {
    expect(hero).not.toMatch(RAW_COLOUR);
  });
});

describe("Last 7 days", () => {
  const bars = html(React.createElement(WeekBars, { days: today.days, totalCents: today.weekNetCents }));

  it("is one link per day, each to Reports for that day, today last", () => {
    expect(links(bars)).toEqual(today.days.map((day) => day.href));
    expect(bars.match(/<li /g)).toHaveLength(7);
  });

  it("prints every amount and every weekday initial: no value lives only in a bar", () => {
    const readable = text(bars);
    for (const amount of ["$0", "$270", "$1.2k", "$55", "$103"]) expect(readable).toContain(amount);
    const initials = [...bars.matchAll(/text-\[13px\][^>]*>([A-Z])</g)].map((match) => match[1]).join("");
    expect(initials).toBe("SMTWTFS");
    expect(readable).toContain("$1,627.59 in all");
  });

  it("names each bar by its day and its amount from hidden text, so the printed amount is part of the name", () => {
    expect(bars).toContain('<span class="sr-only">Monday, Sep 28: $269.59 taken. Open this day in Reports.</span>');
    expect(text(bars)).toContain("Today, Saturday, Oct 3: $103.00 taken. Open this day in Reports.");
    // An aria-label would replace the content as the name, and the visible "$270" would not be in it.
    expect(bars).not.toContain("aria-label");
    // The printed figures, initials and dates are aria-hidden: the sentence above is the one a screen reader gets.
    expect(bars.match(/aria-hidden="true"/g)).toHaveLength(21);
  });

  it("marks today with aria-current, a filled bar and a bold label, not by colour alone", () => {
    expect(bars.match(/aria-current="date"/g)).toHaveLength(1);
    const todayLink = bars.slice(bars.indexOf('aria-current="date"'));
    expect(todayLink).toContain("font-bold");
    expect(todayLink).toContain("bg-accent");
  });

  it("scales bars to the biggest day, gives an empty day no bar and never gates visibility on the animation", () => {
    const heights = [...bars.matchAll(/style="height:([\d.]+)%"/g)].map((match) => Number(match[1]));
    expect(heights).toHaveLength(7);
    expect(Math.max(...heights)).toBe(100);
    expect(heights[0]).toBe(0);
    // The entrance is a transition that reduced-motion switches off; the resting state is the visible one.
    expect(bars).toContain("motion-reduce:transition-none");
    expect(bars).not.toMatch(/\bopacity-0\b|\binvisible\b|class="[^"]*\bhidden\b/);
  });

  it("handles a week with no takings at all", () => {
    const empty = html(React.createElement(WeekBars, { days: nothingToday.days, totalCents: 0 }));
    expect(empty.match(/<li /g)).toHaveLength(7);
    expect([...empty.matchAll(/style="height:([\d.]+)%"/g)].every((match) => Number(match[1]) === 0)).toBe(true);
  });
});

describe("Owed to you", () => {
  const owed: NonNullable<ShopOverview["owed"]> = {
    totalCents: 83_812,
    count: 5,
    overdueCount: 1,
    truncated: false,
    customers: [
      { customerId: "c1", name: "Okonkwo Dental Group", cents: 74_614, invoices: 2, callHref: "tel:+17805550100" },
      { customerId: "c2", name: "Owen Fitzgerald", cents: 2705, invoices: 1, callHref: null },
    ],
    lateInvoices: [],
  };

  it("prints the total and the count, and links Collect payments to the unpaid list", () => {
    const card = html(React.createElement(OwedCard, { owed }));
    expect(card).toMatch(/data-testid="owed-amount">\$838\.12</);
    expect(text(card)).toContain("5 unpaid invoices");
    expect(links(card)).toContain("/invoices?status=unpaid");
    expect(text(card)).toContain("Collect payments");
  });

  it("says how many are overdue in words, with an icon", () => {
    const card = html(React.createElement(OwedCard, { owed }));
    expect(text(card)).toContain("1 invoice overdue");
    expect(text(html(React.createElement(OwedCard, { owed: { ...owed, overdueCount: 3 } })))).toContain("3 invoices overdue");
    expect(html(React.createElement(OwedCard, { owed: { ...owed, overdueCount: 0 } }))).not.toContain("overdue");
  });

  it("gives each customer a Call button that is a tel: link, and none to someone with no number", () => {
    const card = html(React.createElement(OwedCard, { owed }));
    expect(links(card)).toContain("tel:+17805550100");
    expect(card).toContain('aria-label="Call Okonkwo Dental Group"');
    expect(card).not.toContain('aria-label="Call Owen Fitzgerald"');
    expect(text(card)).toContain("$746.14 owed · 2 invoices");
    expect(links(card)).toContain("/customers/c1");
  });

  it("is a calm sentence, not an empty box, when nobody owes anything", () => {
    const card = html(React.createElement(OwedCard, { owed: { totalCents: 0, count: 0, overdueCount: 0, truncated: false, customers: [], lateInvoices: [] } }));
    expect(text(card)).toContain("Nobody owes you anything right now.");
    expect(text(card)).toContain("No unpaid invoices");
    expect(card).toMatch(/data-testid="owed-amount">\$0\.00</);
  });

  it("marks the total as a minimum when more invoices exist than were read", () => {
    expect(html(React.createElement(OwedCard, { owed: { ...owed, truncated: true } }))).toMatch(/data-testid="owed-amount">\$838\.12\+</);
  });
});

describe("a pipeline tile", () => {
  const tile = (over: Partial<PipelineTile> = {}): PipelineTile => ({ status: "In Progress", count: 4, overdue: 2, href: "/tickets?status=In%20Progress", devices: [phone, phone, phone], ...over });

  it("is one link: the count, the status in words, the pictures and the late count in words", () => {
    const markup = html(React.createElement(BenchTile, { tile: tile() }));
    expect(links(markup)).toEqual(["/tickets?status=In%20Progress"]);
    // The link's name is its own content, so what is printed is what is spoken.
    expect(markup).not.toContain("aria-label");
    expect(text(markup)).toBe("4 In Progress 2 overdue");
    expect(text(markup)).toContain("4");
    expect(text(markup)).toContain("In Progress");
    expect(text(markup)).toContain("2 overdue");
    expect(markup.match(/<img /g)).toHaveLength(3);
  });

  it("has no late chip when nothing is late, and no pictures when there are no devices", () => {
    const markup = html(React.createElement(BenchTile, { tile: tile({ overdue: 0, devices: [] }) }));
    expect(markup).not.toContain("overdue");
    expect(markup).not.toContain("<img");
    expect(text(markup)).toBe("4 In Progress");
  });

  it("keeps an empty status as a tile at zero, still a link", () => {
    const markup = html(React.createElement(BenchTile, { tile: tile({ count: 0, overdue: 0, devices: [] }) }));
    expect(text(markup)).toContain("0");
    expect(links(markup)).toHaveLength(1);
  });

  it("paints the device pictures on a white canvas and nothing else in a raw colour", () => {
    const markup = html(React.createElement(BenchTile, { tile: tile() }));
    expect(markup).toContain("bg-white");
    expect(markup.replace(/bg-white/g, "")).not.toMatch(RAW_COLOUR);
  });
});

describe("Repairs on the bench", () => {
  const tiles: PipelineTile[] = [
    { status: "New", count: 2, overdue: 1, href: "/tickets?status=New", devices: [phone] },
    { status: "In Progress", count: 4, overdue: 4, href: "/tickets?status=In%20Progress", devices: [] },
  ];
  const bench = { tiles, open: 6, late: 5, dueToday: 1, needsReply: 2, sentence: "6 open repairs. 5 are late.", finish: { words: "3.2 days", count: 12 } };

  it("says it in one sentence, adds the average time to finish, and offers Due today, Overdue and Needs reply", () => {
    const markup = html(React.createElement(BenchSection, { bench }));
    const readable = text(markup);
    expect(readable).toContain("6 open repairs. 5 are late.");
    expect(readable).toContain("Average time to finish: 3.2 days (last 30 days).");
    expect(links(markup)).toEqual(expect.arrayContaining(["/tickets?due=today", "/tickets?due=overdue", "/tickets?status=needs-reply", "/tickets?status=New", "/tickets?status=In%20Progress"]));
    expect(readable).toContain("Due today 1");
    expect(readable).toContain("Overdue 5");
    expect(readable).toContain("Needs reply 2");
  });

  it("gives customers waiting for a reply a way in, in words, and keeps it when nobody is waiting", () => {
    const waiting = text(html(React.createElement(BenchSection, { bench })));
    expect(waiting).toContain("Needs reply 2");
    const none = html(React.createElement(BenchSection, { bench: { ...bench, needsReply: 0 } }));
    expect(text(none)).toContain("Needs reply 0");
    expect(links(none)).toContain("/tickets?status=needs-reply");
  });

  it("leaves the average out when nothing was finished in the last 30 days", () => {
    expect(text(html(React.createElement(BenchSection, { bench: { ...bench, finish: null } })))).not.toContain("Average time");
  });

  it("is honest on an empty bench", () => {
    const markup = html(React.createElement(BenchSection, { bench: { tiles: [], open: 0, late: 0, dueToday: 0, needsReply: 0, sentence: "Nothing is on the bench.", finish: null } }));
    expect(text(markup)).toContain("Nothing is on the bench.");
    expect(links(markup)).toEqual(["/tickets?due=today", "/tickets?due=overdue", "/tickets?status=needs-reply"]);
  });
});

describe("Needs you now", () => {
  const row = (over: Partial<NeedsYouRow> & Pick<NeedsYouRow, "key" | "kind">): NeedsYouRow => ({
    tag: "Overdue",
    score: 1000,
    sentence: "Dell XPS 13 for Amara Nwosu is 3 days late.",
    visual: { kind: "device", device: phone, label: "Dell XPS 13" },
    action: { label: "Open", href: "/tickets/t_1" },
    ...over,
  });

  it("is a calm 'all caught up' with the next sensible action when there is nothing to do", () => {
    const markup = html(React.createElement(NeedsYouSection, { rows: [], candidates: 0 }));
    expect(text(markup)).toContain("You are all caught up");
    expect(links(markup)).toEqual(["/tickets/new"]);
    expect(text(markup)).toContain("New repair");
    // A picture, decorative.
    expect(markup).toContain("<img");
    expect(markup).toContain('alt=""');
  });

  it("shows each thing as a picture, one sentence and one button", () => {
    const rows = [
      row({ key: "overdue:t_1", kind: "overdue-repair" }),
      row({ key: "ready-unpaid:t_2", kind: "ready-unpaid", tag: "Unpaid", sentence: "Elena Marquez can collect their iPhone, but still owes $50.", action: { label: "Take payment", href: "/invoices/inv_1" } }),
      row({ key: "ready-waiting:t_3", kind: "ready-waiting", tag: "Ready", sentence: "iPhone has been ready for 5 days.", action: { label: "Call", href: "tel:+15125550111", call: true } }),
      row({ key: "reply:t_4", kind: "reply", tag: "Reply", sentence: "Sofia is waiting for a reply.", action: { label: "Reply", href: "/tickets/t_4" } }),
      row({ key: "stock:p1", kind: "low-stock", tag: "Low stock", sentence: "MacBook Keyboard: only 2 left.", visual: { kind: "product", productId: "p1", name: "MacBook Keyboard", category: "Parts", catalogImage: null, imageUrl: null }, action: { label: "Order more", href: "/inventory/purchase-orders/new" } }),
      row({ key: "invoice:i1", kind: "invoice-late", tag: "Unpaid", sentence: "Invoice #1014 is 2 days late.", visual: { kind: "person", name: "Okonkwo Dental Group" }, action: { label: "Take payment", href: "/invoices/i1" } }),
    ];
    const markup = html(React.createElement(NeedsYouSection, { rows, candidates: 9 }));
    const readable = text(markup);
    expect(markup.match(/<li /g)).toHaveLength(6);
    for (const label of ["Open", "Take payment", "Call", "Reply", "Order more"]) expect(readable).toContain(label);
    expect(links(markup)).toEqual(["/tickets/t_1", "/invoices/inv_1", "tel:+15125550111", "/tickets/t_4", "/inventory/purchase-orders/new", "/invoices/i1"]);
    expect(readable).toContain("The 6 that matter most. 3 more can wait.");
    // Seven different things need you and six are shown: one can wait. A count that included only the rows fetched would say so wrongly.
    expect(text(html(React.createElement(NeedsYouSection, { rows, candidates: 13 })))).toContain("The 6 that matter most. 7 more can wait.");
    // A person's initials stand in for a picture.
    expect(readable).toContain("OG");
    // Every row's tag is a word.
    for (const tag of ["Overdue", "Unpaid", "Ready", "Reply", "Low stock"]) expect(readable).toContain(tag);
    expect(markup.replace(/bg-white/g, "")).not.toMatch(RAW_COLOUR);
  });

  it("does not say 'more can wait' when everything is shown", () => {
    const markup = html(React.createElement(NeedsYouSection, { rows: [row({ key: "a", kind: "overdue-repair" })], candidates: 1 }));
    expect(text(markup)).toContain("In the order to do them.");
  });
});

describe("Who is working on what", () => {
  it("prints the name and the count in words on each row, and links each to that person's repairs", () => {
    const markup = html(
      React.createElement(WorkloadCard, {
        workload: {
          hidden: 2,
          rows: [
            { userId: null, name: "Not assigned", open: 2, late: 1, href: "/tickets?tech=unassigned", words: "Not assigned: 2 open, 1 late" },
            { userId: "u1", name: "Maria Wong", open: 5, late: 2, href: "/tickets?tech=u1", words: "Maria Wong: 5 open, 2 late" },
            { userId: "u2", name: "Sam Lee", open: 0, late: 0, href: "/tickets?tech=u2", words: "Sam Lee: nothing open" },
          ],
        },
      }),
    );
    const readable = text(markup);
    expect(readable).toContain("Maria Wong 5 open, 2 late");
    expect(readable).toContain("Not assigned 2 open, 1 late");
    expect(readable).toContain("Sam Lee nothing open");
    expect(markup).toContain('aria-label="Maria Wong: 5 open, 2 late"');
    expect(links(markup)).toEqual(["/tickets?tech=unassigned", "/tickets?tech=u1", "/tickets?tech=u2", "/tickets"]);
    expect(readable).toContain("And 2 more");
  });

  it("says so when nobody is busy", () => {
    expect(text(html(React.createElement(WorkloadCard, { workload: { rows: [], hidden: 0 } })))).toContain("No open repairs, so nobody is busy.");
  });
});

describe("Selling this week", () => {
  it("lists the top products with units and money, each opening the product", () => {
    const markup = html(
      React.createElement(SellingCard, {
        selling: {
          href: "/reports?period=custom&from=2026-09-27&to=2026-10-03",
          rows: [
            { productId: "p1", name: "iPhone 14 Screen Assembly", units: 1, cents: 18_900, category: "Parts", catalogImage: null, imageUrl: null },
            { productId: null, name: "Bench Diagnostic", units: 3, cents: 19_500, category: null, catalogImage: null, imageUrl: null },
          ],
        },
      }),
    );
    const readable = text(markup);
    expect(readable).toContain("iPhone 14 Screen Assembly");
    expect(readable).toContain("1 sold");
    expect(readable).toContain("$189.00");
    expect(readable).toContain("3 sold");
    expect(links(markup)).toEqual(["/inventory/p1", "/reports?period=custom&from=2026-09-27&to=2026-10-03"]);
    expect(markup.replace(/bg-white/g, "")).not.toMatch(RAW_COLOUR);
  });

  it("says when nothing sold", () => {
    expect(text(html(React.createElement(SellingCard, { selling: { href: "/reports", rows: [] } })))).toContain("No products sold yet this week.");
  });
});

describe("Popular repairs", () => {
  it("prints each type with its count in words beside a bar", () => {
    const markup = html(React.createElement(PopularCard, { popular: [{ label: "Screen Repair", count: 5 }, { label: "Battery", count: 1 }] }));
    const readable = text(markup);
    expect(readable).toContain("Screen Repair 5 repairs");
    expect(readable).toContain("Battery 1 repair");
    // The bars are decoration: the numbers above are the data.
    expect(markup.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(markup).not.toMatch(RAW_COLOUR);
  });

  it("says when nothing was checked in", () => {
    expect(text(html(React.createElement(PopularCard, { popular: [] })))).toContain("No repairs checked in over the last 30 days.");
  });
});

describe("Coming up and Stock watch", () => {
  it("lists the next visits, each a link to its day", () => {
    const markup = html(
      React.createElement(AppointmentsCard, {
        appointments: [{ id: "a1", title: "Data handover", customerName: "Amara Nwosu", startsAt: 0, day: "Tomorrow", time: "11:00 AM", href: "/appointments?date=2026-10-04" }],
      }),
    );
    expect(text(markup)).toContain("11:00 AM Tomorrow Amara Nwosu Data handover");
    expect(links(markup)).toEqual(["/appointments", "/appointments?date=2026-10-04"]);
  });

  it("offers to book a visit when none is booked", () => {
    const markup = html(React.createElement(AppointmentsCard, { appointments: [] }));
    expect(text(markup)).toContain("No visits booked.");
    expect(text(markup)).toContain("Book a visit");
  });

  const item = { id: "p1", name: "MacBook Pro 13\" Keyboard Assembly", stockQty: 2, lowStockAt: 2, vendorId: "v1", category: "Parts", catalogImage: null, imageUrl: null };

  it("shows low stock in words with the one reorder button", () => {
    const markup = html(React.createElement(StockWatchCard, { stock: { total: 6, items: [item, { ...item, id: "p2", stockQty: 0, name: "Pixel 8 Screen" }] }, canOrder: true }));
    const readable = text(markup);
    expect(readable).toContain("2 left · reorder at 2");
    expect(readable).toContain("Out of stock");
    expect(readable).toContain("Reorder");
    expect(readable).toContain("4 more at or below their reorder point.");
    expect(links(markup)).toEqual(["/inventory?filter=low", "/inventory/purchase-orders/new?vendorId=v1", "/inventory/purchase-orders/new?vendorId=v1"]);
    expect(readable).toContain("All 6 low");
  });

  it("opens the product instead for someone who may not raise a purchase order", () => {
    const markup = html(React.createElement(StockWatchCard, { stock: { total: 1, items: [item] }, canOrder: false }));
    expect(links(markup)).toContain("/inventory/p1");
    expect(text(markup)).not.toContain("Reorder");
  });

  it("is calm when nothing is running low", () => {
    const markup = html(React.createElement(StockWatchCard, { stock: { total: 0, items: [] }, canOrder: true }));
    expect(text(markup)).toContain("Nothing is running low.");
  });
});

describe("a technician's own queue", () => {
  it("says what they have in words and, with none, explains where repairs will appear", () => {
    const markup = html(React.createElement(MyQueueSection, { queue: { open: 0, late: 0, repairs: [], href: "/tickets?tech=u_tech" }, now: Date.UTC(2026, 9, 3, 15) }));
    const readable = text(markup);
    expect(readable).toContain("My repairs");
    expect(readable).toContain("You have no open repairs.");
    expect(readable).toContain("Nothing is waiting on you");
    expect(links(markup)).toEqual(["/tickets?tech=u_tech", "/tickets"]);
  });

  it("shows a repair as the Repairs list's own card", () => {
    const markup = html(
      React.createElement(MyQueueSection, {
        now: Date.UTC(2026, 9, 3, 15),
        queue: {
          open: 1,
          late: 1,
          href: "/tickets?tech=u_tech",
          repairs: [
            {
              id: "t_1",
              number: 1011,
              subject: "HP Envy x360 will not boot",
              status: "In Progress",
              priority: "NORMAL",
              dueAt: Date.UTC(2026, 9, 1),
              customer: { firstName: "Sofia", lastName: "Kaur", businessName: null },
              assignedToName: "Marcus Webb",
              asset: { type: "Laptop", make: "HP", model: "Envy x360" },
              attachments: [],
              partOrders: [],
              checklist: null,
              depositCents: 0,
              needsReply: false,
            },
          ],
        },
      }),
    );
    expect(text(markup)).toContain("You have 1 open repair. It is late.");
    expect(links(markup)).toContain("/tickets/t_1");
    expect(text(markup)).toContain("In Progress");
  });
});

describe("the strip for Home", () => {
  const strip = html(React.createElement(TodayStripView, { data: { todayKey: "2026-10-03", takingsCents: 10_300, owedCents: 83_812, owedTruncated: false, readyCount: 2 } }));

  it("shows the three numbers, each a link to the list behind it, and a link to the overview", () => {
    const readable = text(strip);
    expect(readable).toContain("Takings today $103.00");
    expect(readable).toContain("Owed to you $838.12");
    expect(readable).toContain("Ready for pickup 2");
    expect(readable).toContain("Shop overview");
    expect(links(strip)).toEqual([
      "/reports?period=custom&from=2026-10-03&to=2026-10-03",
      "/invoices?status=unpaid",
      "/tickets?status=Ready%20for%20Pickup",
      "/dashboard",
    ]);
  });

  it("is a labelled landmark made of big touch targets", () => {
    expect(strip).toContain('aria-label="Today at a glance"');
    expect(strip.match(/data-touch-control/g)).toHaveLength(4);
  });

  it("marks the owed figure as a minimum when it is truncated", () => {
    const markup = html(React.createElement(TodayStripView, { data: { todayKey: "2026-10-03", takingsCents: 0, owedCents: 5000, owedTruncated: true, readyCount: 0 } }));
    expect(text(markup)).toContain("Owed to you $50.00+");
    expect(text(markup)).toContain("Takings today $0.00");
    expect(text(markup)).toContain("Ready for pickup 0");
  });
});

describe("the assistant stays small", () => {
  it("is one compact card with the usual questions", () => {
    const markup = html(React.createElement(AssistantPanel, {}));
    expect(text(markup)).toContain("Ask Repairs helper");
    expect(markup).toContain('aria-label="Speak to Repairs helper"');
    expect(text(markup)).toContain("Which repairs are late?");
    expect(markup).not.toMatch(RAW_COLOUR);
  });
});
