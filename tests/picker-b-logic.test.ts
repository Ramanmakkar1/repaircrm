import { describe, expect, it } from "vitest";

import {
  ALL_PICTURES,
  changeButtonLabel,
  groupOfKey,
  picturePage,
  pictureSuggestions,
  resolvePicture,
  validPictureKey,
} from "@/components/inventory/picture-picker-logic";
import { CATALOG } from "@/lib/catalog/entries";
import { CATALOG_GROUPS } from "@/lib/catalog/match";

/**
 * The product picture picker's thinking: which picture is on show and what the sentence under it says,
 * the "Is it one of these?" row, and what the "Change picture" window lists. Pure logic, no React.
 */

describe("resolvePicture: found from the name", () => {
  it("'glass guard' finds the screen protector", () => {
    const choice = resolvePicture({ name: "glass guard" });
    expect(choice.source).toBe("found");
    expect(choice.entry?.key).toBe("screen-protector");
    expect(choice.sentence).toBe("Picture: Screen protector (found from the name)");
    expect(choice.chosenKey).toBe("");
    expect(changeButtonLabel(choice)).toBe("Change picture");
  });

  it("a typo or slang name still finds something sensible", () => {
    expect(resolvePicture({ name: "chrager" }).entry?.key).toBe("charger");
    expect(resolvePicture({ name: "back cover" }).source).toBe("found");
    expect(resolvePicture({ name: "pen drive" }).source).toBe("found");
  });

  it("an unknown name has no picture, says so, and offers the picker", () => {
    const choice = resolvePicture({ name: "xyzqq" });
    expect(choice.source).toBe("none");
    expect(choice.entry).toBeNull();
    expect(choice.sentence).toBe("No picture matched yet. Pick one below.");
    expect(choice.short).toBe("No picture matched yet.");
    expect(changeButtonLabel(choice)).toBe("Pick a picture");
    expect(pictureSuggestions({ name: "xyzqq" })).toEqual([]);
  });

  it("an empty name asks for a name and offers no suggestions", () => {
    const choice = resolvePicture({ name: "   " });
    expect(choice.source).toBe("none");
    expect(choice.sentence).toMatch(/^Type the item name/);
    expect(pictureSuggestions({ name: "   " })).toEqual([]);
    expect(pictureSuggestions({ name: "g" })).toEqual([]);
  });
});

describe("resolvePicture: chosen, automatic, photo", () => {
  it("a picture chosen on purpose beats the one found from the name", () => {
    const choice = resolvePicture({ name: "glass guard", value: "car-charger" });
    expect(choice.source).toBe("chosen");
    expect(choice.entry?.key).toBe("car-charger");
    expect(choice.chosenKey).toBe("car-charger");
    expect(choice.sentence).toBe("Picture: Car charger (chosen by you)");
  });

  it("a chosen picture is kept even when the name matches nothing", () => {
    const choice = resolvePicture({ name: "xyzqq", value: "hdmi-cable" });
    expect(choice.source).toBe("chosen");
    expect(choice.entry?.label).toBe("HDMI cable");
  });

  it("a key that is not a picture counts as automatic (and posts the empty string)", () => {
    expect(validPictureKey("not-a-picture")).toBe("");
    expect(validPictureKey("  car-charger ")).toBe("car-charger");
    const choice = resolvePicture({ name: "glass guard", value: "not-a-picture" });
    expect(choice.source).toBe("found");
    expect(choice.chosenKey).toBe("");
  });

  it("'Use automatic' (an empty value) goes back to the picture found from the name", () => {
    const chosen = resolvePicture({ name: "glass guard", value: "car-charger" });
    const automatic = resolvePicture({ name: "glass guard", value: "" });
    expect(chosen.chosenKey).toBe("car-charger");
    expect(automatic.chosenKey).toBe("");
    expect(automatic.entry?.key).toBe("screen-protector");
    expect(automatic.source).toBe("found");
  });

  it("an uploaded photo always wins, and says what is used without it", () => {
    const found = resolvePicture({ name: "glass guard", uploadedPhotoUrl: "/files/abc123" });
    expect(found.source).toBe("uploaded");
    expect(found.photoUrl).toBe("/files/abc123");
    expect(found.sentence).toBe("Your own photo is used");
    expect(found.fallbackSentence).toBe("Picture if there is no photo: Screen protector (found from the name)");
    expect(found.entry?.key).toBe("screen-protector");

    // The picture chosen on purpose is still kept (and still posted) under the photo.
    const chosen = resolvePicture({ name: "glass guard", value: "car-charger", uploadedPhotoUrl: "/files/abc123" });
    expect(chosen.source).toBe("uploaded");
    expect(chosen.chosenKey).toBe("car-charger");
    expect(chosen.fallbackSentence).toBe("Picture if there is no photo: Car charger (chosen by you)");

    const none = resolvePicture({ name: "xyzqq", uploadedPhotoUrl: "blob:http://localhost/1" });
    expect(none.source).toBe("uploaded");
    expect(none.fallbackSentence).toBe("Picture if there is no photo: none matched yet");
  });

  it("a blank photo url is not a photo", () => {
    expect(resolvePicture({ name: "glass guard", uploadedPhotoUrl: "  " }).source).toBe("found");
    expect(resolvePicture({ name: "glass guard", uploadedPhotoUrl: null }).fallbackSentence).toBeNull();
  });
});

