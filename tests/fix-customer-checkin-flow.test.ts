import { describe, expect, it } from "vitest";

import {
  CHECKIN_STEPS,
  EMPTY_CHECKIN,
  checkinDescription,
  checkinDeviceLabel,
  checkinDeviceType,
  checkinFields,
  checkinIssues,
  firstOpenStep,
  stepForError,
  type CheckinState,
} from "@/app/checkin/[slug]/flow";

const ALL_FIELDS = { make: true, model: true, serial: true, unlockCode: true };

const filled: CheckinState = {
  ...EMPTY_CHECKIN,
  kindType: "Phone",
  make: "Apple",
  model: "iPhone 14",
  serial: " SN123 ",
  unlockCode: "1234",
  problem: "Screen Repair",
  note: "Dropped it yesterday.",
  name: "Ada Lovelace",
  phone: "(512) 555-0142",
  email: "",
  accepted: true,
  signature: "data:image/png;base64,AAAA",
};

describe("self check-in steps", () => {
  it("is four plain questions, one per screen", () => {
    expect(CHECKIN_STEPS.map((step) => step.label)).toEqual(["Device", "Problem", "You", "Sign"]);
  });

  it("says what each step still needs, in words, instead of greying out the button", () => {
    expect(checkinIssues(0, EMPTY_CHECKIN)).toEqual(["Tap the kind of device you are leaving with us."]);
    expect(checkinIssues(0, { ...EMPTY_CHECKIN, kindType: "Other" })).toEqual(["Tell us what the device is."]);
    expect(checkinIssues(1, { ...filled, problem: "" })).toEqual(["Tap what is wrong, or Other."]);
    expect(checkinIssues(2, { ...filled, name: "A", phone: "", email: "" })).toEqual([
      "Please give us your name.",
      "Give us a mobile number or an email address, so we can tell you when it is ready.",
    ]);
    expect(checkinIssues(2, { ...filled, email: "ada@" })).toEqual(["Check your email address."]);
    expect(checkinIssues(3, { ...filled, accepted: false, signature: "" })).toEqual([
      "Tick the box to accept the terms.",
      "Please sign in the box.",
    ]);
    expect(firstOpenStep(filled)).toBeNull();
    expect(firstOpenStep({ ...filled, name: "" })).toBe(2);
  });

  it("refuses what the action would refuse, before it is sent", () => {
    expect(checkinIssues(0, { ...filled, kindType: "Other", otherText: "x".repeat(61) })).toContain("Keep the device name to 60 letters or fewer.");
    expect(checkinIssues(0, { ...filled, serial: "x".repeat(81) })).toContain("That serial number is too long.");
  });

  it("sends a server message back to the step that can fix it", () => {
    expect(stepForError("Please give us your name.")).toBe(2);
    expect(stepForError("An email address or a phone number is required.")).toBe(2);
    expect(stepForError("What kind of device is it?")).toBe(0);
    expect(stepForError("Tap what is wrong with the device.")).toBe(1);
    expect(stepForError("Tell us a little about what's wrong.")).toBe(1);
    expect(stepForError("Please accept the terms before checking in.")).toBe(3);
    expect(stepForError("We've had a lot of check-ins in the last hour. Please see the front desk.")).toBe(3);
  });
});

describe("what the check-in posts (the action contract is unchanged)", () => {
  it("posts exactly the fields submitCheckinAction reads", () => {
    expect(checkinFields(filled, ALL_FIELDS)).toEqual({
      name: "Ada Lovelace",
      email: "",
      phone: "(512) 555-0142",
      deviceType: "Phone",
      make: "Apple",
      model: "iPhone 14",
      serial: "SN123",
      unlockCode: "1234",
      problemType: "Screen Repair",
      description: "Dropped it yesterday.",
      terms: "on",
      signature: "data:image/png;base64,AAAA",
    });
  });

  it("sends a field the shop switched off as empty, like the old form that never drew it", () => {
    const posted = checkinFields(filled, { make: true, model: true, serial: false, unlockCode: false });
    expect(posted.serial).toBe("");
    expect(posted.unlockCode).toBe("");
  });

  it("saves what the customer typed under Other as the device", () => {
    const other = { ...filled, kindType: "Other", otherText: " E-scooter ", make: "", model: "" };
    expect(checkinDeviceType(other)).toBe("E-scooter");
    expect(checkinFields(other, ALL_FIELDS).deviceType).toBe("E-scooter");
    expect(checkinDeviceLabel(other, "Other")).toBe("E-scooter");
    expect(checkinDeviceLabel({ ...filled, make: "", model: "" }, "Phone")).toBe("Phone");
  });

  it("never posts a blank description: an empty note says which box was tapped, and always passes the 5-letter minimum", () => {
    const description = checkinDescription({ note: "   ", problem: "Other" });
    expect(description).toBe("Picked “Other” on the check-in screen. No extra note.");
    expect(description.length).toBeGreaterThanOrEqual(5);
    expect(checkinDescription({ note: " It won't charge ", problem: "Battery" })).toBe("It won't charge");
  });

  it("posts terms only when the box is ticked", () => {
    expect(checkinFields({ ...filled, accepted: false }, ALL_FIELDS).terms).toBe("");
  });
});
