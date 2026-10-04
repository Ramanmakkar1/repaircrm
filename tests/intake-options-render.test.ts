import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The editor only needs the action to exist; nothing here saves.
vi.mock("@/app/(app)/settings/actions", () => ({ saveIntakeOptionsAction: vi.fn(), updateWorkflowAction: vi.fn() }));

import { DeviceStep } from "@/components/tickets/intake/step-device";
import { ProblemStep } from "@/components/tickets/intake/step-problem";
import {
  NEW,
  fieldValues,
  initialState,
  withDeviceKind,
  withDeviceType,
  type CheckInContext,
  type CheckInState,
} from "@/components/tickets/intake/flow";
import { Dialog } from "@/components/ui/dialog";
import { IntakeOptionsEditor } from "@/components/settings/intake-options-editor";
import { SheetBody } from "@/components/settings/intake-option-sheet";
import { PictureChooser } from "@/components/settings/picture-chooser";
import { CATALOG_GROUPS } from "@/lib/catalog/match";
import { DEFAULT_DEVICE_KINDS, cleanDeviceKinds, type DeviceKind } from "@/lib/intake-options";

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const count = (html: string, needle: string) => html.split(needle).length - 1;

const standard = DEFAULT_DEVICE_KINDS.map((kind) => ({ ...kind }));
const withScooter: DeviceKind[] = cleanDeviceKinds([...standard.slice(0, -1), { id: "scooter", label: "E-scooter", type: "E-scooter", image: "" }]);

function ctxWith(extra: Partial<CheckInContext> = {}): CheckInContext {
  return {
    customers: [{ id: "cus_1", label: "Daniel Brooks", phone: "(512) 555-0145" }],
    assetsByCustomer: { cus_1: [] },
    warrantiesByCustomer: {},
    techs: [],
    problemTypes: ["Screen", "Charging port", "Other"],
    locations: [],
    checklists: [],
    ...extra,
  };
}

const picking: CheckInState = { ...initialState({ customerId: "cus_1" }), assetId: NEW };

