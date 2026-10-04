import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, dataOf, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient, prisma: fakeClient, default: fakeClient };
});

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const session = vi.hoisted(() => ({ shopId: "shop_1", userId: "user_1", role: "OWNER", name: "Dana" }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => session),
  requireRole: vi.fn(async () => session),
  hashPassword: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/audit", () => ({ audit }));

const { saveIntakeOptionsAction, updateWorkflowAction } = await import("@/app/(app)/settings/actions");
const { DEFAULT_DEVICE_KINDS } = await import("@/lib/intake-options");

type Json = Record<string, unknown>;

/** What the action wrote to Shop.settings. */
const saved = () => dataOf("shop.update").settings as Json;
const savedKinds = () => (saved().deviceKinds as { id: string; label: string; type: string; image: string; hidden?: boolean }[]) ?? [];

function shopHas(settings: Json | null) {
  handlers["shop.findUnique"] = () => ({ settings });
  handlers["shop.update"] = () => ({});
}

beforeEach(() => {
  resetDb();
  session.role = "OWNER";
  revalidatePath.mockClear();
  audit.mockClear();
  shopHas({ ticketStatuses: ["New", "Resolved"], problemTypes: ["Screen Repair", "Battery Replacement", "Other"], automation: { lastRun: "yesterday" } });
});

describe("saveIntakeOptionsAction: who may use it", () => {
  it("lets the owner save, and says what was saved", async () => {
    const result = await saveIntakeOptionsAction({ deviceKinds: DEFAULT_DEVICE_KINDS.map((kind) => ({ ...kind })) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deviceKinds).toHaveLength(DEFAULT_DEVICE_KINDS.length);
      expect(result.problemTypes).toEqual(["Screen Repair", "Battery Replacement", "Other"]);
    }
    expect(callsTo("shop.update")).toHaveLength(1);
  });

  it("refuses everyone who is not an owner, before touching the database", async () => {
    for (const role of ["FRONT_DESK", "TECH", "SOMEONE_ELSE"]) {
      resetDb();
      shopHas({});
      session.role = role;
      const result = await saveIntakeOptionsAction({ deviceKinds: [] });
      expect(result).toEqual({ ok: false, error: "Only an owner can change this." });
      expect(callsTo("shop.findUnique")).toHaveLength(0);
      expect(callsTo("shop.update")).toHaveLength(0);
    }
    expect(audit).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("only ever reads and writes the signed-in owner's own shop, whatever the request says", async () => {
    await saveIntakeOptionsAction({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }], shopId: "shop_2" } as never);
    expect(whereOf("shop.findUnique")).toEqual({ id: "shop_1" });
    expect(whereOf("shop.update")).toEqual({ id: "shop_1" });
    expect(JSON.stringify(saved())).not.toContain("shop_2");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop_1", userId: "user_1" }));
  });

  it("says so when the shop is gone", async () => {
    handlers["shop.findUnique"] = () => null;
    expect(await saveIntakeOptionsAction({ deviceKinds: [] })).toEqual({ ok: false, error: "Shop not found." });
    expect(callsTo("shop.update")).toHaveLength(0);
  });
});

describe("saveIntakeOptionsAction: devices", () => {
  it("saves the list cleaned: Other last, built-in types kept, unknown pictures dropped", async () => {
    const result = await saveIntakeOptionsAction({
      deviceKinds: [
        { id: "other", label: "Other", image: "repair-tools", hidden: true },
        { id: "watch", label: "  Wrist   watch ", type: "Hacked", image: "smartwatch" },
        { id: "scooter", label: "Scooter", image: "not-a-picture" },
        { id: "phone", label: "phone", image: "phone" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(savedKinds().map((kind) => kind.label)).toEqual(["Wrist watch", "Scooter", "phone", "Other"]);
    expect(savedKinds()[0]).toMatchObject({ id: "watch", type: "Smartwatch" });
    expect(savedKinds()[1]).toMatchObject({ id: "scooter", type: "Scooter", image: "" });
    expect(savedKinds()[3]).toMatchObject({ id: "other", type: "Other" });
    expect(savedKinds()[3].hidden).toBeUndefined();
  });

  it("keeps every other key of the settings, and leaves the problem list alone", async () => {
    await saveIntakeOptionsAction({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }] });
    expect(saved()).toMatchObject({
      ticketStatuses: ["New", "Resolved"],
      problemTypes: ["Screen Repair", "Battery Replacement", "Other"],
      automation: { lastRun: "yesterday" },
    });
    expect(saved().problemPictures).toBeUndefined();
  });

  it("adds one device before Other with the best picture for its name (the check-in's quick add)", async () => {
    const result = await saveIntakeOptionsAction({ addDevice: { label: "  Label   printer " } });
    expect(result.ok).toBe(true);
    const kinds = savedKinds();
    expect(kinds[kinds.length - 1].id).toBe("other");
    const added = kinds[kinds.length - 2];
    expect(added).toMatchObject({ label: "Label printer", type: "Label printer" });
    expect(added.image).not.toBe("");
    // the standard list was written out whole, so the new box has its neighbours
    expect(kinds).toHaveLength(DEFAULT_DEVICE_KINDS.length + 1);
    expect(result.ok && result.deviceKinds.map((kind) => kind.label)).toContain("Label printer");
  });

  it("adds a device the library has no picture for with the neutral icon, and honours a picture it is given", async () => {
    await saveIntakeOptionsAction({ addDevice: { label: "Hoverboard" } });
    expect(savedKinds().find((kind) => kind.label === "Hoverboard")?.image).toBe("");

    resetDb();
    shopHas({});
    await saveIntakeOptionsAction({ addDevice: { label: "Hoverboard", image: "drone" } });
    expect(savedKinds().find((kind) => kind.label === "Hoverboard")?.image).toBe("drone");
  });

  it("refuses to add a device the shop already has, in words", async () => {
    const result = await saveIntakeOptionsAction({ addDevice: { label: "printer" } });
    expect(result).toEqual({ ok: false, error: "You already have a box called “Printer”." });
    expect(callsTo("shop.update")).toHaveLength(0);
  });

  it("adds to the shop's own list when it has one", async () => {
    shopHas({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }, { id: "other", label: "Other", image: "repair-tools" }] });
    await saveIntakeOptionsAction({ addDevice: { label: "Scooter" } });
    expect(savedKinds().map((kind) => kind.label)).toEqual(["Phone", "Scooter", "Other"]);
  });
});

describe("saveIntakeOptionsAction: problems", () => {
  it("saves the problem list and the pictures chosen for it", async () => {
    const result = await saveIntakeOptionsAction({
      problemTypes: ["  Charging   port ", "Screen Repair", "charging PORT"],
      problemPictures: { "Charging port": "charging-port", "Screen Repair": "no-such-picture", Gone: "drone" },
    });
    expect(result).toEqual({
      ok: true,
      deviceKinds: expect.any(Array),
      problemTypes: ["Charging port", "Screen Repair"],
      problemPictures: { "Charging port": "charging-port" },
    });
    expect(saved().problemTypes).toEqual(["Charging port", "Screen Repair"]);
    expect(saved().problemPictures).toEqual({ "Charging port": "charging-port" });
    // devices were not asked about, so they were not written
    expect(saved().deviceKinds).toBeUndefined();
  });

  it("drops the picture of a problem that was removed, even when only the list was sent", async () => {
    shopHas({ problemTypes: ["A", "B"], problemPictures: { A: "drone", B: "camera" } });
    await saveIntakeOptionsAction({ problemTypes: ["B"] });
    expect(saved().problemTypes).toEqual(["B"]);
    expect(saved().problemPictures).toEqual({ B: "camera" });

    resetDb();
    shopHas({ problemTypes: ["A", "B"], problemPictures: { A: "drone" } });
    await saveIntakeOptionsAction({ problemTypes: ["B"] });
    expect(saved().problemPictures).toBeUndefined();
  });

  it("keeps the stored pictures when only the devices change", async () => {
    shopHas({ problemTypes: ["A"], problemPictures: { A: "drone" } });
    await saveIntakeOptionsAction({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }] });
    expect(saved().problemPictures).toEqual({ A: "drone" });
  });
});

