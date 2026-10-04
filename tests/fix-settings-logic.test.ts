import { describe, expect, it } from "vitest";

import { hubLines, type HubFacts } from "@/components/settings/hub-status";
import { OWNER_PANELS, STAFF_PANELS, resolveHubPanel } from "@/components/settings/settings-panels";
import {
  agoWords,
  dayHeading,
  groupByShopDay,
  previousDayKey,
  shopDate,
  shopDateTime,
  shopTime,
  startOfShopMonth,
  timeZoneChoices,
} from "@/components/settings/shop-time";
import { escapeHtml, signHtml } from "@/components/settings/share-link";
import { saveBarMessage } from "@/components/settings/save-bar";
import { slaDraft, slaFromDraft } from "@/components/settings/sla-card";
import { waitLabel } from "@/components/settings/checkin-tab";
import { stepProgress, stepState, stepWords } from "@/components/onboarding/steps";
import {
  AUDIT_BURST_MINUTES,
  DEFAULT_DEVICE_KINDS,
  FIRST_SCREEN_BOXES,
  FIRST_SCREEN_KINDS,
  describeArrangement,
  firstScreenKinds,
  joinsArrangeBurst,
  moveDeviceKind,
  removeDeviceKind,
  restoreDeviceKind,
  restoreProblem,
  setDeviceHidden,
  visibleDeviceKinds,
  type DeviceKind,
} from "@/lib/intake-options";

const EDMONTON = "America/Edmonton";

// ---------------------------------------------------------------------------
// Settings hub
// ---------------------------------------------------------------------------

const facts: HubFacts = {
  shopName: "Demo Repair Shop",
  city: "Austin",
  devices: 13,
  problems: 7,
  locations: 2,
  replies: 3,
  people: 3,
  twoStepOn: false,
  payments: { connected: false, live: false, squareConnected: false, readers: 0 },
  shopLinkOn: false,
  emailLive: false,
  smsLive: false,
  checkinOn: true,
  reviewsOn: true,
  accounting: { connected: 0, error: 0, configured: false },
  developerKeys: 1,
  automationIntervalMin: 15,
};

describe("Settings hub tiles say what each area is doing, in words", () => {
  it("has a line for every owner area", () => {
    const lines = hubLines(facts);
    for (const panel of OWNER_PANELS) expect(lines[panel.value]?.detail.length).toBeGreaterThan(3);
  });

  it("answers 'is it on?' with a word, never a colour alone", () => {
    const lines = hubLines(facts);
    expect(lines.payments.state).toEqual({ label: "Cards not set up", tone: "neutral" });
    expect(lines.messaging.state?.label).toBe("Not sending yet");
    expect(lines.checkin.state?.label).toBe("Check-in on");
    expect(lines.connect.state?.label).toBe("Link is off");
    expect(lines.automation.state?.label).toBe("Running");
    expect(lines.integrations.state?.label).toBe("Not set up");
  });

  it("changes the word when the thing is on", () => {
    const lines = hubLines({ ...facts, payments: { connected: true, live: true, squareConnected: false, readers: 2 }, emailLive: true, smsLive: true, automationIntervalMin: 0, accounting: { connected: 1, error: 0, configured: true } });
    expect(lines.payments.state).toEqual({ label: "Card payments on", tone: "success" });
    expect(lines.payments.detail).toBe("Cards online and 2 card machines");
    expect(lines.messaging.state).toEqual({ label: "Sending", tone: "success" });
    expect(lines.automation.state?.label).toBe("Not running by itself");
    expect(lines.integrations.state?.label).toBe("Connected");
  });

  it("uses shop words, never developer ones", () => {
    const words = JSON.stringify(hubLines(facts)) + JSON.stringify(OWNER_PANELS.map((panel) => [panel.label, panel.blurb]));
    for (const jargon of ["ticket", "Ticket", "Canned", "Integrations", "API", "webhook", "Audit log", "Sync"]) expect(words).not.toContain(jargon);
  });
});

