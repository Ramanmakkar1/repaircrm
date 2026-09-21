import { describe, expect, it } from "vitest";

import {
  VOICE_RMS_THRESHOLD,
  VOICE_NO_SPEECH_MS,
  VOICE_SILENCE_MS,
  isVoiceSampleAboveThreshold,
  shouldStopForSilence,
} from "@/lib/voice/silence";

describe("voice silence detection", () => {
  it("recognizes useful microphone signal above the noise floor", () => {
    expect(isVoiceSampleAboveThreshold(VOICE_RMS_THRESHOLD)).toBe(true);
    expect(isVoiceSampleAboveThreshold(VOICE_RMS_THRESHOLD - 0.001)).toBe(false);
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