describe("saveIntakeOptionsAction: a renamed problem takes its checklists with it", () => {
  // A checklist finds its repairs by the problem's exact name (ChecklistTemplate.problemType, matched when a
  // repair is created). Renaming a problem without moving its checklists would quietly stop them attaching.
  const stored = { problemTypes: ["Screen Repair", "Diagnostic", "Other"], problemPictures: { Diagnostic: "multimeter" } };
  const checklistMoves = () => callsTo("checklistTemplate.updateMany");

  beforeEach(() => {
    shopHas(stored);
    handlers["checklistTemplate.updateMany"] = () => ({ count: 2 });
  });

  it("moves every checklist of the old name to the new one, for this shop only", async () => {
    const result = await saveIntakeOptionsAction({
      problemTypes: ["Screen Repair", "Diagnostics", "Other"],
      problemPictures: { Diagnostics: "multimeter" },
      renamed: [{ from: "Diagnostic", to: "Diagnostics" }],
    });
    expect(result).toMatchObject({ ok: true, problemTypes: ["Screen Repair", "Diagnostics", "Other"], checklistsMoved: 2 });
    expect(checklistMoves()).toHaveLength(1);
    expect(checklistMoves()[0].args).toEqual({ where: { shopId: "shop_1", problemType: "Diagnostic" }, data: { problemType: "Diagnostics" } });
    expect(saved().problemTypes).toEqual(["Screen Repair", "Diagnostics", "Other"]);
  });

  it("writes the list and moves the checklists in ONE transaction, so one never happens without the other", async () => {
    await saveIntakeOptionsAction({ problemTypes: ["Screen Repair", "Diagnostics", "Other"], renamed: [{ from: "Diagnostic", to: "Diagnostics" }] });
    expect(callsTo("$transaction")).toHaveLength(1);
    expect(callsTo("shop.update")).toHaveLength(1);
  });

  it("does not take the shop from the request, whatever it says", async () => {
    await saveIntakeOptionsAction({
      problemTypes: ["Screen Repair", "Diagnostics", "Other"],
      renamed: [{ from: "Diagnostic", to: "Diagnostics", shopId: "shop_2" }],
      shopId: "shop_2",
    } as never);
    expect(whereOf("checklistTemplate.updateMany")).toEqual({ shopId: "shop_1", problemType: "Diagnostic" });
  });

  it("moves each of several renames, and counts them all", async () => {
    shopHas({ problemTypes: ["A", "B", "Other"] });
    await saveIntakeOptionsAction({
      problemTypes: ["A2", "B2", "Other"],
      renamed: [
        { from: "A", to: "A2" },
        { from: "B", to: "B2" },
      ],
    });
    expect(checklistMoves().map((call) => call.args.where)).toEqual([
      { shopId: "shop_1", problemType: "A" },
      { shopId: "shop_1", problemType: "B" },
    ]);
    const result = await saveIntakeOptionsAction({ problemTypes: ["A2", "B2", "Other"], renamed: [{ from: "A", to: "A2" }, { from: "B", to: "B2" }] });
    expect(result.ok && result.checklistsMoved).toBe(4);
  });

  it("follows a change of capital letters too, because the match is exact", async () => {
    shopHas({ problemTypes: ["water damage", "Other"] });
    await saveIntakeOptionsAction({ problemTypes: ["Water damage", "Other"], renamed: [{ from: "water damage", to: "Water damage" }] });
    expect(checklistMoves()[0].args).toEqual({ where: { shopId: "shop_1", problemType: "water damage" }, data: { problemType: "Water damage" } });
  });

  it("says nothing about checklists when nothing was renamed or nothing was linked", async () => {
    const plain = await saveIntakeOptionsAction({ problemTypes: ["Screen Repair", "Other"] });
    expect(plain.ok && "checklistsMoved" in plain).toBe(false);
    expect(checklistMoves()).toHaveLength(0);
    expect(callsTo("$transaction")).toHaveLength(0);

    resetDb();
    shopHas(stored);
    handlers["checklistTemplate.updateMany"] = () => ({ count: 0 });
    const none = await saveIntakeOptionsAction({ problemTypes: ["Screen Repair", "Diagnostics", "Other"], renamed: [{ from: "Diagnostic", to: "Diagnostics" }] });
    expect(none.ok && "checklistsMoved" in none).toBe(false);
  });

  it("ignores a rename that does not match the list it came with, so a checklist never moves off a problem that still exists", async () => {
    const list = ["Screen Repair", "Diagnostics", "Other"];
    const ignored: unknown[] = [
      { from: "Screen Repair", to: "Diagnostics" }, // the old name is still on the list
      { from: "Diagnostic", to: "Not on the list" }, // the new name is not on the list
      { from: "Diagnostic", to: "Diagnostic" }, // not a rename
      { from: "", to: "Diagnostics" },
      { from: "Diagnostic", to: "" },
      { from: 7, to: "Diagnostics" },
      { to: "Diagnostics" },
      null,
      "Diagnostic",
    ];
    for (const rename of ignored) {
      checklistMoves().length = 0;
      const result = await saveIntakeOptionsAction({ problemTypes: list, renamed: [rename] } as never);
      expect(result.ok, JSON.stringify(rename)).toBe(true);
      expect(checklistMoves(), JSON.stringify(rename)).toHaveLength(0);
    }
  });

  it("can never chain or swap: an old name that is still on the list is never moved", async () => {
    shopHas({ problemTypes: ["A", "B"] });
    await saveIntakeOptionsAction({ problemTypes: ["A", "B"], renamed: [{ from: "A", to: "B" }, { from: "B", to: "A" }] });
    expect(checklistMoves()).toHaveLength(0);
  });

  it("moves a name only once even if it is listed twice", async () => {
    await saveIntakeOptionsAction({
      problemTypes: ["Screen Repair", "Diagnostics", "Other"],
      renamed: [{ from: "Diagnostic", to: "Diagnostics" }, { from: "Diagnostic", to: "Diagnostics" }],
    });
    expect(checklistMoves()).toHaveLength(1);
  });

  it("moves nothing when the save itself is refused", async () => {
    const result = await saveIntakeOptionsAction({ problemTypes: ["", "  "], renamed: [{ from: "Diagnostic", to: "Diagnostics" }] });
    expect(result).toEqual({ ok: false, error: "Keep at least one problem." });
    expect(checklistMoves()).toHaveLength(0);
    expect(callsTo("shop.update")).toHaveLength(0);
  });

  it("refuses a malformed rename list in words, and writes nothing", async () => {
    const result = await saveIntakeOptionsAction({ problemTypes: ["A"], renamed: "Diagnostic" as never });
    expect(result).toEqual({ ok: false, error: "Those changes could not be read. Reload the page and try again." });
    expect(callsTo("shop.update")).toHaveLength(0);
    expect(checklistMoves()).toHaveLength(0);
  });

  it("leaves the checklists alone when a problem is only removed (Undo puts the list back, so they link again)", async () => {
    await saveIntakeOptionsAction({ problemTypes: ["Screen Repair", "Other"] });
    expect(checklistMoves()).toHaveLength(0);
  });

  it("writes how many were renamed and moved into the audit entry, and nothing about names", async () => {
    await saveIntakeOptionsAction({ problemTypes: ["Screen Repair", "Diagnostics", "Other"], renamed: [{ from: "Diagnostic", to: "Diagnostics" }] });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "Devices and problems saved",
        meta: { section: "devices-and-problems", devices: DEFAULT_DEVICE_KINDS.length, hiddenDevices: 0, problems: 3, renamedProblems: 1, checklistsMoved: 2 },
      }),
    );
  });
});

