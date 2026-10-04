import { describe, expect, it } from "vitest";

import { catalogEntryByKey } from "@/lib/catalog/match";
import { INTAKE_DEVICE_KINDS, easyIntakeProfile, easyModelOptions } from "@/lib/device-intake";
import {
  DEFAULT_DEVICE_KINDS,
  MAX_DEVICE_KINDS,
  MAX_KIND_LABEL,
  MAX_PROBLEMS,
  MAX_PROBLEM_LENGTH,
  addDeviceKind,
  addProblem,
  canMoveDevice,
  canMoveProblem,
  checkDeviceKinds,
  checkProblemTypes,
  checklistsOn,
  checklistsWithoutProblem,
  cleanDeviceKinds,
  cleanProblemPictures,
  cleanProblemRenames,
  cleanProblemTypes,
  defaultPictureKey,
  deviceKindsFor,
  deviceNameIssue,
  isBuiltInKind,
  kindPicture,
  moveDeviceKind,
  moveProblem,
  problemNameIssue,
  problemPicturesFor,
  removeChecklistNote,
  removeDeviceKind,
  removeProblem,
  renameChecklistNote,
  renamesBetween,
  resetChecklistNote,
  setDeviceHidden,
  suggestPictures,
  tidy,
  updateDeviceKind,
  updateProblem,
  visibleDeviceKinds,
  type DeviceKind,
} from "@/lib/intake-options";
import { chosenProblemPicture, problemVisual, problemVisualFor } from "@/components/tickets/intake/flow";

const kind = (label: string, extra: Partial<DeviceKind> = {}): DeviceKind => ({ id: label.toLowerCase().replace(/\W+/g, "-"), label, type: label, image: "", ...extra });
const labels = (kinds: readonly DeviceKind[]) => kinds.map((item) => item.label);

describe("the standard device list", () => {
  it("is the original eight plus the ones a repair shop meets daily, with Other last", () => {
    expect(labels(DEFAULT_DEVICE_KINDS)).toEqual([
      "Phone", "Tablet", "Laptop", "Computer", "Game console", "TV", "Watch",
      "Handheld console", "Headphones", "Camera", "Drone", "Printer", "Other",
    ]);
    expect(DEFAULT_DEVICE_KINDS[DEFAULT_DEVICE_KINDS.length - 1].id).toBe("other");
  });

  it("keeps the saved type of each original box, so existing repairs and Full mode stay consistent", () => {
    const byLabel = Object.fromEntries(DEFAULT_DEVICE_KINDS.map((item) => [item.label, item.type]));
    expect(byLabel).toMatchObject({
      Phone: "Phone", Tablet: "Tablet", Laptop: "Laptop", Computer: "Desktop", "Game console": "Game console",
      TV: "Television", Watch: "Smartwatch", Other: "Other",
    });
    // and it still matches the constant the eight boxes came from
    for (const original of INTAKE_DEVICE_KINDS) {
      const match = DEFAULT_DEVICE_KINDS.find((item) => item.type === original.type);
      expect(match?.label).toBe(original.label);
      expect(match?.image).toBe(original.photo);
    }
  });

  it("only points at pictures that exist in the library, and ids and names are unique", () => {
    for (const item of DEFAULT_DEVICE_KINDS) {
      expect(catalogEntryByKey(item.image), item.label).not.toBeNull();
      expect(item.label.length).toBeLessThanOrEqual(MAX_KIND_LABEL);
    }
    expect(new Set(DEFAULT_DEVICE_KINDS.map((item) => item.id)).size).toBe(DEFAULT_DEVICE_KINDS.length);
    expect(new Set(DEFAULT_DEVICE_KINDS.map((item) => item.label.toLowerCase())).size).toBe(DEFAULT_DEVICE_KINDS.length);
    expect(DEFAULT_DEVICE_KINDS.map((item) => item.image)).toEqual(expect.arrayContaining(["handheld-console", "headphones", "camera", "drone", "printer"]));
  });

  it("is what a shop that never configured anything gets, however empty or odd its settings are", () => {
    for (const settings of [undefined, null, {}, [], "x", 5, { deviceKinds: [] }, { deviceKinds: "no" }, { deviceKinds: [null, 3, "x"] }]) {
      expect(deviceKindsFor(settings)).toEqual(DEFAULT_DEVICE_KINDS);
    }
  });

  it("hands out copies, so changing one never changes the standard list", () => {
    const first = deviceKindsFor({});
    first[0].label = "Changed";
    expect(deviceKindsFor({})[0].label).toBe("Phone");
  });
});

