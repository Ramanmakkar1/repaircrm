import { describe, expect, it } from "vitest";

import {
  addDaysToKey,
  clockLabel,
  dayKeyIn,
  dayWindow,
  mondayOfKey,
  parseDayKey,
  parseWallDateTime,
  startOfZonedDay,
  timeLabelIn,
  wallClock,
  wallDate,
  wallDateTimeValue,
  wallTimeValue,
  zonedInstant,
} from "@/lib/dashboard/zone";
import { dayKeyIn as logicDayKeyIn, invoiceDaysLate, safeTimeZone, spanWords, startOfZonedDay as logicStart } from "@/lib/dashboard/logic";
import {
  dayKeyOfInstant,
  defaultBookingSlot,
  isOnDay,
  layoutDay,
  nowOffsetPx,
  rangeOfDays,
  shortTime,
  timeRange,
  wallTimeOf,
} from "@/components/appointments/calendar-meta";
import { shopWeek } from "@/app/(app)/time-clock/meta";
import { forgottenShift, shiftDay, shiftRange } from "@/components/time-clock/shift-meta";
import { fromFriendlyBody, toFriendlyBody, waitWords } from "@/components/marketing/meta";
import { leadAge } from "@/components/leads/lead-meta";
import { formatWhen } from "@/lib/jobs/appointments";

/**
 * The shop's clock, not the server's.
 *
 * Every live shop is in America/Edmonton (UTC-6 in October) while the server
 * runs in UTC; these pin the instants each helper produces against UTC, so they
 * hold whatever zone the test runner itself is in.
 */
const EDMONTON = "America/Edmonton";
const at = (iso: string) => new Date(iso);

describe("zone primitives", () => {
  it("reads the wall clock in the shop's zone, not the process's", () => {
    // 02:30 UTC on Oct 5 is still the evening of Oct 4 in Edmonton.
    const ms = Date.parse("2026-10-05T02:30:00Z");
    expect(dayKeyIn(ms, EDMONTON)).toBe("2026-10-04");
    expect(dayKeyIn(ms, "UTC")).toBe("2026-10-05");
    expect(wallClock(ms, EDMONTON)).toMatchObject({ year: 2026, month: 10, day: 4, hour: 20, minute: 30, weekday: 0 });
    expect(wallTimeValue(ms, EDMONTON)).toBe("20:30");
    expect(wallDateTimeValue(ms, EDMONTON)).toBe("2026-10-04T20:30");
    expect(timeLabelIn(ms, EDMONTON)).toBe("8:30 PM");
  });

  it("turns historical wall readings into the right instant across a clock change", () => {
    expect(new Date(zonedInstant(2025, 10, 4, 9, 0, EDMONTON)).toISOString()).toBe("2025-10-04T15:00:00.000Z");
    expect(new Date(zonedInstant(2025, 11, 3, 9, 0, EDMONTON)).toISOString()).toBe("2025-11-03T16:00:00.000Z");
    expect(new Date(startOfZonedDay(2025, 10, 4, EDMONTON)).toISOString()).toBe("2025-10-04T06:00:00.000Z");
    const day = dayWindow("2025-11-02", EDMONTON);
    expect((day.toExclusive - day.from) / 3_600_000).toBe(25);
  });

  it("keeps Alberta on permanent UTC-6 after November 2026", () => {
    expect(new Date(zonedInstant(2026, 11, 2, 9, 0, EDMONTON)).toISOString()).toBe("2026-11-02T15:00:00.000Z");
    const day = dayWindow("2026-11-01", EDMONTON);
    expect((day.toExclusive - day.from) / 3_600_000).toBe(24);
  });

  it("parses a typed date and time as the shop's wall clock", () => {
    expect(new Date(parseWallDateTime("2026-10-04T09:30", EDMONTON)!).toISOString()).toBe("2026-10-04T15:30:00.000Z");
    expect(parseWallDateTime("2026-02-31T09:30", EDMONTON)).toBeNull();
    expect(parseWallDateTime("2026-10-04T25:00", EDMONTON)).toBeNull();
    expect(parseWallDateTime("", EDMONTON)).toBeNull();
  });

  it("does calendar sums on day keys", () => {
    expect(parseDayKey("2026-10-04")).toEqual({ year: 2026, month: 10, day: 4 });
    expect(parseDayKey("nope")).toBeNull();
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(mondayOfKey("2026-10-04")).toBe("2026-09-28");
    expect(mondayOfKey("2026-09-28")).toBe("2026-09-28");
    expect(clockLabel(0, 0)).toBe("12 AM");
    expect(clockLabel(13, 5)).toBe("1:05 PM");
  });

  it("gives a Date whose local fields read the shop's wall clock (the booking dialog's 'now')", () => {
    const local = wallDate(Date.parse("2026-10-05T02:30:00Z"), EDMONTON);
    expect([local.getFullYear(), local.getMonth() + 1, local.getDate(), local.getHours(), local.getMinutes()]).toEqual([2026, 10, 4, 20, 30]);
  });

  it("keeps the overview's helpers exported from logic, unchanged", () => {
    expect(logicDayKeyIn(Date.parse("2026-10-05T02:30:00Z"), EDMONTON)).toBe("2026-10-04");
    expect(logicStart(2026, 10, 4, EDMONTON)).toBe(startOfZonedDay(2026, 10, 4, EDMONTON));
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
  });
});

