export const VOICE_SILENCE_MS = 1_400;
export const VOICE_RMS_THRESHOLD = 0.025;

export function isVoiceSampleAboveThreshold(rms: number): boolean {
  return Number.isFinite(rms) && rms >= VOICE_RMS_THRESHOLD;
}

export function shouldStopForSilence(input: {
  recording: boolean;
  hasSpoken: boolean;
  lastVoiceAt: number | null;
  now: number;
}): boolean {
  return (
    input.recording &&
    input.hasSpoken &&
    input.lastVoiceAt !== null &&
    input.now - input.lastVoiceAt >= VOICE_SILENCE_MS
  );
}
