import { describe, expect, it } from "vitest";

import { createScanDetector } from "@/components/scan/use-hardware-scanner";

/**
 * The USB scan-gun detector (components/scan/use-hardware-scanner.ts).
 *
 * A gun is a keyboard that types a barcode fast and ends with Enter. The whole
 * safety of the feature is the timing rule: a fast run closed by Enter is a
 * scan, and anything a human could plausibly type is not. That rule is a pure
 * state machine here, so it is tested directly without a browser.
 */

/** Feed a [key, timeStampMs] sequence; return the code emitted on the last key. */
function feed(
  events: [string, number][],
  opts?: { minLength?: number; maxInterKeyMs?: number },
): string | null {
  const detector = createScanDetector(opts);
  let last: string | null = null;
  for (const [key, time] of events) last = detector.feed(key, time);
  return last;
}

/** A gun burst: `text` typed `gapMs` apart, then Enter. */
function burst(text: string, gapMs: number): [string, number][] {
  const events: [string, number][] = text
    .split("")
    .map((char, index) => [char, index * gapMs] as [string, number]);
  events.push(["Enter", text.length * gapMs]);
  return events;
}

describe("createScanDetector", () => {
  it("emits the code when a fast burst ends in Enter", () => {
    expect(feed(burst("IPHO-1000", 8))).toBe("IPHO-1000");
  });

  it("ignores human-paced typing — every slow keystroke restarts the run", () => {
    // 200ms apart is far slower than any gun; the run never grows past one char.
    expect(feed(burst("hello", 200))).toBeNull();
  });

  it("requires a minimum length, so a stray fast Enter isn't a scan", () => {
    expect(feed(burst("ab", 8))).toBeNull(); // 2 chars < default minLength 3
    expect(feed(burst("abc", 8))).toBe("abc");
  });

  it("treats Shift as an uppercase modifier, not a break in the run", () => {
    // What a gun sends for "AB": Shift, A, Shift, B, Enter — all fast.
    const events: [string, number][] = [
      ["Shift", 0],
      ["A", 2],
      ["Shift", 4],
      ["B", 6],
      ["1", 8],
      ["Enter", 10],
    ];
    expect(feed(events)).toBe("AB1");
  });

  it("breaks the run on a non-character key like Tab", () => {
    const events: [string, number][] = [
      ["1", 0],
      ["2", 8],
      ["Tab", 16],
      ["3", 24],
      ["Enter", 32],
    ];
    // The run reset at Tab, leaving just "3" (< minLength).
    expect(feed(events)).toBeNull();
  });

  it("returns null for a bare Enter with nothing buffered", () => {
    expect(feed([["Enter", 0]])).toBeNull();
  });

  it("keeps only the fast tail when a burst has a slow gap in the middle", () => {
    const events: [string, number][] = [
      ["1", 0],
      ["2", 8],
      ["3", 400], // long pause — a new run starts here
      ["4", 408],
      ["5", 416],
      ["Enter", 424],
    ];
    expect(feed(events)).toBe("345");
  });

  it("resets after a scan so the next one is clean", () => {
    const detector = createScanDetector();
    for (const [key, time] of burst("FIRST", 8)) detector.feed(key, time);
    let last: string | null = null;
    for (const [key, time] of burst("SECOND", 8)) last = detector.feed(key, time + 1000);
    expect(last).toBe("SECOND");
  });
});
