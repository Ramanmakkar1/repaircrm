"use server";

/**
 * Voice transcription for the mic controls.
 *
 * The browser records a few seconds of audio and posts it here; this forwards it
 * to the configured Whisper-style provider and hands back the text. It is the
 * cloud half of the mic, used where spoken Hindi/Hinglish/Punjabi needs more
 * than the browser's own engine (and on iPhone, which has no browser engine at
 * all). The transcript then flows into the same review step as typed input — the
 * Quick Add fields or the assistant command bar.
 *
 * Nothing is stored: the audio is transcribed and dropped. The session is
 * re-read first, so only a signed-in shop user can spend the transcription key.
 */

import { requireUser } from "@/lib/auth";
import { transcribe, type TranscribeResult } from "@/lib/ai/transcribe";

export type { TranscribeResult };

/** A spoken command is a few seconds — cap the upload so it can't be abused. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function transcribeAudioAction(
  formData: FormData,
): Promise<TranscribeResult> {
  await requireUser();

  const audio = formData.get("audio");
  if (!(audio instanceof Blob)) return { ok: false, reason: "No audio received." };
  if (audio.size === 0) return { ok: false, reason: "The recording was empty." };
  if (audio.size > MAX_AUDIO_BYTES) {
    return { ok: false, reason: "That recording is too long — keep it short." };
  }

  const filename =
    audio instanceof File && audio.name ? audio.name : "command.webm";
  return transcribe(audio, filename);
}
