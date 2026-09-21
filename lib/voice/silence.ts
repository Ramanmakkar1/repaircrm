export const VOICE_SILENCE_MS = 1_400;
export const VOICE_NO_SPEECH_MS = 8_000;
export const VOICE_START_MS = 280;
export const VOICE_RMS_THRESHOLD = 0.045;

export function isVoiceSampleAboveThreshold(rms: number): boolean {
  return Number.isFinite(rms) && rms >= VOICE_RMS_THRESHOLD;
}

export function shouldStopForSilence(input: {
  recording: boolean;
  hasSpoken: boolean;
  lastVoiceAt: number | null;
  startedAt: number;
  now: number;
}): boolean {
  return (
    input.recording &&
    ((input.hasSpoken &&
      input.lastVoiceAt !== null &&
      input.now - input.lastVoiceAt >= VOICE_SILENCE_MS) ||
      (!input.hasSpoken && input.now - input.startedAt >= VOICE_NO_SPEECH_MS))
  );
}
