import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The panel and the owner's edit dialog only need these to exist.
vi.mock("@/app/(app)/time-clock/actions", () => ({
  clockInAction: vi.fn(),
  clockOutAction: vi.fn(),
  updateTimeClockEntryAction: vi.fn(),
  deleteTimeClockEntryAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

const { TooltipProvider } = await import("@/components/ui/tooltip");
const { ClockPanel } = await import("@/components/time-clock/clock-panel");
const { TeamWeek, TodayShifts } = await import("@/components/time-clock/shift-cards");
const { clockPanelCopy, shiftRange, shiftSeconds } = await import("@/components/time-clock/shift-meta");

const NOW = new Date(2026, 9, 3, 15, 0, 0);

describe("clockPanelCopy", () => {
  it("clocked out: today's hours, and the one action is Clock in", () => {
    const copy = clockPanelCopy({
      running: false,
      openSinceLabel: null,
      todaySeconds: 3 * 3600 + 5 * 60,
      weekSeconds: 12 * 3600 + 30 * 60,
      elapsedSeconds: 0,
    });
    expect(copy.status).toBe("Clocked out");
    expect(copy.figure).toBe("3h 5m");
    expect(copy.caption).toBe("worked today · 12h 30m this week");
    expect(copy.action).toBe("Clock in");
    expect(copy.busyAction).toBe("Clocking in…");
  });

  it("running: a ticking clock, and the one action is Clock out", () => {
    const copy = clockPanelCopy({
      running: true,
      openSinceLabel: "9:14 AM",
      todaySeconds: 3600,
      weekSeconds: 10 * 3600,
      elapsedSeconds: 2 * 3600 + 1,
    });
    expect(copy.status).toBe("On the clock");
    expect(copy.figure).toBe("02:00:01");
    expect(copy.caption).toBe("Since 9:14 AM · 3h 0m today");
    expect(copy.action).toBe("Clock out");
    expect(copy.busyAction).toBe("Clocking out…");
  });
});

describe("shift words", () => {
  it("writes a finished shift as a range and a running one as 'now'", () => {
    expect(shiftRange(new Date(2026, 9, 3, 9, 14), new Date(2026, 9, 3, 12, 30))).toBe("9:14 AM – 12:30 PM");
    expect(shiftRange(new Date(2026, 9, 3, 9, 14), null)).toBe("9:14 AM – now");
  });

  it("counts a running shift up to the render's clock", () => {
    const entry = { clockInAt: new Date(2026, 9, 3, 9, 0), clockOutAt: null };
    expect(shiftSeconds(entry, NOW)).toBe(6 * 3600);
    expect(shiftSeconds({ ...entry, clockOutAt: new Date(2026, 9, 3, 10, 0) }, NOW)).toBe(3600);
  });
});

describe("ClockPanel", () => {
  function panel(over: Record<string, unknown> = {}): string {
    return renderToStaticMarkup(
      React.createElement(ClockPanel, {
        openSinceISO: null,
        openSinceLabel: null,
        todaySeconds: 0,
        weekSeconds: 8 * 3600,
        ...over,
      }),
    );
  }

  it("shows ONE very large button: Clock in while clocked out", () => {
    const html = panel();
    expect(html).toContain("Clock in");
    expect(html).not.toContain("Clock out");
    expect(html).toContain("Clocked out");
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    // 80px tall, comfortably over the 64px floor.
    expect(html).toContain("h-20");
  });

  it("flips to a single Clock out button while a shift is running", () => {
    const html = panel({ openSinceISO: new Date(2026, 9, 3, 9, 14).toISOString(), openSinceLabel: "9:14 AM" });
    expect(html).toContain("Clock out");
    expect(html).not.toContain("Clock in");
    expect(html).toContain("On the clock");
    expect(html).toContain("Since 9:14 AM");
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect(html).toContain("h-20");
  });
});

describe("TodayShifts", () => {
  it("lists each shift as a card with its hours, and Running in words", () => {
    const html = renderToStaticMarkup(
      React.createElement(TodayShifts, {
        entries: [
          { id: "e1", clockInAt: new Date(2026, 9, 3, 8, 0), clockOutAt: new Date(2026, 9, 3, 12, 0), note: "Half day" },
          { id: "e2", clockInAt: new Date(2026, 9, 3, 13, 0), clockOutAt: null, note: null },
        ],
        now: NOW,
        caption: "6h 0m worked today",
      }),
    );
    expect(html).toContain("8:00 AM – 12:00 PM");
    expect(html).toContain("4h 0m");
    expect(html).toContain("Half day");
    expect(html).toContain("1:00 PM – now");
    expect(html).toContain("2h 0m");
    expect(html).toContain("Running");
    // The line under "Today" is about today, not the week.
    expect(html).toContain("6h 0m worked today");
  });

  it("names the next action when nothing is logged", () => {
    const html = renderToStaticMarkup(
      React.createElement(TodayShifts, { entries: [], now: NOW, caption: "0m this week" }),
    );
    expect(html).toContain("Nothing logged today");
    expect(html).toContain("Clock in");
  });
});

describe("TeamWeek", () => {
  const start = new Date(2026, 8, 28);
  const end = new Date(2026, 9, 4, 23, 59);
  const row = {
    name: "Marcus Webb",
    seconds: 8 * 3600,
    entries: [
      {
        id: "e1",
        clockInAt: new Date(2026, 8, 29, 9, 0),
        clockOutAt: new Date(2026, 8, 29, 17, 0),
        note: null,
        user: { name: "Marcus Webb" },
      },
    ],
  };
  const common = {
    now: NOW,
    start,
    end,
    totalSeconds: 8 * 3600,
    isThisWeek: false,
    prevHref: "/time-clock?week=2026-09-21",
    thisWeekHref: "/time-clock?week=2026-10-03",
    nextHref: "/time-clock?week=2026-10-05",
    exportHref: "/time-clock/export?week=2026-09-28",
  };

  it("keeps the owner's controls: week navigation, export and shift corrections", () => {
    // The app shell supplies the tooltip provider the edit buttons sit under.
    const html = renderToStaticMarkup(
      React.createElement(TooltipProvider, null, React.createElement(TeamWeek, { ...common, rows: [row] })),
    );
    expect(html).toContain("The team · Sep 28 – Oct 4, 2026");
    expect(html).toContain("8h 0m across 1 person");
    expect(html).toContain('href="/time-clock?week=2026-09-21"');
    expect(html).toContain("Previous week");
    expect(html).toContain('href="/time-clock?week=2026-10-03"');
    expect(html).toContain("This week");
    expect(html).toContain("Next week");
    expect(html).toContain('href="/time-clock/export?week=2026-09-28"');
    expect(html).toContain("Download timesheet");
    expect(html).toContain("Marcus Webb");
    expect(html).toContain("Tue Sep 29");
    expect(html).toContain("9:00 AM – 5:00 PM");
    // One worded button per shift (Delete lives inside its dialog), never a bare pencil and a red bin.
    expect(html).toContain("Fix this shift");
    expect(html).toContain("Fix Marcus Webb&#x27;s shift");
    expect(html).not.toContain("Delete Marcus Webb&#x27;s entry");
  });

  it("drops 'This week' when already on this week, and says so when nobody clocked in", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(TeamWeek, { ...common, isThisWeek: true, totalSeconds: 0, rows: [] }),
      ),
    );
    expect(html).not.toContain(">This week<");
    expect(html).toContain("Nobody clocked in this week");
    expect(html).toContain("0m across 0 people");
  });
});
