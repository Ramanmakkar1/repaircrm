import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircleDollarSign } from "lucide-react";
import { describe, expect, it } from "vitest";

import { DateRangeForm } from "@/components/reports/date-range";
import { PeriodPills, periodTabs } from "@/components/reports/period-pills";
import { resolveReportPeriod } from "@/components/reports/period";
import { KpiTile } from "@/components/reports/stat-card";

describe("periodTabs", () => {
  it("is one tab per period, with the chosen one marked", () => {
    const tabs = periodTabs("last-month");
    expect(tabs.map((tab) => tab.label)).toEqual(["This month", "Last month", "Last 90 days", "This year"]);
    expect(tabs.filter((tab) => tab.active).map((tab) => tab.label)).toEqual(["Last month"]);
    expect(tabs[0].href).toBe("/reports?period=this-month");
  });

  it("marks nothing while a hand-picked range is on screen", () => {
    expect(periodTabs("custom").some((tab) => tab.active)).toBe(false);
  });

  it("carries the location through every tab", () => {
    for (const tab of periodTabs("this-month", "loc 1")) {
      expect(tab.href).toContain("&location=loc%201");
    }
  });
});

describe("PeriodPills", () => {
  it("renders the same big pill tabs as every list screen", () => {
    const html = renderToStaticMarkup(React.createElement(PeriodPills, { active: "this-year" }));
    expect(html).toContain('aria-label="Reporting period"');
    expect((html.match(/<a\b/g) ?? []).length).toBe(4);
    // The chosen period is filled and announced, not just coloured.
    expect(html.match(/aria-current="page"/g)?.length).toBe(1);
    expect(html).toMatch(/aria-current="page"[^>]*>This year/);
    expect(html).toContain("data-touch-control");
    expect(html).toContain("bg-accent");
  });
});

describe("DateRangeForm", () => {
  const period = resolveReportPeriod({ period: "custom", from: "2026-09-01", to: "2026-09-30" });

  it("Easy mode tucks the dates behind one big button, open when a custom range is on screen", () => {
    const closed = renderToStaticMarkup(
      React.createElement(DateRangeForm, { period: resolveReportPeriod({}), simple: true }),
    );
    expect(closed).toContain("<details");
    expect(closed).not.toContain('open=""');
    expect(closed).toContain("Pick your own dates");
    // Still a plain GET form, so nothing about the URL changes.
    expect(closed).toContain('method="get"');
    expect(closed).toContain('action="/reports"');
    expect(closed).toContain('name="period" value="custom"');

    const open = renderToStaticMarkup(React.createElement(DateRangeForm, { period, simple: true }));
    expect(open).toContain('open=""');
    expect(open).toContain('value="2026-09-01"');
    expect(open).toContain('value="2026-09-30"');
  });

  it("Full mode keeps the form inline", () => {
    const html = renderToStaticMarkup(React.createElement(DateRangeForm, { period }));
    expect(html).not.toContain("<details");
    expect(html).toContain('name="from"');
    expect(html).toContain('name="to"');
  });
});

describe("KpiTile", () => {
  const props = { label: "Net revenue", value: "$2,362.66", hint: "$2,427.59 collected", icon: CircleDollarSign };

  it("large: the label in words, the number big, one line of context", () => {
    const html = renderToStaticMarkup(React.createElement(KpiTile, { ...props, variant: "large", tone: "success" }));
    expect(html).toContain("Net revenue");
    expect(html).toContain("$2,362.66");
    expect(html).toContain("$2,427.59 collected");
    expect(html).toContain("text-4xl");
  });

  it("small is the same tile, a size down", () => {
    const html = renderToStaticMarkup(React.createElement(KpiTile, { ...props, variant: "small" }));
    expect(html).toContain("text-2xl");
    expect(html).not.toContain("text-4xl");
  });

  it("opens the list behind the figure when it has one", () => {
    const html = renderToStaticMarkup(
      React.createElement(KpiTile, { ...props, variant: "large", href: "/invoices?status=SENT" }),
    );
    expect(html).toContain('href="/invoices?status=SENT"');
  });

  it("keeps the dense dashboard tile for Full mode", () => {
    const html = renderToStaticMarkup(React.createElement(KpiTile, props));
    expect(html).toContain("Net revenue");
    expect(html).not.toContain("text-4xl");
  });
});