describe("cleanDeviceKinds", () => {
  it("trims, collapses spaces and drops blanks and things that are not boxes", () => {
    const out = cleanDeviceKinds([
      { id: "scooter", label: "   E   scooter  ", type: "  E  scooter ", image: "" },
      { label: "   " },
      null,
      "Phone",
      7,
      { label: "Hoverboard" },
    ]);
    expect(labels(out)).toEqual(["E scooter", "Hoverboard", "Other"]);
    expect(out[0].type).toBe("E scooter");
  });

  it("treats the same name as the same box, ignoring case, and keeps the first", () => {
    const out = cleanDeviceKinds([
      { id: "scooter", label: "Scooter", image: "" },
      { id: "scooter-2", label: "SCOOTER", image: "drone" },
      { id: "bike", label: "Bike", type: "scooter", image: "" },
    ]);
    // "SCOOTER" repeats the name, "Bike" would be saved as the same type as Scooter
    expect(labels(out)).toEqual(["Scooter", "Other"]);
  });

  it("keeps the built-ins' own types even if the stored one was changed", () => {
    const out = cleanDeviceKinds([{ id: "watch", label: "Wristwatch", type: "Whatever", image: "smartwatch" }]);
    expect(out[0]).toMatchObject({ id: "watch", label: "Wristwatch", type: "Smartwatch" });
  });

  it("drops a picture that is not in the library: a custom box gets the neutral icon, a built-in its own picture back", () => {
    const out = cleanDeviceKinds([
      { id: "hoverboard", label: "Hoverboard", image: "no-such-picture" },
      { id: "phone", label: "Phone", image: "../../etc/passwd" },
      { id: "drone", label: "Drone", image: "" },
      { id: "camera", label: "Camera" },
    ]);
    expect(out.find((item) => item.id === "hoverboard")?.image).toBe("");
    expect(out.find((item) => item.id === "phone")?.image).toBe("phone");
    // an explicit "no picture" is respected, even for a built-in
    expect(out.find((item) => item.id === "drone")?.image).toBe("");
    // a missing one falls back like an unknown one
    expect(out.find((item) => item.id === "camera")?.image).toBe("camera");
  });

  it("always ends with Other, even when it was missing, hidden or in the middle", () => {
    const missing = cleanDeviceKinds([{ id: "phone", label: "Phone", image: "phone" }]);
    expect(missing[missing.length - 1]).toMatchObject({ id: "other", label: "Other", type: "Other" });

    const hiddenInMiddle = cleanDeviceKinds([
      { id: "phone", label: "Phone", image: "phone" },
      { id: "other", label: "Something else", type: "Other", image: "repair-tools", hidden: true },
      { id: "tablet", label: "Tablet", image: "tablet" },
    ]);
    expect(labels(hiddenInMiddle)).toEqual(["Phone", "Tablet", "Something else"]);
    const last = hiddenInMiddle[hiddenInMiddle.length - 1];
    expect(last.hidden).toBeUndefined();
    expect(last.type).toBe("Other");
  });

  it("keeps only one Other, and a custom box can not take the name Other", () => {
    const out = cleanDeviceKinds([
      { id: "other", label: "Other", image: "repair-tools" },
      { id: "misc", label: "Other", type: "Other", image: "" },
      { id: "x", label: "Anything", type: "Other" },
    ]);
    expect(out.filter((item) => item.type === "Other")).toHaveLength(1);
    expect(out[out.length - 1].id).toBe("other");
  });

  it("falls back to the plain name Other when the Other box was renamed to a name already taken", () => {
    const out = cleanDeviceKinds([
      { id: "phone", label: "Phone", image: "phone" },
      { id: "other", label: "phone", type: "Other" },
    ]);
    expect(labels(out)).toEqual(["Phone", "Other"]);
  });

  it("allows at most 24 boxes, Other included, and cuts a name to 30 letters", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `d${index}`, label: `Device ${index}`, image: "" }));
    const out = cleanDeviceKinds(many);
    expect(out).toHaveLength(MAX_DEVICE_KINDS);
    expect(out[out.length - 1].id).toBe("other");
    const long = cleanDeviceKinds([{ id: "long", label: "x".repeat(80), image: "" }]);
    expect(long[0].label).toHaveLength(MAX_KIND_LABEL);
  });

  it("gives every box a valid, unique id, whatever came in", () => {
    const out = cleanDeviceKinds([
      { id: "Bad ID!", label: "One", image: "" },
      { id: "same", label: "Two", image: "" },
      { id: "same", label: "Three", image: "" },
      { label: "Four" },
    ]);
    const ids = out.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
  });

  it("keeps hidden only when it is exactly true", () => {
    const out = cleanDeviceKinds([
      { id: "a", label: "A", image: "", hidden: true },
      { id: "b", label: "B", image: "", hidden: "yes" },
    ]);
    expect(out.map((item) => item.hidden)).toEqual([true, undefined, undefined]);
  });
});

