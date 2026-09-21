import { describe, expect, it } from "vitest";

import {
  VOICE_RMS_THRESHOLD,
  VOICE_START_MS,
  VOICE_NO_SPEECH_MS,
  VOICE_SILENCE_MS,
  VOICE_HANGOVER_MS,
  VOICE_SILENT_PEAK,
  createVoiceGate,
  isVoiceSampleAboveThreshold,
  shouldStopForSilence,
} from "@/lib/voice/silence";

describe("voice silence detection", () => {
  it("recognizes useful microphone signal above the noise floor", () => {
    expect(isVoiceSampleAboveThreshold(VOICE_RMS_THRESHOLD)).toBe(true);
    expect(isVoiceSampleAboveThreshold(VOICE_RMS_THRESHOLD - 0.001)).toBe(false);
    expect(VOICE_START_MS).toBeGreaterThan(0);
  });

  it("waits for a full pause after speech before stopping", () => {
    expect(shouldStopForSilence({ recording: true, hasSpoken: true, lastVoiceAt: 1_000, startedAt: 0, now: 1_000 + VOICE_SILENCE_MS - 1 })).toBe(false);
    expect(shouldStopForSilence({ recording: true, hasSpoken: true, lastVoiceAt: 1_000, startedAt: 0, now: 1_000 + VOICE_SILENCE_MS })).toBe(true);
  });

  it("ends an untouched recording after the no-speech grace period", () => {
    expect(shouldStopForSilence({ recording: true, hasSpoken: false, lastVoiceAt: null, startedAt: 1_000, now: 1_000 + VOICE_NO_SPEECH_MS - 1 })).toBe(false);
    expect(shouldStopForSilence({ recording: true, hasSpoken: false, lastVoiceAt: null, startedAt: 1_000, now: 1_000 + VOICE_NO_SPEECH_MS })).toBe(true);
  });

  it("does not stop an inactive recorder", () => {
    expect(shouldStopForSilence({ recording: false, hasSpoken: true, lastVoiceAt: 1_000, startedAt: 0, now: 9_000 })).toBe(false);
  });
});

/** Feeds the gate one reading every 16ms, the way requestAnimationFrame does. */
function run(gate: ReturnType<typeof createVoiceGate>, from: number, ms: number, level: (t: number) => number) {
  for (let t = from; t < from + ms; t += 16) if (gate.push(level(t), t) === "stop") return t;
  return null;
}

describe("the voice gate", () => {
  it("hears ordinary speech, which dips between every syllable", () => {
    const gate = createVoiceGate(0);
    // 120ms loud, 80ms quiet, repeating: no single run reaches VOICE_START_MS.
    run(gate, 0, 1_500, (t) => (t % 200 < 120 ? 0.05 : 0.004));
    expect(gate.hasSpoken).toBe(true);
  });

  it("hears a quiet desktop microphone", () => {
    const gate = createVoiceGate(0);
    run(gate, 0, 1_000, () => 0.025);
    expect(gate.hasSpoken).toBe(true);
  });

  it("is not fooled by a click or a door", () => {
    const gate = createVoiceGate(0);
    run(gate, 0, 100, () => 0.2);
    run(gate, 100, VOICE_HANGOVER_MS + 400, () => 0.002);
    expect(gate.hasSpoken).toBe(false);
  });

  it("stops after the pause that follows speech, and sends it", () => {
    const gate = createVoiceGate(0);
    run(gate, 0, 1_000, () => 0.05);
    const stoppedAt = run(gate, 1_000, 5_000, () => 0.002);
    expect(stoppedAt).not.toBeNull();
    expect(stoppedAt! - 1_000).toBeGreaterThanOrEqual(VOICE_SILENCE_MS - 32);
    expect(gate.worthSending()).toBe(true);
  });

  it("still sends speech too quiet to ever cross the threshold", () => {
    const gate = createVoiceGate(0);
    const stoppedAt = run(gate, 0, VOICE_NO_SPEECH_MS + 100, () => VOICE_RMS_THRESHOLD * 0.7);
    expect(stoppedAt).not.toBeNull();
    expect(gate.hasSpoken).toBe(false);
    expect(gate.worthSending()).toBe(true);
  });

  it("drops only a recording in which the microphone heard nothing", () => {
    const gate = createVoiceGate(0);
    run(gate, 0, VOICE_NO_SPEECH_MS + 100, () => VOICE_SILENT_PEAK / 4);
    expect(gate.worthSending()).toBe(false);
  });
});