function device(ctx: CheckInContext, state: CheckInState = picking, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(DeviceStep, { state, ctx, setState: noop, onAdvance: noop, onNext: noop, issues: [], ...extra } as never));
}
function problems(ctx: CheckInContext, state: CheckInState, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(ProblemStep, { state, ctx, setState: noop, onChosen: noop, onNext: noop, issues: [], ...extra } as never));
}
const kindTiles = (html: string) => {
  const group = html.match(/aria-label="Kind of device"[\s\S]*?(?=<button type="button" aria-pressed="[a-z]+" class="flex min-h-14)/)?.[0] ?? "";
  return [...group.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((match) => text(match[1]).trim());
};

describe("the device step with the shop's own boxes", () => {
  it("shows at most eight boxes on the first screen: seven kinds and a More devices box when there are more than eight", () => {
    const html = device(ctxWith({ deviceKinds: standard }));
    const tiles = kindTiles(html);
    expect(tiles).toHaveLength(8);
    expect(tiles.slice(0, 7)).toEqual(["Phone", "Tablet", "Laptop", "Computer", "Game console", "TV", "Watch"]);
    expect(tiles[7]).toMatch(/^More devices\s+6 more$/);
    // the rest are not on the first screen
    for (const hidden of ["Handheld console", "Headphones", "Camera", "Drone", "Printer", "Other"]) expect(text(html)).not.toContain(hidden);
    // the More box is a disclosure, not a choice
    expect(html).toMatch(/aria-expanded="false"[^>]*data-more-devices/);
    expect(text(html)).toContain("No device");
  });

  it("shows every box, with no More devices box, when there are eight or fewer", () => {
    const original = standard.filter((kind) => ["phone", "tablet", "laptop", "computer", "game-console", "tv", "watch", "other"].includes(kind.id));
    const html = device(ctxWith({ deviceKinds: original }));
    expect(kindTiles(html)).toEqual(["Phone", "Tablet", "Laptop", "Computer", "Game console", "TV", "Watch", "Other"]);
    expect(text(html)).not.toContain("More devices");
  });

  it("is the standard list when the shop has none of its own", () => {
    const html = device(ctxWith());
    expect(text(html)).toContain("More devices");
    expect(kindTiles(html)).toHaveLength(8);
  });

  it("skips a box the owner hid, and counts only the boxes staff can see", () => {
    const hidden = standard.map((kind) => (["tablet", "drone", "camera", "printer"].includes(kind.id) ? { ...kind, hidden: true } : kind));
    const html = device(ctxWith({ deviceKinds: hidden }));
    // 13 - 4 hidden = 9 visible: still more than eight
    const tiles = kindTiles(html);
    expect(tiles.slice(0, 7)).toEqual(["Phone", "Laptop", "Computer", "Game console", "TV", "Watch", "Handheld console"]);
    expect(tiles[7]).toMatch(/^More devices\s+2 more$/);

    const fewer = standard.filter((kind) => kind.id !== "tablet" && kind.id !== "other").map((kind) => (kind.id === "drone" ? { ...kind, hidden: true } : kind));
    const small = device(ctxWith({ deviceKinds: [...fewer.slice(0, 6), { ...standard[standard.length - 1] }] }));
    expect(text(small)).not.toContain("More devices");
    expect(text(small)).not.toContain("Drone");
  });

  it("keeps Other on the list even if it was sent hidden", () => {
    const sent = cleanDeviceKinds([{ id: "phone", label: "Phone", image: "phone" }, { id: "other", label: "Other", type: "Other", image: "repair-tools", hidden: true }]);
    expect(kindTiles(device(ctxWith({ deviceKinds: sent })))).toEqual(["Phone", "Other"]);
  });

  it("opens the whole list when a box from the folded part is already chosen, so the choice is never out of sight", () => {
    const state: CheckInState = { ...picking, deviceStage: "kind", device: { type: "Printer", make: "", model: "", serial: "", password: "" } };
    const html = device(ctxWith({ deviceKinds: standard }), state);
    const tiles = kindTiles(html);
    expect(tiles).toEqual(expect.arrayContaining(["Printer", "Other", "Handheld console"]));
    expect(tiles).not.toContain("More devices");
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Printer/);
  });

  it("draws a custom box with a picture from its picture, and one without as the neutral icon", () => {
    const html = device(ctxWith({ deviceKinds: cleanDeviceKinds([{ id: "scooter", label: "E-scooter", image: "" }, { id: "drone", label: "Drone", image: "drone" }]) }));
    expect(text(html)).toContain("E-scooter");
    expect(html).toContain("drone.webp");
    expect(html).toContain("<svg"); // the icon box
    // Drone and Other have pictures, E-scooter has none
    expect(count(html, "<img")).toBe(2);
    expect(html).not.toContain("e-scooter.webp");
  });

  it("saves a custom box's type with the repair, exactly like a built-in", () => {
    const customer = initialState({ customerId: "cus_1" });
    const scooter = withScooter.find((kind) => kind.id === "scooter")!;
    const state = withDeviceKind(customer, scooter.type, ["Screen"]);
    expect(state.device.type).toBe("E-scooter");
    const posted = fieldValues(state, ctxWith());
    expect(posted.assetId).toBe("__new__");
    expect(posted.newDeviceType).toBe("E-scooter");
    // and a renamed built-in still posts its original type
    const watch = cleanDeviceKinds([{ id: "watch", label: "Wristwatch", image: "smartwatch" }])[0];
    expect(fieldValues(withDeviceKind(customer, watch.type, ["Screen"]), ctxWith()).newDeviceType).toBe("Smartwatch");
  });

  it("shows the chosen custom device in the crumb, under its own name", () => {
    const state = withDeviceKind(initialState({ customerId: "cus_1" }), "E-scooter", ["Screen"]);
    const html = device(ctxWith({ deviceKinds: withScooter }), state);
    expect(text(html)).toContain("E-scooter");
    expect(text(html)).toContain("Change");
    expect(text(html)).toContain("Which brand?");
  });
});

describe("quiet owner tools in the device step", () => {
  const typed = (name: string) => withDeviceType(withDeviceKind(initialState({ customerId: "cus_1" }), "Other", ["Screen"]), name, ["Screen"]);
  const save = vi.fn();

  it("offers the owner to add what was typed under Other, once, as quiet text", () => {
    const html = device(ctxWith({ deviceKinds: standard }), typed("Hoverboard"), { saveOptions: save });
    expect(text(html)).toContain("Add “Hoverboard” to my devices");
    expect(count(html, "to my devices")).toBe(1);
    expect(html).toContain('role="status"');
  });

  it("does not offer it to anyone else", () => {
    expect(text(device(ctxWith({ deviceKinds: standard }), typed("Hoverboard")))).not.toContain("to my devices");
  });

  it("does not offer it for a name the shop already has, or while Other is untouched, or for a name too long", () => {
    for (const name of ["Printer", "printer", "Television", "Other", "x"]) {
      expect(text(device(ctxWith({ deviceKinds: standard }), typed(name), { saveOptions: save })), name).not.toContain("to my devices");
    }
    expect(text(device(ctxWith({ deviceKinds: standard }), typed("y".repeat(31)), { saveOptions: save }))).not.toContain("to my devices");
  });

  it("links the owner to Settings, Workflow, from the end of the device and problem steps, and nobody else", () => {
    const owner = device(ctxWith({ deviceKinds: standard }), picking, { saveOptions: save });
    expect(owner).toContain('href="/settings?tab=workflow"');
    expect(text(owner)).toContain("Add more devices");
    expect(owner).toContain('target="_blank"');
    expect(text(owner)).toContain("(opens in a new tab)");
    expect(device(ctxWith({ deviceKinds: standard }))).not.toContain("/settings?tab=workflow");

    const state = withDeviceKind(initialState({ customerId: "cus_1" }), "Phone", ["Screen"]);
    expect(problems(ctxWith(), state, { canEditOptions: true })).toContain('href="/settings?tab=workflow"');
    expect(text(problems(ctxWith(), state, { canEditOptions: true }))).toContain("Add more problems");
    expect(problems(ctxWith(), state)).not.toContain("/settings?tab=workflow");
  });
});

describe("the problem step with chosen pictures", () => {
  const state = withDeviceKind(initialState({ customerId: "cus_1" }), "Phone", ["Screen", "Charging port"]);

  it("uses the picture the shop chose for a problem, and the usual one for the rest", () => {
    const html = problems(ctxWith({ problemPictures: { "Charging port": "drone" } }), state);
    // a phone offers "Charging Port Repair" and "Screen Repair": the shop's "Charging port" is the same box
    const box = (label: string) => html.split("<button").find((chunk) => text(chunk).includes(label)) ?? "";
    expect(box("Charging Port Repair")).toContain("drone.webp");
    expect(box("Screen Repair")).toContain("display-assembly.webp");
    expect(box("Other")).toContain("<svg");
  });

  it("without a choice it looks as it always did", () => {
    const html = problems(ctxWith(), state);
    expect(html).toContain("charging-port.webp");
    expect(html).toContain("display-assembly.webp");
    expect(html).not.toContain("drone.webp");
  });

  it("finds the choice for the shop's own wording of a box the device also offers", () => {
    // a phone offers "Screen Repair"; the shop calls the same box "Screen"
    const html = problems(ctxWith({ problemPictures: { Screen: "camera" } }), state);
    expect(html).toContain("camera.webp");
    expect(html).not.toContain("display-assembly.webp");
  });

  it("falls back to the usual picture when the chosen one is no longer in the library", () => {
    const html = problems(ctxWith({ problemPictures: { Screen: "deleted-key" } }), state);
    expect(html).toContain("display-assembly.webp");
  });
});

describe("the editor in Settings", () => {
  const props = { deviceKinds: standard, problemTypes: ["Screen Repair", "Battery Replacement", "Water Damage", "Other"], problemPictures: { "Water Damage": "water-damage" } };
  const html = renderToStaticMarkup(createElement(IntakeOptionsEditor, props));

  it("says in plain words what these boxes are", () => {
    expect(text(html)).toContain("These are the boxes your staff tap when they check a repair in.");
    expect(text(html)).toContain("Your changes save as you make them.");
  });

  it("has the two sections, each a grid of picture boxes", () => {
    expect(text(html)).toContain("Devices you repair");
    expect(text(html)).toContain("Problems you fix");
    expect(html).toContain('aria-label="Devices you repair"');
    expect(html).toContain('aria-label="Problems you fix"');
    expect(count(html, "<li")).toBe(standard.length + 4 + 2); // every box, plus an Add box in each grid
    // the pictures are the ones staff see
    for (const picture of ["phone", "tablet", "laptop", "desktop-computer", "game-console", "television", "smartwatch", "handheld-console", "headphones", "camera", "drone", "printer", "repair-tools"]) {
      expect(html, picture).toContain(`${picture}.webp`);
    }
    expect(html).toContain("water-damage.webp"); // the problem with a chosen picture
    expect(html).toContain("display-assembly.webp"); // the guessed one
  });

  it("gives every box Edit, Earlier, Later and Hide or Remove, as real buttons with full names", () => {
    for (const label of ["Edit Phone", "Move Phone earlier", "Move Phone later", "Hide Phone from staff", "Edit Screen Repair", "Move Screen Repair later", "Remove Screen Repair"]) {
      expect(html, label).toContain(`aria-label="${label}"`);
    }
    // the first box can not go earlier, the last movable one can not go later
    expect(html).toMatch(/<button[^>]*aria-label="Move Phone earlier"[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*aria-label="Move Printer later"[^>]*disabled/);
    expect(html).not.toMatch(/<button[^>]*aria-label="Move Tablet earlier"[^>]*disabled/);
    // every button is at least 48px
    expect(html).toContain("h-12");
  });

  it("keeps Other last: it can be edited, but not moved, hidden or removed", () => {
    const devices = html.slice(0, html.indexOf('aria-label="Problems you fix"'));
    expect(devices).toContain('aria-label="Edit Other"');
    expect(devices).not.toContain('aria-label="Hide Other from staff"');
    expect(devices).not.toContain('aria-label="Move Other earlier"');
    expect(devices).not.toContain('aria-label="Move Other later"');
    expect(text(devices)).toContain("Always last");
    // the nearest box can not be moved past it
    expect(devices).toMatch(/<button[^>]*aria-label="Move Printer later"[^>]*disabled/);
  });

  it("has a big Add a device box and Add a problem box at the end of each grid", () => {
    expect(text(html)).toContain("Add a device");
    expect(text(html)).toContain("Add a problem");
    expect(html.indexOf("Add a device")).toBeGreaterThan(html.indexOf('aria-label="Edit Other"'));
  });

  it("has a Reset to the standard list button for each section (it asks before it does anything)", () => {
    expect(count(text(html), "Reset to the standard list")).toBe(2);
    expect(html).not.toContain("Reset the devices?"); // the confirm is not open
  });

  it("marks a hidden device with the word Hidden, and offers Show", () => {
    const hidden = renderToStaticMarkup(createElement(IntakeOptionsEditor, { ...props, deviceKinds: standard.map((kind) => (kind.id === "camera" ? { ...kind, hidden: true } : kind)) }));
    expect(text(hidden)).toContain("Hidden");
    expect(hidden).toContain('aria-label="Show Camera to staff"');
    expect(hidden).not.toContain('aria-label="Hide Camera from staff"');
    expect(html).not.toContain(">Hidden<");
  });

  it("explains the More devices box once there are more than eight visible, and says nothing of it otherwise", () => {
    expect(text(html)).toContain("“More devices” box");
    const few = renderToStaticMarkup(createElement(IntakeOptionsEditor, { ...props, deviceKinds: standard.filter((kind) => ["phone", "tablet", "other"].includes(kind.id)) }));
    expect(text(few)).not.toContain("“More devices” box");
  });

  it("will not let the last problem go: Remove is disabled and says why", () => {
    const one = renderToStaticMarkup(createElement(IntakeOptionsEditor, { ...props, problemTypes: ["Only one"], problemPictures: {} }));
    expect(one).toMatch(/<button[^>]*aria-label="Keep at least one problem"[^>]*disabled/);
  });

  it("uses the theme only: no hex colours, no coloured side stripes, no white except the photo canvas", () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/border-[lr]-\d|border-l-|border-r-/);
    expect(html).not.toContain("before:");
    // white is the canvas behind a photo and nothing else: one per picture
    expect(count(html, "bg-white")).toBe(count(html, "<img"));
  });
});

describe("the add sheet", () => {
  const body = (extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(Dialog, { open: true }, createElement(SheetBody, { kind: "device", mode: "add", initialName: "", initialImage: "", nameIssue: () => "", onSave: noop, ...extra } as never)),
    );

  it("opens on the name field, focused, with room for the name and a hint", () => {
    const html = body();
    expect(html).toContain("autofocus");
    expect(html).toContain('maxLength="30"');
    expect(text(html)).toContain("Device name");
    expect(text(html)).toContain("For example Printer, Drone or E-scooter.");
    expect(text(html)).toContain("Type a name and we will suggest a picture.");
    expect(text(html)).toContain("Add device");
    expect(text(html)).toContain("Cancel");
  });

  it("previews the best picture for the typed name, as the staff will see it, with others to tap", () => {
    const html = body({ initialName: "Drone", nameIssue: (name: string) => (name ? "" : "Type a name first.") });
    expect(text(html)).toContain("What staff will see");
    expect(text(html)).toContain("Tap a picture to use it.");
    expect(html).toContain("drone.webp");
    // the best match is the one chosen; the others are there to tap
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Drone(?:(?!<\/button>)[\s\S])*Selected/);
    expect(count(html, 'aria-pressed="false"')).toBeGreaterThanOrEqual(3);
    expect(text(html)).toContain("Drone motor");
    expect(html).toContain('aria-label="Suggested pictures"');
  });

  it("offers No picture, and says plainly when the library has nothing for the name", () => {
    const html = body({ initialName: "E-scooter" });
    expect(text(html)).toContain("We have no picture for “E-scooter” yet.");
    expect(text(html)).toContain("No picture");
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*No picture(?:(?!<\/button>)[\s\S])*Selected/);
  });

  it("has a Choose another picture button that is collapsed until it is tapped", () => {
    const html = body();
    expect(text(html)).toContain("Choose another picture");
    expect(html).toMatch(/aria-expanded="false"[^>]*aria-controls="device-sheet-chooser"/);
    expect(html).not.toContain("Search pictures");
  });

  it("shows a name that can not be used, in words, and ties it to the field", () => {
    const html = body({ initialName: "Phone", nameIssue: () => "You already have a box called “Phone”." });
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("You already have a box called");
  });

  it("is the same sheet for a problem, with its own words and the standard icon as the plain choice", () => {
    const html = body({ kind: "problem", initialName: "Charging port" });
    expect(text(html)).toContain("Problem name");
    expect(text(html)).toContain("Add problem");
    expect(html).toContain('maxLength="60"');
    expect(text(html)).toContain("Standard icon");
    expect(html).toContain("charging-port.webp");
  });

  it("edits a box with what it has now, and lets a custom device be removed", () => {
    const html = body({ mode: "edit", initialName: "E-scooter", initialImage: "drone", onRemove: noop });
    expect(text(html)).toContain("Save");
    expect(text(html)).not.toContain("Add device");
    expect(text(html)).toContain("Remove this device");
    expect(html).toContain("drone.webp");
    expect(text(body({ mode: "edit", initialName: "Phone", initialImage: "phone" }))).not.toContain("Remove this device");
  });
});

describe("the picture chooser", () => {
  const html = renderToStaticMarkup(createElement(PictureChooser, { value: "drone", onChoose: noop }));

  it("has a search box, a tab for every group and a grid of pictures", () => {
    expect(html).toContain('type="search"');
    expect(text(html)).toContain("Search pictures");
    for (const group of CATALOG_GROUPS) expect(text(html)).toContain(group.name);
    expect(html).toContain('aria-label="Picture groups"');
  });

  it("opens on the group of the chosen picture and marks it with a tick and the word Selected", () => {
    expect(html).toMatch(/aria-pressed="true"[^>]*>Devices<\/button>/); // drone lives in Devices
    expect(count(html, "Selected")).toBe(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Drone(?:(?!<\/button>)[\s\S])*Selected/);
  });

  it("opens on the first group when nothing is chosen", () => {
    const none = renderToStaticMarkup(createElement(PictureChooser, { value: "", onChoose: noop }));
    expect(none).toMatch(new RegExp(`aria-pressed="true"[^>]*>${CATALOG_GROUPS[0].name}</button>`));
    expect(count(none, "Selected")).toBe(0);
  });
});