describe("deviceKindsFor and visibleDeviceKinds", () => {
  it("returns the shop's own list when it has one, cleaned", () => {
    const list = deviceKindsFor({ deviceKinds: [{ id: "phone", label: "Phone", image: "phone" }, { id: "scooter", label: "Scooter", image: "" }] });
    expect(labels(list)).toEqual(["Phone", "Scooter", "Other"]);
  });

  it("skips hidden boxes but never Other", () => {
    const list = [kind("A", { hidden: true }), kind("B"), kind("Other", { id: "other", type: "Other" })];
    expect(labels(visibleDeviceKinds(list))).toEqual(["B", "Other"]);
    expect(labels(visibleDeviceKinds([kind("Other", { id: "other", type: "Other", hidden: true })]))).toEqual(["Other"]);
  });

  it("finds a box's picture, or none for the neutral icon", () => {
    expect(kindPicture({ image: "printer" })?.label).toBe("Printer");
    expect(kindPicture({ image: "" })).toBeNull();
    expect(kindPicture({ image: "nope" })).toBeNull();
  });
});

describe("checkDeviceKinds: refuses in words what cleaning would quietly cut", () => {
  it("refuses something that is not a list", () => {
    for (const value of [null, undefined, "x", {}, 4]) {
      const result = checkDeviceKinds(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/could not be read/);
    }
  });

  it("refuses a name longer than 30 letters", () => {
    const result = checkDeviceKinds([{ id: "x", label: "y".repeat(31), image: "" }]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/too long.*30 letters/);
  });

  it("refuses more than 24 devices", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ id: `d${index}`, label: `Device ${index}`, image: "" }));
    const result = checkDeviceKinds(many);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/up to 24/);
  });

  it("accepts 24 including Other and returns the cleaned list", () => {
    const many = Array.from({ length: 23 }, (_, index) => ({ id: `d${index}`, label: `Device ${index}`, image: "" }));
    const result = checkDeviceKinds([...many, { id: "other", label: "Other", image: "repair-tools" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kinds).toHaveLength(24);
  });
});

describe("naming a device box", () => {
  const list = cleanDeviceKinds([{ id: "phone", label: "Phone", image: "phone" }, { id: "tv", label: "TV", image: "television" }]);

  it("says what is wrong, in words", () => {
    expect(deviceNameIssue(list, "   ")).toBe("Type a name first.");
    expect(deviceNameIssue(list, "x".repeat(31))).toMatch(/30 letters/);
    expect(deviceNameIssue(list, " phone ")).toMatch(/already have a box called “Phone”/);
    expect(deviceNameIssue(list, "Television")).toMatch(/already have a box called “TV”/);
    expect(deviceNameIssue(list, "Drone")).toBe("");
  });

  it("lets a box keep its own name when it is renamed", () => {
    expect(deviceNameIssue(list, "Phone", "phone")).toBe("");
    expect(deviceNameIssue(list, "TV", "phone")).toMatch(/already/);
  });
});