describe("pictureSuggestions", () => {
  it("never repeats the picture on show, never repeats itself, and stops at four", () => {
    for (const name of ["hdmi", "speaker", "screen", "cable", "battery", "ps5 controller", "glass"]) {
      const shown = resolvePicture({ name }).entry?.key ?? null;
      const list = pictureSuggestions({ name });
      expect(list.length).toBeLessThanOrEqual(4);
      expect(new Set(list.map((entry) => entry.key)).size).toBe(list.length);
      expect(list.map((entry) => entry.key)).not.toContain(shown);
    }
  });

  it("offers real alternatives for a name that matched nothing exactly", () => {
    expect(resolvePicture({ name: "hdmi" }).source).toBe("none");
    const labels = pictureSuggestions({ name: "hdmi" }).map((entry) => entry.label);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => /hdmi/i.test(label))).toBe(true);
  });

  it("offers the other guesses for an ambiguous name", () => {
    const shown = resolvePicture({ name: "speaker" }).entry;
    const labels = pictureSuggestions({ name: "speaker" }).map((entry) => entry.label);
    expect(labels.length).toBeGreaterThan(0);
    if (shown) expect(labels).not.toContain(shown.label);
  });

  it("offers the picture found from the name once another one was chosen, so one tap undoes the choice", () => {
    const labels = pictureSuggestions({ name: "glass guard", value: "car-charger" }).map((entry) => entry.label);
    expect(labels).toContain("Screen protector");
    expect(labels).not.toContain("Car charger");
  });

  it("respects a smaller limit", () => {
    expect(pictureSuggestions({ name: "cable" }, 2)).toHaveLength(2);
    expect(pictureSuggestions({ name: "cable" }, 0)).toEqual([]);
  });
});

describe("picturePage: the Change picture window", () => {
  it("without a search it lists every picture, group by group, with the group counts as tabs", () => {
    const page = picturePage("", ALL_PICTURES);
    expect(page.searching).toBe(false);
    expect(page.group).toBe(ALL_PICTURES);
    expect(page.entries).toHaveLength(CATALOG.length);
    expect(page.tabs[0]).toEqual({ name: ALL_PICTURES, count: CATALOG.length });
    expect(page.tabs.slice(1)).toEqual(CATALOG_GROUPS.map((group) => ({ name: group.name, count: group.count })));
    // Group by group: the tabs' order is the entries' order.
    const order = CATALOG_GROUPS.map((group) => group.name);
    const seen = page.entries.map((entry) => order.indexOf(entry.group));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it("a group tab shows only that group's pictures", () => {
    const group = CATALOG_GROUPS[1].name;
    const page = picturePage("", group);
    expect(page.group).toBe(group);
    expect(page.entries.length).toBe(CATALOG_GROUPS[1].count);
    expect(page.entries.every((entry) => entry.group === group)).toBe(true);
  });

  it("an unknown tab falls back to all", () => {
    expect(picturePage("", "No such group").group).toBe(ALL_PICTURES);
  });

  it("a search finds the picture, counts the hits per group, and drops groups with none", () => {
    const page = picturePage("charger", ALL_PICTURES);
    expect(page.searching).toBe(true);
    expect(page.entries.map((entry) => entry.key)).toContain("charger");
    expect(page.tabs[0].count).toBe(page.entries.length);
    const power = page.tabs.find((tab) => tab.name === "Chargers, cables & power");
    expect(power?.count).toBeGreaterThan(3);
    expect(page.tabs.find((tab) => tab.name === "Drones")).toBeUndefined();
    expect(page.tabs.slice(1).reduce((sum, tab) => sum + tab.count, 0)).toBe(page.entries.length);
  });

  it("a tab narrows a search; a tab with no hits falls back to all", () => {
    const narrowed = picturePage("charger", "Chargers, cables & power");
    expect(narrowed.group).toBe("Chargers, cables & power");
    expect(narrowed.entries.every((entry) => entry.group === "Chargers, cables & power")).toBe(true);
    expect(picturePage("charger", "Drones").group).toBe(ALL_PICTURES);
  });

  it("a search with no hits is empty (the window says so)", () => {
    const page = picturePage("xyzqq", ALL_PICTURES);
    expect(page.entries).toEqual([]);
    expect(page.tabs).toEqual([{ name: ALL_PICTURES, count: 0 }]);
  });

  it("the window opens on the group of the picture in use", () => {
    expect(groupOfKey("car-charger")).toBe("Chargers, cables & power");
    expect(groupOfKey("")).toBe(ALL_PICTURES);
    expect(groupOfKey("nope")).toBe(ALL_PICTURES);
    expect(groupOfKey(null)).toBe(ALL_PICTURES);
  });
});