describe("the calendar on the shop's clock", () => {
  const visit = { startsAt: at("2026-10-04T16:30:00Z"), endsAt: at("2026-10-04T17:30:00Z") };

  it("prints a booking's time and day in the shop's zone", () => {
    expect(shortTime(visit.startsAt, EDMONTON)).toBe("10:30 AM");
    expect(timeRange(visit.startsAt, visit.endsAt, EDMONTON)).toBe("10:30 AM – 11:30 AM");
    expect(wallTimeOf(visit.startsAt, EDMONTON)).toBe("10:30");
    // 8:30 PM on Oct 4 in Edmonton is already Oct 5 in UTC: the calendar puts it on the 4th.
    const evening = at("2026-10-05T02:30:00Z");
    expect(dayKeyOfInstant(evening, EDMONTON)).toBe("2026-10-04");
    expect(isOnDay(evening, new Date(2026, 9, 4), EDMONTON)).toBe(true);
    expect(isOnDay(evening, new Date(2026, 9, 5), EDMONTON)).toBe(false);
  });

  it("asks the database for the shop's days, midnight to midnight", () => {
    const range = rangeOfDays(new Date(2026, 8, 28), new Date(2026, 9, 4), EDMONTON);
    expect(range.from.toISOString()).toBe("2026-09-28T06:00:00.000Z");
    expect(range.toExclusive.toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });

  it("places a block from 8 AM on the shop's wall, with Easy mode's 48px floor", () => {
    const [placed] = layoutDay(new Date(2026, 9, 4), [visit], { zone: EDMONTON });
    expect(placed.topPx).toBe(2.5 * 64);
    expect(placed.heightPx).toBe(64);
    const short = { startsAt: at("2026-10-04T15:00:00Z"), endsAt: at("2026-10-04T15:15:00Z") };
    const [easy] = layoutDay(new Date(2026, 9, 4), [short], { zone: EDMONTON, hourPx: 96, minBlockPx: 48 });
    expect(easy.topPx).toBe(96);
    expect(easy.heightPx).toBe(48);
    expect(nowOffsetPx(at("2026-10-04T15:30:00Z"), EDMONTON)).toBe(1.5 * 64);
    expect(nowOffsetPx(at("2026-10-04T03:00:00Z"), EDMONTON)).toBeNull();
  });

  it("starts a new booking on the next round hour inside the calendar's day (bug: 9-10 PM at 8 PM)", () => {
    // 2:20 PM in Edmonton.
    expect(defaultBookingSlot(at("2026-10-04T20:20:00Z"), EDMONTON)).toEqual({ date: "2026-10-04", time: "15:00", endTime: "16:00" });
    // 6 AM: the first hour of the day.
    expect(defaultBookingSlot(at("2026-10-04T12:00:00Z"), EDMONTON)).toEqual({ date: "2026-10-04", time: "08:00", endTime: "09:00" });
    // 8 PM: no "9 PM today" outside the 8 AM - 8 PM grid; tomorrow at 8 instead.
    expect(defaultBookingSlot(at("2026-10-05T02:00:00Z"), EDMONTON)).toEqual({ date: "2026-10-05", time: "08:00", endTime: "09:00" });
    // 7:10 PM: the 7 PM slot has started, so tomorrow too.
    expect(defaultBookingSlot(at("2026-10-05T01:10:00Z"), EDMONTON).date).toBe("2026-10-05");
    // 6:40 PM: the 7 PM slot is still ahead.
    expect(defaultBookingSlot(at("2026-10-05T00:40:00Z"), EDMONTON)).toEqual({ date: "2026-10-04", time: "19:00", endTime: "20:00" });
  });
});

describe("Shop overview: late in the same words as the Repairs list", () => {
  it("rounds like lib/sla.ts spanShort ('Overdue 4d'), not down", () => {
    const DAY = 86_400_000;
    const HOUR = 3_600_000;
    // 3 days 14 hours: the Repairs list says "Overdue 4d"; the overview used to say "3 days".
    expect(spanWords(3 * DAY + 14 * HOUR)).toBe("4 days");
    expect(spanWords(3 * DAY + 11 * HOUR)).toBe("3 days");
    expect(spanWords(23.6 * HOUR)).toBe("1 day");
    expect(spanWords(59.6 * 60_000)).toBe("1 hour");
    expect(spanWords(10 * 60_000)).toBe("a few minutes");
  });

  it("counts an invoice's days late on the shop's calendar, its due date being a calendar day", () => {
    const due = Date.parse("2026-10-03T00:00:00Z"); // "due Oct 3" from the date box
    // 7 PM Oct 3 in Edmonton (01:00 UTC Oct 4): still the due day, not "1 day late".
    expect(invoiceDaysLate(due, Date.parse("2026-10-04T01:00:00Z"), EDMONTON)).toBe(0);
    expect(invoiceDaysLate(due, Date.parse("2026-10-04T01:00:00Z"))).toBe(1);
    // The next morning in Edmonton: 1 day late.
    expect(invoiceDaysLate(due, Date.parse("2026-10-04T15:00:00Z"), EDMONTON)).toBe(1);
    expect(invoiceDaysLate(Date.parse("2026-10-10T00:00:00Z"), Date.parse("2026-10-04T15:00:00Z"), EDMONTON)).toBe(0);
    expect(invoiceDaysLate(null, Date.now(), EDMONTON)).toBe(0);
  });
});

describe("time clock on the shop's calendar", () => {
  it("cuts the week and today at the shop's midnight", () => {
    // Sunday Oct 4, 8:30 PM in Edmonton = Monday 02:30 UTC.
    const week = shopWeek(null, Date.parse("2026-10-05T02:30:00Z"), EDMONTON);
    expect(week.todayKey).toBe("2026-10-04");
    expect(week.monday).toBe("2026-09-28");
    expect(week.sunday).toBe("2026-10-04");
    expect(week.from.toISOString()).toBe("2026-09-28T06:00:00.000Z");
    expect(week.toExclusive.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(week.todayFrom.toISOString()).toBe("2026-10-04T06:00:00.000Z");
    expect(week.isThisWeek).toBe(true);
    const earlier = shopWeek("2026-09-23", Date.parse("2026-10-05T02:30:00Z"), EDMONTON);
    expect(earlier.monday).toBe("2026-09-21");
    expect(earlier.isThisWeek).toBe(false);
    expect(shopWeek("garbage", Date.parse("2026-10-05T02:30:00Z"), EDMONTON).monday).toBe("2026-09-28");
  });

  it("writes shift times on the shop's clock", () => {
    expect(shiftRange(at("2026-10-04T15:14:00Z"), at("2026-10-04T18:30:00Z"), EDMONTON)).toBe("9:14 AM – 12:30 PM");
    expect(shiftRange(at("2026-10-04T15:14:00Z"), null, EDMONTON)).toBe("9:14 AM – now");
    expect(shiftDay(at("2026-10-05T02:30:00Z"), EDMONTON)).toBe("Sun Oct 4");
  });

  it("flags a forgotten clock-out in words, with a sensible time to fix it to", () => {
    // Clocked in Wed Sep 30 at 9:02 AM, still running on Sunday.
    const forgot = forgottenShift({ clockInAt: at("2026-09-30T15:02:00Z"), clockOutAt: null }, at("2026-10-04T17:17:00Z"), EDMONTON);
    expect(forgot).toEqual({
      since: "Wed Sep 30, 9:02 AM",
      running: "98h 15m",
      suggestedOut: "2026-09-30T18:00",
      suggestedLabel: "6:00 PM",
    });
    // A shift started this morning is just running.
    expect(forgottenShift({ clockInAt: at("2026-10-04T15:00:00Z"), clockOutAt: null }, at("2026-10-04T20:00:00Z"), EDMONTON)).toBeNull();
    // Closed shifts are never forgotten.
    expect(forgottenShift({ clockInAt: at("2026-09-30T15:02:00Z"), clockOutAt: at("2026-09-30T23:00:00Z") }, at("2026-10-04T17:17:00Z"), EDMONTON)).toBeNull();
  });
});

describe("marketing in plain words", () => {
  it("shows {{tokens}} as [words] in the editor and saves them back as tokens", () => {
    const body = "Hi {{firstName}}, repair #{{ticketNumber}} at {{ shopName }} {{unknownThing}} {{toString}}";
    const friendly = toFriendlyBody(body);
    expect(friendly).toBe("Hi [First name], repair #[Repair number] at [Shop name] {{unknownThing}} {{toString}}");
    expect(fromFriendlyBody(friendly)).toBe("Hi {{firstName}}, repair #{{ticketNumber}} at {{shopName}} {{unknownThing}} {{toString}}");
    expect(fromFriendlyBody("Hello [first  NAME] and [Not a field]")).toBe("Hello {{firstName}} and [Not a field]");
  });

  it("says the wait the way people do", () => {
    expect(waitWords(0)).toBe("Straight away");
    expect(waitWords(2)).toBe("2 days later");
    expect(waitWords(7)).toBe("1 week later");
    expect(waitWords(14)).toBe("2 weeks later");
    expect(waitWords(30)).toBe("1 month later");
    expect(waitWords(90)).toBe("3 months later");
    expect(waitWords(10)).toBe("10 days later");
  });
});

describe("other dates in the scope", () => {
  it("dates an old enquiry on the shop's calendar", () => {
    // Created 8:30 PM Sep 1 in Edmonton (02:30 UTC Sep 2).
    expect(leadAge(at("2026-09-02T02:30:00Z"), at("2026-10-04T17:00:00Z"), EDMONTON)).toBe("Sep 1, 2026");
    expect(leadAge(at("2026-10-04T16:00:00Z"), at("2026-10-04T17:00:00Z"), EDMONTON)).toBe("1h ago");
  });

  it("writes the reminder's 'when' on the shop's clock and calendar", () => {
    const now = at("2026-10-04T17:00:00Z"); // 11 AM Sunday in Edmonton
    expect(formatWhen(at("2026-10-04T22:00:00Z"), now, EDMONTON)).toBe("today at 4:00 PM");
    // 8:30 PM Monday in Edmonton is Tuesday in UTC: still "tomorrow" for the shop.
    expect(formatWhen(at("2026-10-06T02:30:00Z"), now, EDMONTON)).toBe("tomorrow at 8:30 PM");
    expect(formatWhen(at("2026-10-07T16:00:00Z"), now, EDMONTON)).toBe("Wed, Oct 7 at 10:00 AM");
  });
});