describe("changing the device list", () => {
  const base = cleanDeviceKinds([
    { id: "phone", label: "Phone", image: "phone" },
    { id: "tablet", label: "Tablet", image: "tablet" },
    { id: "scooter", label: "Scooter", type: "Scooter", image: "" },
  ]);

  it("adds a custom box just before Other, saved with its own name", () => {
    const result = addDeviceKind(base, { label: "  E   bike ", image: "drone" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(labels(result.value)).toEqual(["Phone", "Tablet", "Scooter", "E bike", "Other"]);
    expect(result.value[3]).toMatchObject({ id: "e-bike", type: "E bike", image: "drone" });
  });

  it("gives a new box an id nobody has, and an unknown picture becomes the neutral icon", () => {
    const first = addDeviceKind(base, { label: "Scooter 2", image: "nope" });
    expect(first.ok && first.value[3]).toMatchObject({ id: "scooter-2", image: "" });
    const renamedBuiltIn = cleanDeviceKinds([{ id: "drone", label: "UAV", image: "drone" }]);
    // the built-in is still saved as "Drone", so that name is taken even though the box says UAV
    expect(addDeviceKind(renamedBuiltIn, { label: "Drone" })).toEqual({ ok: false, error: "You already have a box called “UAV”." });
    const second = addDeviceKind(renamedBuiltIn, { label: "Drone!" });
    expect(second.ok && second.value.map((item) => item.id)).toEqual(["drone", "drone-2", "other"]);
  });

  it("refuses a duplicate, a blank, a long name and a list that is full, in words", () => {
    expect(addDeviceKind(base, { label: "phone" })).toEqual({ ok: false, error: "You already have a box called “Phone”." });
    expect(addDeviceKind(base, { label: "  " })).toEqual({ ok: false, error: "Type a name first." });
    expect((addDeviceKind(base, { label: "z".repeat(40) }) as { error: string }).error).toMatch(/30 letters/);
    const full = cleanDeviceKinds(Array.from({ length: 23 }, (_, index) => ({ id: `d${index}`, label: `Device ${index}`, image: "" })));
    expect(full).toHaveLength(MAX_DEVICE_KINDS);
    expect((addDeviceKind(full, { label: "One more" }) as { error: string }).error).toMatch(/up to 24/);
  });

  it("renames a custom box and its saved type follows; a built-in keeps its type", () => {
    const custom = updateDeviceKind(base, "scooter", { label: "E-scooter" });
    expect(custom.ok && custom.value.find((item) => item.id === "scooter")).toMatchObject({ label: "E-scooter", type: "E-scooter" });
    const builtIn = updateDeviceKind(cleanDeviceKinds([{ id: "watch", label: "Watch", image: "smartwatch" }]), "watch", { label: "Wristwatch" });
    expect(builtIn.ok && builtIn.value[0]).toMatchObject({ label: "Wristwatch", type: "Smartwatch" });
  });

  it("re-pictures a box, and refuses a clash or an unknown id", () => {
    const pic = updateDeviceKind(base, "phone", { image: "camera" });
    expect(pic.ok && pic.value[0].image).toBe("camera");
    const none = updateDeviceKind(base, "phone", { image: "" });
    expect(none.ok && none.value[0].image).toBe("");
    expect(updateDeviceKind(base, "tablet", { label: "Phone" })).toEqual({ ok: false, error: "You already have a box called “Phone”." });
    expect(updateDeviceKind(base, "ghost", { label: "x" })).toEqual({ ok: false, error: "That device is no longer in the list." });
  });

  it("hides and shows a box, but never Other", () => {
    const hidden = setDeviceHidden(base, "tablet", true);
    expect(hidden.find((item) => item.id === "tablet")?.hidden).toBe(true);
    expect(setDeviceHidden(hidden, "tablet", false).find((item) => item.id === "tablet")?.hidden).toBeUndefined();
    expect(setDeviceHidden(base, "other", true).find((item) => item.id === "other")?.hidden).toBeUndefined();
  });

  it("removes a custom box only: built-ins can be hidden, never removed, and Other stays", () => {
    expect(labels(removeDeviceKind(base, "scooter"))).toEqual(["Phone", "Tablet", "Other"]);
    expect(isBuiltInKind("phone")).toBe(true);
    expect(isBuiltInKind("scooter")).toBe(false);
    expect(labels(removeDeviceKind(base, "phone"))).toEqual(labels(base));
    expect(labels(removeDeviceKind(base, "other"))).toEqual(labels(base));
  });

  it("moves a box one place earlier or later, never past Other and never Other itself", () => {
    expect(labels(moveDeviceKind(base, "tablet", -1))).toEqual(["Tablet", "Phone", "Scooter", "Other"]);
    expect(labels(moveDeviceKind(base, "phone", 1))).toEqual(["Tablet", "Phone", "Scooter", "Other"]);
    expect(labels(moveDeviceKind(base, "scooter", 1))).toEqual(labels(base));
    expect(labels(moveDeviceKind(base, "phone", -1))).toEqual(labels(base));
    expect(labels(moveDeviceKind(base, "other", -1))).toEqual(labels(base));
    expect(canMoveDevice(base, "phone", -1)).toBe(false);
    expect(canMoveDevice(base, "phone", 1)).toBe(true);
    expect(canMoveDevice(base, "scooter", 1)).toBe(false);
    expect(canMoveDevice(base, "other", -1)).toBe(false);
    expect(canMoveDevice(base, "nobody", 1)).toBe(false);
  });
});

describe("the problem list", () => {
  it("trims, collapses spaces, drops blanks and ignores case when looking for duplicates", () => {
    expect(cleanProblemTypes(["  Screen   Repair ", "screen repair", "", "   ", 4, null, "Battery"])).toEqual(["Screen Repair", "Battery"]);
    expect(cleanProblemTypes("nope")).toEqual([]);
  });

  it("caps the list at 40 and a name at 60 letters", () => {
    const many = Array.from({ length: 60 }, (_, index) => `Problem ${index}`);
    expect(cleanProblemTypes(many)).toHaveLength(MAX_PROBLEMS);
    expect(cleanProblemTypes(["q".repeat(100)])[0]).toHaveLength(MAX_PROBLEM_LENGTH);
  });

  it("refuses, in words, a list that is empty, too long or has a name that is too long", () => {
    expect(checkProblemTypes(["  ", ""])).toEqual({ ok: false, error: "Keep at least one problem." });
    expect(checkProblemTypes("no")).toMatchObject({ ok: false });
    expect((checkProblemTypes(["x".repeat(61)]) as { error: string }).error).toMatch(/too long.*60 letters/);
    expect((checkProblemTypes(Array.from({ length: 41 }, (_, index) => `P${index}`)) as { error: string }).error).toMatch(/up to 40/);
    expect(checkProblemTypes(["Screen", "screen", "Battery"])).toEqual({ ok: true, problems: ["Screen", "Battery"] });
  });

  it("says what is wrong with a name", () => {
    const problems = ["Screen Repair", "Battery"];
    expect(problemNameIssue(problems, " ")).toBe("Type a name first.");
    expect(problemNameIssue(problems, "x".repeat(61))).toMatch(/60 letters/);
    expect(problemNameIssue(problems, "screen repair")).toMatch(/already have a box called “Screen Repair”/);
    expect(problemNameIssue(problems, "Screen repair", "Screen Repair")).toBe("");
    expect(problemNameIssue(problems, "Charging port")).toBe("");
  });
});

describe("problem pictures", () => {
  const problems = ["Screen Repair", "Charging port", "Other"];

  it("keeps a picture only for a problem that is in the list and a key that is in the library", () => {
    const out = cleanProblemPictures(
      { "Charging port": "charging-port", "Screen Repair": "no-such-key", "Gone problem": "drone", other: "repair-tools", "": "drone" },
      problems,
    );
    expect(out).toEqual({ "Charging port": "charging-port", Other: "repair-tools" });
  });

  it("files a picture under the list's own spelling and ignores nonsense", () => {
    expect(cleanProblemPictures({ "  CHARGING   PORT ": "charging-port" }, problems)).toEqual({ "Charging port": "charging-port" });
    for (const raw of [null, undefined, "x", 3, [], [["a", "b"]]]) expect(cleanProblemPictures(raw, problems)).toEqual({});
    expect(cleanProblemPictures({ __proto__: "x", constructor: "drone" }, ["__proto__", "constructor"])).toEqual({ constructor: "drone" });
  });

  it("reads them from the settings, against the settings' own problem list", () => {
    const settings = { problemTypes: ["A", "B"], problemPictures: { A: "drone", Z: "drone" } };
    expect(problemPicturesFor(settings)).toEqual({ A: "drone" });
    expect(problemPicturesFor(settings, ["Z"])).toEqual({ Z: "drone" });
    expect(problemPicturesFor({})).toEqual({});
    expect(problemPicturesFor(undefined)).toEqual({});
  });

  it("adds, renames (the picture follows), re-pictures and removes a problem", () => {
    const state = { problems: ["Screen Repair", "Charging port"], pictures: { "Charging port": "charging-port" } };

    const added = addProblem(state, { name: " Cracked   back ", image: "back-skin-film" });
    expect(added.ok && added.value).toEqual({ problems: ["Screen Repair", "Charging port", "Cracked back"], pictures: { "Charging port": "charging-port", "Cracked back": "back-skin-film" } });
    expect(addProblem(state, { name: "charging PORT" })).toEqual({ ok: false, error: "You already have a box called “Charging port”." });
    expect((addProblem({ problems: Array.from({ length: 40 }, (_, index) => `P${index}`), pictures: {} }, { name: "More" }) as { error: string }).error).toMatch(/up to 40/);

    const renamed = updateProblem(state, "Charging port", { name: "USB-C port" });
    expect(renamed.ok && renamed.value).toEqual({ problems: ["Screen Repair", "USB-C port"], pictures: { "USB-C port": "charging-port" } });
    const repictured = updateProblem(state, "Screen Repair", { image: "display-assembly" });
    expect(repictured.ok && repictured.value.pictures).toEqual({ "Charging port": "charging-port", "Screen Repair": "display-assembly" });
    const cleared = updateProblem(state, "Charging port", { image: "" });
    expect(cleared.ok && cleared.value.pictures).toEqual({});
    expect(updateProblem(state, "Ghost", { name: "x" })).toEqual({ ok: false, error: "That problem is no longer in the list." });
    expect(updateProblem(state, "Screen Repair", { name: "Charging port" })).toMatchObject({ ok: false });

    const removed = removeProblem(state, "Charging port");
    expect(removed.ok && removed.value).toEqual({ problems: ["Screen Repair"], pictures: {} });
    expect(removeProblem({ problems: ["Only one"], pictures: {} }, "Only one")).toEqual({ ok: false, error: "Keep at least one problem." });
  });

  it("moves a problem one place at a time", () => {
    expect(moveProblem(["A", "B", "C"], "B", -1)).toEqual(["B", "A", "C"]);
    expect(moveProblem(["A", "B", "C"], "B", 1)).toEqual(["A", "C", "B"]);
    expect(moveProblem(["A", "B", "C"], "A", -1)).toEqual(["A", "B", "C"]);
    expect(moveProblem(["A", "B", "C"], "C", 1)).toEqual(["A", "B", "C"]);
    expect(canMoveProblem(["A", "B"], "A", -1)).toBe(false);
    expect(canMoveProblem(["A", "B"], "A", 1)).toBe(true);
    expect(canMoveProblem(["A", "B"], "B", 1)).toBe(false);
    expect(canMoveProblem(["A", "B"], "nope", 1)).toBe(false);
  });
});

describe("checklists follow a problem by its name", () => {
  const checklist = (name: string, problemType: string | null) => ({ name, problemType });
  const templates = [checklist("Laptop intake", "Diagnostic"), checklist("Water triage", "Water Damage"), checklist("QC pass", null), checklist("Second look", "Diagnostic")];

  it("finds the checklists that attach to a problem, by exact name", () => {
    expect(checklistsOn(templates, "Diagnostic").map((item) => item.name)).toEqual(["Laptop intake", "Second look"]);
    expect(checklistsOn(templates, "diagnostic")).toEqual([]); // a new repair matches the exact name, so does this
    expect(checklistsOn(templates, "Battery")).toEqual([]);
  });

  it("finds the ones whose problem is not on the list, and never the ones picked by hand", () => {
    expect(checklistsWithoutProblem(templates, ["Screen Repair", "Water Damage"]).map((item) => item.name)).toEqual(["Laptop intake", "Second look"]);
    expect(checklistsWithoutProblem(templates, ["Diagnostic", "Water Damage"])).toEqual([]);
    expect(checklistsWithoutProblem([checklist("A", ""), checklist("B", null)], [])).toEqual([]);
  });

  it("sees which names changed between two lists of the same length", () => {
    expect(renamesBetween(["A", "B", "C"], ["A", "B2", "C"])).toEqual([{ from: "B", to: "B2" }]);
    expect(renamesBetween(["A", "B"], ["A", "B"])).toEqual([]);
    expect(renamesBetween(["A", "B"], ["A"])).toEqual([]); // a removal is not a rename
    expect(renamesBetween(["A"], ["A", "B"])).toEqual([]); // an addition is not a rename
  });

  it("honours a rename only when it matches the list being saved", () => {
    const list = ["Screen Repair", "Diagnostics", "Other"];
    expect(cleanProblemRenames([{ from: "Diagnostic", to: "Diagnostics" }], list)).toEqual([{ from: "Diagnostic", to: "Diagnostics" }]);
    expect(cleanProblemRenames([{ from: "Screen Repair", to: "Diagnostics" }], list)).toEqual([]); // the old name is still there
    expect(cleanProblemRenames([{ from: "Diagnostic", to: "Elsewhere" }], list)).toEqual([]); // the new name is not
    expect(cleanProblemRenames([{ from: "A", to: "A" }, { from: "", to: "Other" }, { from: "A", to: 4 }, { to: "Other" }, null, "A", 3], list)).toEqual([]);
    expect(cleanProblemRenames([{ from: "Old", to: "Other" }, { from: "Old", to: "Diagnostics" }], list)).toEqual([{ from: "Old", to: "Other" }]); // each old name once
    expect(cleanProblemRenames("nope", list)).toEqual([]);
    expect(cleanProblemRenames(undefined, list)).toEqual([]);
  });

  it("can not chain or swap, because an old name that is still listed is refused", () => {
    expect(cleanProblemRenames([{ from: "A", to: "B" }, { from: "B", to: "A" }], ["A", "B"])).toEqual([]);
    expect(cleanProblemRenames([{ from: "A", to: "B" }, { from: "B", to: "C" }], ["B", "C"])).toEqual([{ from: "A", to: "B" }]);
  });

  it("says in words what a change does to the checklists, and nothing when there are none", () => {
    const one = [checklist("Laptop intake", "Diagnostic")];
    const two = [...one, checklist("Second look", "Diagnostic")];
    const many = Array.from({ length: 5 }, (_, index) => checklist(`List ${index}`, "Diagnostic"));
    expect(renameChecklistNote(one)).toBe("The checklist “Laptop intake” is tied to this problem and moves with it if you rename it.");
    expect(renameChecklistNote(two)).toBe("The checklists “Laptop intake” and “Second look” are tied to this problem and move with it if you rename it.");
    expect(renameChecklistNote(many)).toBe("5 checklists are tied to this problem and move with it if you rename it.");
    expect(removeChecklistNote(one)).toBe("The checklist “Laptop intake” will not attach to new repairs now. Undo puts it back.");
    expect(removeChecklistNote(two)).toContain("Undo puts them back.");
    expect(resetChecklistNote(one)).toBe("The checklist “Laptop intake” stops attaching to new repairs, because its problem is not in the standard list. You can pick another problem for it under Checklists.");
    expect(resetChecklistNote(two)).toContain("stop attaching");
    expect(resetChecklistNote(two)).toContain("their problems are not in the standard list");
    for (const note of [renameChecklistNote, removeChecklistNote, resetChecklistNote]) expect(note([])).toBe("");
  });
});

describe("picture suggestions", () => {
  it("puts the best match first, then others, with no repeats", () => {
    expect(suggestPictures("Drone")[0].key).toBe("drone");
    expect(suggestPictures("Printer")[0].key).toBe("printer");
    expect(suggestPictures("Charging port")[0].key).toBe("charging-port");
    const keys = suggestPictures("Drone").map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeLessThanOrEqual(5);
    expect(suggestPictures("Drone", 2)).toHaveLength(2);
  });

  it("offers nothing for what the library has no picture for, and for a blank", () => {
    expect(suggestPictures("e-scooter")).toEqual([]);
    expect(suggestPictures("   ")).toEqual([]);
    expect(suggestPictures("Drone", 0)).toEqual([]);
    expect(defaultPictureKey("e-scooter")).toBe("");
    expect(defaultPictureKey("Printer")).toBe("printer");
  });

  it("prefers a part to the generic toolbox for repair wording", () => {
    expect(suggestPictures("Screen Repair")[0].key).not.toBe("repair-tools");
  });

  it("only ever suggests pictures that exist", () => {
    for (const query of ["phone", "battery", "cable", "tv", "headphone"]) {
      for (const entry of suggestPictures(query)) expect(catalogEntryByKey(entry.key)?.image).toBe(entry.image);
    }
  });
});

describe("tidy", () => {
  it("collapses spaces, drops control characters and ignores things that are not text", () => {
    expect(tidy("  a \t\n b\u0000c  ")).toBe("a b c");
    expect(tidy(12)).toBe("");
    expect(tidy(null)).toBe("");
  });
});

describe("a problem box's picture in the check-in", () => {
  it("uses the picture the shop chose, else the guessed one, else the icon", () => {
    expect(problemVisualFor("Screen Repair")).toEqual(problemVisual("Screen Repair"));
    expect(problemVisualFor("Screen Repair", {})).toEqual(problemVisual("Screen Repair"));
    expect(problemVisualFor("Charging port", { "Charging port": "drone" })).toEqual({ kind: "photo", src: catalogEntryByKey("drone")!.image });
    // a key that no longer exists must not break the box
    expect(problemVisualFor("Water Damage", { "Water Damage": "gone" })).toEqual({ kind: "icon", icon: "water" });
  });

  it("finds a choice by name ignoring case, and for the same box under another wording", () => {
    expect(chosenProblemPicture("screen repair", { "Screen Repair": "drone" })).toBe("drone");
    // "Screen" (the shop's word) and "Screen Repair" (the device's word) are one box
    expect(chosenProblemPicture("Screen Repair", { Screen: "camera" })).toBe("camera");
    expect(chosenProblemPicture("Other", { "Other Repair": "camera" })).toBe("");
    expect(chosenProblemPicture("Anything", undefined)).toBe("");
  });
});

describe("what staff are asked for each new kind of device", () => {
  it("gives the new kinds their own brands and problems, never a phone's", () => {
    for (const type of ["Handheld console", "Headphones", "Camera", "Drone", "Printer"]) {
      const profile = easyIntakeProfile(type);
      expect(profile.makes.length, type).toBeGreaterThan(0);
      expect(profile.problems.length, type).toBeGreaterThan(0);
    }
    expect(easyIntakeProfile("Headphones").problems).not.toContain("Charging Port Repair");
    expect(easyIntakeProfile("Headphones").makes).toContain("Sony");
    expect(easyIntakeProfile("Drone").makes).toContain("DJI");
    expect(easyIntakeProfile("Printer").problems).toContain("Paper Jam");
    expect(easyIntakeProfile("Handheld console").makes).toContain("Valve");
  });

  it("leaves the original kinds exactly as they were", () => {
    expect(easyIntakeProfile("Game console").makes).toEqual(["Sony", "Microsoft", "Nintendo"]);
    expect(easyIntakeProfile("Smartwatch").makes).toContain("Garmin");
    expect(easyIntakeProfile("Phone").problems).toContain("Charging Port Repair");
    // a name the app has never heard of still gets the general profile
    expect(easyIntakeProfile("E-scooter").problems).toContain("Diagnostic");
  });

  it("lists no phone or laptop models for headphones, a drone, a camera or a printer", () => {
    for (const type of ["Headphones", "Drone", "Camera", "Printer"]) expect(easyModelOptions(type, "Apple")).toEqual([]);
    expect(easyModelOptions("Phone", "Apple")).toEqual(["iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16"]);
  });
});
