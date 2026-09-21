export const VOICE_SILENCE_MS = 1_400;
export const VOICE_NO_SPEECH_MS = 8_000;
export const VOICE_START_MS = 280;
/**
 * Speech through a desktop microphone at arm's length peaks around 0.02-0.06
 * RMS and sags well below that between syllables. The old 0.045 sat above what
 * an iMac's built-in mic ever reached, so every recording there was judged
 * "nobody spoke" and thrown away without a word.
 */
export const VOICE_RMS_THRESHOLD = 0.02;
/** A dip shorter than this is the gap between syllables, not the end of a word. */
export const VOICE_HANGOVER_MS = 250;
/** Below this at its LOUDEST, a recording is a muted or dead microphone. */
export const VOICE_SILENT_PEAK = 0.008;

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

export type VoiceGate = {
  /** Feed one level reading. "stop" means: end the recording now. */
  push(rms: number, now: number): "continue" | "stop";
  /**
   * Whether the finished recording is worth sending. Only a recording in which
   * the microphone heard nothing at all is dropped — the gate decides WHEN to
   * stop, never whether someone's words get transcribed. Quiet speech that
   * never crossed the threshold still goes to the transcriber, which is far
   * better at telling speech from room noise than a level meter is.
   */
  worthSending(): boolean;
  readonly hasSpoken: boolean;
};

export function createVoiceGate(startedAt: number): VoiceGate {
  let hasSpoken = false;
  let lastVoiceAt: number | null = null;
  let voicedSince: number | null = null;
  let lastAboveAt: number | null = null;
  let peak = 0;

  return {
    get hasSpoken() {
      return hasSpoken;
    },
    push(rms, now) {
      if (Number.isFinite(rms) && rms > peak) peak = rms;

      if (isVoiceSampleAboveThreshold(rms)) {
        voicedSince ??= now;
        lastAboveAt = now;
        if (now - voicedSince >= VOICE_START_MS) {
          hasSpoken = true;
          lastVoiceAt = now;
        }
        return "continue";
      }

      // One quiet frame used to reset the run, and speech is full of them, so
      // 280ms of UNBROKEN loudness almost never happened. A run now survives
      // any dip shorter than the hangover.
      if (lastAboveAt !== null && now - lastAboveAt >= VOICE_HANGOVER_MS) voicedSince = null;

      return shouldStopForSilence({ recording: true, hasSpoken, lastVoiceAt, startedAt, now })
        ? "stop"
        : "continue";
    },
    worthSending() {
      return hasSpoken || peak >= VOICE_SILENT_PEAK;
    },
  };
}