describe("resolveHubPanel: Easy mode's ?tab=", () => {
  it("opens a panel the role has, else the hub (null)", () => {
    expect(resolveHubPanel(OWNER_PANELS, "payments")).toBe("payments");
    expect(resolveHubPanel(OWNER_PANELS, "")).toBeNull();
    expect(resolveHubPanel(OWNER_PANELS, null)).toBeNull();
    expect(resolveHubPanel(OWNER_PANELS, "nonsense")).toBeNull();
    expect(resolveHubPanel(STAFF_PANELS, "payments")).toBeNull();
    expect(resolveHubPanel(STAFF_PANELS, "profile")).toBe("profile");
  });

  it("gives every panel a picture from the shared library", () => {
    for (const panel of OWNER_PANELS) expect(panel.photo).toMatch(/^\/images\/(home|products)\/[a-z-]+\.webp$/);
  });
});

// ---------------------------------------------------------------------------
// Dates on the shop's clock, whatever zone the server runs in
// ---------------------------------------------------------------------------

describe("shop-time: dates and times on the shop's own clock", () => {
  // 2026-10-04 03:30 UTC is still Saturday 3 October, 9:30 PM in Edmonton (UTC-6).
  const lateSaturday = "2026-10-04T03:30:00.000Z";

  it("formats in the shop's zone, not the server's", () => {
    expect(shopDateTime(lateSaturday, EDMONTON)).toBe("Oct 3, 2026, 9:30 PM");
    expect(shopDateTime(lateSaturday, "UTC")).toBe("Oct 4, 2026, 3:30 AM");
    expect(shopDate(lateSaturday, EDMONTON)).toBe("Oct 3, 2026");
    expect(shopTime(lateSaturday, EDMONTON)).toBe("9:30 PM");
  });

  it("falls back safely on a missing date or a bad zone", () => {
    expect(shopDateTime(null, EDMONTON)).toBe("—");
    expect(shopDate("not a date", EDMONTON)).toBe("—");
    expect(shopTime(lateSaturday, "Not/AZone")).toBe("3:30 AM");
  });

  it("says Today and Yesterday by the shop's calendar", () => {
    const now = Date.parse("2026-10-04T16:00:00.000Z"); // Sunday 10:00 AM in Edmonton
    expect(dayHeading("2026-10-04T15:00:00.000Z", now, EDMONTON)).toBe("Today");
    // 03:30 UTC on the 4th is the 3rd in Edmonton: yesterday there, today in UTC.
    expect(dayHeading(lateSaturday, now, EDMONTON)).toBe("Yesterday");
    expect(dayHeading(lateSaturday, now, "UTC")).toBe("Today");
    expect(dayHeading("2026-10-01T18:00:00.000Z", now, EDMONTON)).toBe("Thursday, October 1");
    expect(dayHeading("2025-10-01T18:00:00.000Z", now, EDMONTON)).toBe("Wednesday, October 1, 2025");
  });

  it("steps back a calendar day, across a month and a year", () => {
    expect(previousDayKey("2026-10-01")).toBe("2026-09-30");
    expect(previousDayKey("2026-01-01")).toBe("2025-12-31");
    expect(previousDayKey("2024-03-01")).toBe("2024-02-29");
  });

  it("groups a newest-first list by the shop's day, keeping the order", () => {
    const now = Date.parse("2026-10-04T16:00:00.000Z");
    const rows = [
      { id: "a", createdAt: "2026-10-04T15:00:00.000Z" },
      { id: "b", createdAt: "2026-10-04T07:00:00.000Z" },
      { id: "c", createdAt: lateSaturday },
      { id: "d", createdAt: "2026-10-02T12:00:00.000Z" },
    ];
    const groups = groupByShopDay(rows, now, EDMONTON);
    expect(groups.map((group) => [group.heading, group.rows.map((row) => row.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Friday, October 2", ["d"]],
    ]);
  });

  it("starts 'this month' at midnight on the 1st where the shop is", () => {
    // 1 Oct 2026, 02:00 UTC is still 30 September in Edmonton.
    const now = Date.parse("2026-10-01T02:00:00.000Z");
    expect(startOfShopMonth(now, EDMONTON).toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(startOfShopMonth(now, "UTC").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(startOfShopMonth(Date.parse("2026-10-15T12:00:00.000Z"), EDMONTON).toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });

  it("says how long ago in plain words", () => {
    const now = Date.parse("2026-10-04T16:00:00.000Z");
    expect(agoWords("2026-10-04T15:59:30.000Z", now)).toBe("just now");
    expect(agoWords("2026-10-04T15:49:00.000Z", now)).toBe("11 minutes ago");
    expect(agoWords("2026-10-04T13:00:00.000Z", now)).toBe("3 hours ago");
    expect(agoWords("2026-10-03T12:00:00.000Z", now)).toBe("yesterday");
    expect(agoWords(null, now)).toBe("never");
  });

  it("offers plain-named zones, keeping a shop's own zone when it is not on the list", () => {
    const common = timeZoneChoices(EDMONTON);
    expect(common.find((choice) => choice.zone === EDMONTON)?.label).toBe("Mountain (Edmonton, Calgary)");
    const odd = timeZoneChoices("Asia/Tokyo");
    expect(odd[0]).toEqual({ zone: "Asia/Tokyo", label: "Asia/Tokyo" });
    expect(odd).toHaveLength(common.length + 1);
  });
});

// ---------------------------------------------------------------------------
// Printed sign
// ---------------------------------------------------------------------------

describe("the printed sign", () => {
  it("escapes what it prints", () => {
    expect(escapeHtml(`<b>"Tom's" & co</b>`)).toBe("&lt;b&gt;&quot;Tom&#39;s&quot; &amp; co&lt;/b&gt;");
  });

  it("is the title, the line, the QR picture and the link, and nothing a page could run", () => {
    const html = signHtml({ title: "Check in <here>", line: "Scan me", qrDataUrl: "data:image/png;base64,AAAA", url: "http://x.test/s/demo" });
    expect(html).toContain("<h1>Check in &lt;here&gt;</h1>");
    expect(html).toContain('<img alt="" src="data:image/png;base64,AAAA">');
    expect(html).toContain("http://x.test/s/demo");
    expect(html).not.toContain("<script");
    // Only a picture data URL is ever drawn.
    expect(signHtml({ title: "t", line: "l", qrDataUrl: "javascript:alert(1)", url: "u" })).not.toContain("<img");
  });
});

// ---------------------------------------------------------------------------
// One save model
// ---------------------------------------------------------------------------

describe("the pinned Save bar says where things stand in words", () => {
  it("has one sentence per state", () => {
    expect(saveBarMessage("clean")).toBe("No changes yet.");
    expect(saveBarMessage("dirty")).toBe("You have changes that are not saved yet.");
    expect(saveBarMessage("saving")).toBe("Saving…");
    expect(saveBarMessage("saved")).toBe("Saved.");
    expect(saveBarMessage("invalid")).toContain("Fix");
    expect(saveBarMessage("dirty", "Enter a tax rate between 0 and 100%.")).toBe("Enter a tax rate between 0 and 100%.");
  });

  it("only lets whole hours in range through for the repair times", () => {
    const sla = { LOW: 168, NORMAL: 48, HIGH: 24, URGENT: 4 };
    const draft = slaDraft(sla);
    expect(slaFromDraft(draft)).toEqual(sla);
    expect(slaFromDraft({ ...draft, HIGH: "" })).toBeNull();
    expect(slaFromDraft({ ...draft, HIGH: "0" })).toBeNull();
    expect(slaFromDraft({ ...draft, HIGH: "999999" })).toBeNull();
  });

  it("names the review wait in words", () => {
    expect(waitLabel(24)).toBe("Next day");
    expect(waitLabel(168)).toBe("1 week");
    expect(waitLabel(0)).toBe("Straight away");
    expect(waitLabel(72)).toBe("3 days");
    expect(waitLabel(5)).toBe("5 hours");
  });
});

// ---------------------------------------------------------------------------
// First-run setup
// ---------------------------------------------------------------------------

describe("setup steps in words", () => {
  it("says the step and its name", () => {
    expect(stepWords("shop")).toBe("Step 1 of 5: Your shop");
    expect(stepWords("team")).toBe("Step 2 of 5: Your team");
    expect(stepWords("ready")).toBe("Step 5 of 5: Ready");
  });

  it("fills the bar by where you are and what is behind you", () => {
    expect(stepProgress("shop", new Set())).toBe(20);
    expect(stepProgress("team", new Set(["shop"]))).toBe(40);
    // Jumping back to step 1 after doing three keeps the bar where the work is.
    expect(stepProgress("shop", new Set(["shop", "team", "payments"]))).toBe(60);
    expect(stepProgress("ready", new Set(["shop", "team", "payments", "items"]))).toBe(100);
  });

  it("gives each step one word", () => {
    const done = new Set(["shop"] as const);
    const later = new Set(["team"] as const);
    expect(stepState("payments", "payments", done, later)).toBe("Now");
    expect(stepState("shop", "payments", done, later)).toBe("Done");
    expect(stepState("team", "payments", done, later)).toBe("Later");
    expect(stepState("items", "payments", done, later)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// New repair: Other on the first screen
// ---------------------------------------------------------------------------

const ids = (kinds: readonly DeviceKind[]) => kinds.map((kind) => kind.id);

describe("firstScreenKinds: Other is always on the first screen", () => {
  it("folds the 13 standard kinds into six, Other and More devices", () => {
    const first = firstScreenKinds(visibleDeviceKinds(DEFAULT_DEVICE_KINDS));
    expect(first.tiles).toHaveLength(FIRST_SCREEN_KINDS + 1);
    expect(first.tiles.at(-1)?.id).toBe("other");
    expect(ids(first.tiles).slice(0, FIRST_SCREEN_KINDS)).toEqual(ids(DEFAULT_DEVICE_KINDS).slice(0, FIRST_SCREEN_KINDS));
    expect(first.folded).toBe(DEFAULT_DEVICE_KINDS.length - FIRST_SCREEN_KINDS - 1);
    // Six kinds, Other and the More box: eight boxes, two rows at 1024x768.
    expect(first.tiles.length + 1).toBe(FIRST_SCREEN_BOXES);
  });

  it("shows everything when eight or fewer fit", () => {
    const eight = [...DEFAULT_DEVICE_KINDS.slice(0, 7), DEFAULT_DEVICE_KINDS.at(-1)!];
    expect(firstScreenKinds(eight)).toEqual({ tiles: eight, folded: 0 });
  });

  it("keeps Other first-screen even when the owner moved many kinds ahead of it", () => {
    const many = Array.from({ length: 20 }, (_, n) => ({ id: `k${n}`, label: `Kind ${n}`, type: `Kind ${n}`, image: "" }));
    const first = firstScreenKinds([...many, DEFAULT_DEVICE_KINDS.at(-1)!]);
    expect(ids(first.tiles)).toEqual(["k0", "k1", "k2", "k3", "k4", "k5", "other"]);
    expect(first.folded).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Devices and problems editor: undo puts it back where it was
// ---------------------------------------------------------------------------

describe("restoreDeviceKind / restoreProblem (the Undo toast)", () => {
  const custom: DeviceKind = { id: "scooter", label: "Scooter", type: "Scooter", image: "" };
  const withScooter = [...DEFAULT_DEVICE_KINDS.slice(0, 3), custom, ...DEFAULT_DEVICE_KINDS.slice(3)];

  it("puts a removed box back at its old place, Other still last", () => {
    const removed = removeDeviceKind(withScooter, "scooter");
    expect(ids(restoreDeviceKind(removed, custom, 3))).toEqual(ids(withScooter));
  });

  it("keeps moves made after the removal (it does not roll the whole list back)", () => {
    const removed = removeDeviceKind(withScooter, "scooter");
    const moved = moveDeviceKind(removed, "tablet", -1);
    const back = restoreDeviceKind(moved, custom, 3);
    expect(ids(back).slice(0, 2)).toEqual(["tablet", "phone"]);
    expect(ids(back)[3]).toBe("scooter");
    expect(back.at(-1)?.id).toBe("other");
  });

  it("does nothing when the box is already there, and clamps an index past the end", () => {
    expect(restoreDeviceKind(withScooter, custom, 0)).toEqual(withScooter);
    const removed = removeDeviceKind(withScooter, "scooter");
    const back = restoreDeviceKind(removed, custom, 99);
    expect(back.at(-2)?.id).toBe("scooter");
    expect(back.at(-1)?.id).toBe("other");
  });

  it("puts a problem back with its picture, keeping the current order", () => {
    const now = { problems: ["Battery", "Screen"], pictures: { Battery: "phone-battery" } };
    expect(restoreProblem(now, "Water damage", "phone", 1)).toEqual({
      problems: ["Battery", "Water damage", "Screen"],
      pictures: { Battery: "phone-battery", "Water damage": "phone" },
    });
    expect(restoreProblem(now, "screen", undefined, 0)).toEqual(now);
  });
});

// ---------------------------------------------------------------------------
// One activity entry per burst of rearranging
// ---------------------------------------------------------------------------

describe("describeArrangement: is this save only a rearrangement?", () => {
  const before = { kinds: [...DEFAULT_DEVICE_KINDS], problems: ["Screen", "Battery"], pictures: { Screen: "phone" } };

  it("says how, for a move or a hide", () => {
    expect(describeArrangement(before, { ...before, kinds: moveDeviceKind(before.kinds, "tablet", -1) })).toBe("Device order changed");
    expect(describeArrangement(before, { ...before, kinds: setDeviceHidden(before.kinds, "tablet", true) })).toBe("Tablet hidden");
    const hidden = { ...before, kinds: setDeviceHidden(before.kinds, "tablet", true) };
    expect(describeArrangement(hidden, before)).toBe("Tablet shown again");
    expect(describeArrangement(before, { ...before, problems: ["Battery", "Screen"] })).toBe("Problem order changed");
  });

  it("is null for anything that changes what is in the lists", () => {
    const renamed = before.kinds.map((kind) => (kind.id === "tablet" ? { ...kind, label: "iPad" } : kind));
    expect(describeArrangement(before, { ...before, kinds: renamed })).toBeNull();
    const repictured = before.kinds.map((kind) => (kind.id === "tablet" ? { ...kind, image: "drone" } : kind));
    expect(describeArrangement(before, { ...before, kinds: repictured })).toBeNull();
    expect(describeArrangement(before, { ...before, kinds: before.kinds.slice(1) })).toBeNull();
    expect(describeArrangement(before, { ...before, problems: ["Screen", "Battery", "Water"] })).toBeNull();
    expect(describeArrangement(before, { ...before, pictures: {} })).toBeNull();
  });
});

describe("joinsArrangeBurst", () => {
  const now = Date.parse("2026-10-04T16:00:00.000Z");
  const arrange = { section: "devices-and-problems", kind: "arrange" };

  it("joins the same person's rearranging entry from the last few minutes", () => {
    expect(joinsArrangeBurst({ createdAt: new Date(now - 60_000), meta: arrange }, now)).toBe(true);
    expect(joinsArrangeBurst({ createdAt: new Date(now - (AUDIT_BURST_MINUTES * 60_000 - 1)).toISOString(), meta: arrange }, now)).toBe(true);
  });

  it("starts a new entry when the last one is old, not a rearrangement, or missing", () => {
    expect(joinsArrangeBurst({ createdAt: new Date(now - AUDIT_BURST_MINUTES * 60_000), meta: arrange }, now)).toBe(false);
    expect(joinsArrangeBurst({ createdAt: new Date(now - 60_000), meta: { section: "devices-and-problems", kind: "change" } }, now)).toBe(false);
    expect(joinsArrangeBurst({ createdAt: new Date(now - 60_000), meta: { section: "workflow" } }, now)).toBe(false);
    expect(joinsArrangeBurst({ createdAt: new Date(now - 60_000), meta: null }, now)).toBe(false);
    expect(joinsArrangeBurst(null, now)).toBe(false);
    expect(joinsArrangeBurst({ createdAt: "garbage", meta: arrange }, now)).toBe(false);
  });
});