describe("saveIntakeOptionsAction: reset", () => {
  it("puts the devices back to the standard list by forgetting the saved one, touching nothing else", async () => {
    shopHas({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }], problemTypes: ["A"], problemPictures: { A: "drone" }, ticketStatuses: ["New"] });
    const result = await saveIntakeOptionsAction({ reset: ["devices"] });
    expect(saved().deviceKinds).toBeUndefined();
    expect(saved()).toMatchObject({ problemTypes: ["A"], problemPictures: { A: "drone" }, ticketStatuses: ["New"] });
    expect(result.ok && result.deviceKinds).toEqual(DEFAULT_DEVICE_KINDS);
  });

  it("puts the problems back to the standard list and forgets their pictures", async () => {
    shopHas({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }], problemTypes: ["A"], problemPictures: { A: "drone" } });
    const result = await saveIntakeOptionsAction({ reset: ["problems"] });
    expect(saved().problemTypes).toBeUndefined();
    expect(saved().problemPictures).toBeUndefined();
    expect(saved().deviceKinds).toBeDefined();
    expect(result.ok && result.problemTypes).toEqual(["Hardware", "Software", "Virus", "Screen", "Battery", "Water Damage", "Other"]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ summary: "Devices and problems put back to the standard list" }));
  });
});

describe("saveIntakeOptionsAction: refuses bad input in words and writes nothing", () => {
  const refused = async (input: Parameters<typeof saveIntakeOptionsAction>[0], message: RegExp) => {
    const result = await saveIntakeOptionsAction(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
    expect(callsTo("shop.update")).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  };

  it("a request with nothing in it", async () => refused({}, /nothing to save/i));
  it("a list that is not a list", async () => refused({ deviceKinds: "phone" as never }, /could not be read/));
  it("a reset of something that does not exist", async () => refused({ reset: ["everything"] as never }, /could not be read/));
  it("a device name longer than 30 letters", async () => refused({ deviceKinds: [{ id: "x", label: "w".repeat(31), image: "" }] }, /too long.*30 letters/));
  it("more than 24 devices", async () => refused({ deviceKinds: Array.from({ length: 25 }, (_, index) => ({ id: `d${index}`, label: `D${index}`, image: "" })) }, /up to 24/));
  it("an empty problem list", async () => refused({ problemTypes: ["", "   "] }, /Keep at least one problem/));
  it("a problem name longer than 60 letters", async () => refused({ problemTypes: ["Fine", "p".repeat(61)] }, /too long.*60 letters/));
  it("more than 40 problems", async () => refused({ problemTypes: Array.from({ length: 41 }, (_, index) => `P${index}`) }, /up to 40/));
  it("a device name that is only spaces, when adding one", async () => refused({ addDevice: { label: "   " } }, /Type a name first/));
});

describe("saveIntakeOptionsAction: the audit trail and the pages that show the boxes", () => {
  it("writes one audit entry for the shop's settings, with counts and no pictures or names", async () => {
    await saveIntakeOptionsAction({
      deviceKinds: [{ id: "phone", label: "Phone", image: "phone", hidden: true }, { id: "tablet", label: "Tablet", image: "tablet" }],
      problemTypes: ["A", "B", "C"],
    });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith({
      shopId: "shop_1",
      userId: "user_1",
      action: "settings.updated",
      entity: "settings",
      entityId: "shop_1",
      summary: "Devices and problems saved",
      meta: { section: "devices-and-problems", devices: 3, hiddenDevices: 1, problems: 3 },
    });
  });

  it("says which device a quick add put on the list", async () => {
    await saveIntakeOptionsAction({ addDevice: { label: "Hoverboard" } });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ summary: "Device “Hoverboard” added to the check-in" }));
  });

  it("refreshes the Settings page and the New repair page", async () => {
    await saveIntakeOptionsAction({ problemTypes: ["A"] });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/tickets/new");
  });
});

