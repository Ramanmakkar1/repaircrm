/**
 * Speech-to-text driver.
 *
 * One `fetch` of a Whisper-style `POST /audio/transcriptions`, in the same
 * never-throws style as the text drivers: a missing key, a refused connection
 * and a provider 500 all come back as `{ ok: false, reason }` with a sentence a
 * front-desk person can act on, because the reason lands in a toast.
 *
 * The audio's language is deliberately NOT sent — Whisper auto-detects it, which
 * is what lets one recording mix English, Hindi and Punjabi and still come back
 * transcribed.
 */

import { AI_TIMEOUT_MS, sttTarget } from "./config";

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

function reason(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}

export async function transcribe(
  audio: Blob,
  filename: string,
): Promise<TranscribeResult> {
  const target = sttTarget();
  if (!target) {
    return { ok: false, reason: "Voice transcription isn't set up (set STT_DRIVER)." };
  }
  if (!target.apiKey) {
    return { ok: false, reason: `${target.name} API key is not set` };
  }

  try {
    const form = new FormData();
    form.set("file", audio, filename);
    form.set("model", target.model);
    form.set("response_format", "json");

    const response = await fetch(`${target.baseUrl}/audio/transcriptions`, {
      method: "POST",
      // No content-type header: FormData sets the multipart boundary itself.
      headers: { authorization: `Bearer ${target.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason: reason(`${target.name} returned ${response.status} ${detail}`),
      };
    }

    const payload = (await response.json()) as { text?: unknown };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return { ok: false, reason: "Didn't catch any speech — try again." };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, reason: `${target.name} timed out after ${AI_TIMEOUT_MS / 1000}s` };
    }
    return {
      ok: false,
      reason: reason(
        error instanceof Error
          ? `${target.name}: ${error.message}`
          : `${target.name}: unknown error`,
      ),
    };
  }
}
