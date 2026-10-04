/**
 * The self check-in desk, as plain data and plain functions.
 *
 * Everything the screen decides lives here so it can be tested without a
 * browser: the four steps, what each one still needs (in words), the chips at
 * the top, and exactly which fields are posted to submitCheckinAction. The
 * component only draws this.
 *
 * Pure on purpose: no React, no next/*, no database.
 *
 * THE CONTRACT IS UNCHANGED. The action still receives name, email, phone,
 * deviceType, make, model, serial, unlockCode, problemType, description, terms
 * and signature, and still validates every one of them. The only new thing on
 * this side: the note is optional for the customer, so when they leave it
 * empty the description says which box they tapped (it is never blank).
 */

import { INTAKE_OTHER_TYPE } from "@/lib/device-intake";
import type { CheckinFieldKey } from "@/components/settings/checkin-meta";

export const CHECKIN_STEPS = [
  { label: "Device", title: "What are you leaving with us?", hint: "Tap the kind of device." },
  { label: "Problem", title: "What is wrong with it?", hint: "Tap the closest match." },
  { label: "You", title: "Who are you?", hint: "So we can tell you when it is ready. We only use these for this repair." },
  { label: "Sign", title: "Sign and you are done", hint: "Read the shop's terms, tick the box and sign with your finger." },
] as const;
export const LAST_CHECKIN_STEP = CHECKIN_STEPS.length - 1;

export type CheckinState = {
  /** The device kind's saved type ("Phone", "Game console"), "" until tapped. */
  kindType: string;
  /** What the person typed when they picked Other. */
  otherText: string;
  make: string;
  model: string;
  serial: string;
  unlockCode: string;
  problem: string;
  note: string;
  name: string;
  phone: string;
  email: string;
  accepted: boolean;
  /** PNG data URL from the pad, "" until signed. */
  signature: string;
};

export const EMPTY_CHECKIN: CheckinState = {
  kindType: "",
  otherText: "",
  make: "",
  model: "",
  serial: "",
  unlockCode: "",
  problem: "",
  note: "",
  name: "",
  phone: "",
  email: "",
  accepted: false,
  signature: "",
};

/** Same limits the action enforces, so the screen refuses first and in plain words. */
const MAX = { deviceType: 60, make: 60, model: 60, serial: 80, unlockCode: 60, problem: 60, note: 4000, name: 120, phone: 40, email: 160 };

export function isOtherKind(state: Pick<CheckinState, "kindType">): boolean {
  return state.kindType === INTAKE_OTHER_TYPE;
}

/** What the device is saved as: the kind, or what they typed under Other. */
export function checkinDeviceType(state: Pick<CheckinState, "kindType" | "otherText">): string {
  return isOtherKind(state) ? state.otherText.trim() : state.kindType.trim();
}

/** "Apple iPhone 14" when they said, else the kind's name ("Phone"). */
export function checkinDeviceLabel(state: CheckinState, kindLabel: string): string {
  const named = [state.make, state.model].map((part) => part.trim()).filter(Boolean).join(" ");
  return named || (isOtherKind(state) ? state.otherText.trim() : kindLabel);
}

/** The description the shop reads: the customer's note, or which box they tapped. */
export function checkinDescription(state: Pick<CheckinState, "note" | "problem">): string {
  const note = state.note.trim();
  return note || `Picked “${state.problem.trim()}” on the check-in screen. No extra note.`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What a step still needs, in words. Empty: the step is done. */
export function checkinIssues(step: number, state: CheckinState): string[] {
  const out: string[] = [];
  if (step === 0) {
    if (!state.kindType) out.push("Tap the kind of device you are leaving with us.");
    else if (isOtherKind(state) && !state.otherText.trim()) out.push("Tell us what the device is.");
    if (checkinDeviceType(state).length > MAX.deviceType) out.push(`Keep the device name to ${MAX.deviceType} letters or fewer.`);
    if (state.make.trim().length > MAX.make || state.model.trim().length > MAX.model) out.push("Keep the brand and model short.");
    if (state.serial.trim().length > MAX.serial) out.push("That serial number is too long.");
    if (state.unlockCode.trim().length > MAX.unlockCode) out.push("That passcode is too long.");
  }
  if (step === 1) {
    if (!state.problem) out.push("Tap what is wrong, or Other.");
    if (state.note.trim().length > MAX.note) out.push("That note is too long. Please shorten it.");
  }
  if (step === 2) {
    if (state.name.trim().length < 2) out.push("Please give us your name.");
    const email = state.email.trim();
    if (!email && !state.phone.trim()) out.push("Give us a mobile number or an email address, so we can tell you when it is ready.");
    if (email && !EMAIL.test(email)) out.push("Check your email address.");
    if (state.name.trim().length > MAX.name || email.length > MAX.email || state.phone.trim().length > MAX.phone) {
      out.push("One of those is too long.");
    }
  }
  if (step === 3) {
    if (!state.accepted) out.push("Tick the box to accept the terms.");
    if (!state.signature) out.push("Please sign in the box.");
  }
  return out;
}

/** The first step that still needs something, or null when it can be sent. */
export function firstOpenStep(state: CheckinState): number | null {
  for (let step = 0; step < CHECKIN_STEPS.length; step++) {
    if (checkinIssues(step, state).length > 0) return step;
  }
  return null;
}

/** Which step a message from the server is about, so the person lands where they can fix it. */
export function stepForError(message: string): number {
  const text = message.toLowerCase();
  if (/name|email|phone|mobile/.test(text)) return 2;
  if (/job|wrong|problem/.test(text)) return 1;
  if (/device/.test(text)) return 0;
  return LAST_CHECKIN_STEP;
}

/**
 * Exactly what the form posts. Fields the shop switched off are sent empty,
 * the same as the old form (which did not render them at all).
 */
export function checkinFields(state: CheckinState, fields: Record<CheckinFieldKey, boolean>): Record<string, string> {
  return {
    name: state.name.trim(),
    email: state.email.trim(),
    phone: state.phone.trim(),
    deviceType: checkinDeviceType(state),
    make: fields.make ? state.make.trim() : "",
    model: fields.model ? state.model.trim() : "",
    serial: fields.serial ? state.serial.trim() : "",
    unlockCode: fields.unlockCode ? state.unlockCode.trim() : "",
    problemType: state.problem.trim(),
    description: checkinDescription(state),
    terms: state.accepted ? "on" : "",
    signature: state.signature,
  };
}