describe("updateWorkflowAction: its contract is unchanged", () => {
  it("still refuses everyone but the owner", async () => {
    session.role = "FRONT_DESK";
    expect(await updateWorkflowAction({ problemTypes: ["A"], ticketStatuses: ["New"] })).toEqual({ ok: false, error: "Only an owner can change this." });
    expect(callsTo("shop.update")).toHaveLength(0);
  });

  it("still needs at least one problem type and one ticket status", async () => {
    expect(await updateWorkflowAction({ problemTypes: [" ", ""], ticketStatuses: ["New"] })).toEqual({ ok: false, error: "Keep at least one problem type." });
    expect(await updateWorkflowAction({ problemTypes: ["A"], ticketStatuses: [] })).toEqual({ ok: false, error: "Keep at least one ticket status." });
    expect(callsTo("shop.update")).toHaveLength(0);
  });

  it("still cleans both lists, keeps Resolved, and merges into the settings", async () => {
    const result = await updateWorkflowAction({ problemTypes: ["  Screen ", "screen", "Battery"], ticketStatuses: ["New", "In Progress"] });
    expect(result).toEqual({ ok: true });
    expect(saved()).toMatchObject({
      problemTypes: ["Screen", "Battery"],
      ticketStatuses: ["New", "In Progress", "Resolved"],
      automation: { lastRun: "yesterday" },
    });
    expect(whereOf("shop.update")).toEqual({ id: "shop_1" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ summary: "Problem types and ticket statuses saved" }));
  });

  it("leaves a shop that never chose pictures without a pictures key", async () => {
    await updateWorkflowAction({ problemTypes: ["A"], ticketStatuses: ["New"] });
    expect("problemPictures" in saved()).toBe(false);
  });

  it("takes the picture of a problem with it when the problem leaves the list", async () => {
    shopHas({ problemTypes: ["A", "B"], problemPictures: { A: "drone", B: "camera" } });
    await updateWorkflowAction({ problemTypes: ["B"], ticketStatuses: ["New"] });
    expect(saved().problemPictures).toEqual({ B: "camera" });
  });
});
