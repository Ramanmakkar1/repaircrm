export type SpeechResults = ArrayLike<ArrayLike<{ transcript: string }>>;

/** Results include the whole utterance; interim words replace earlier guesses. */
export function speechTranscript(results: SpeechResults): string {
  return Array.from(results, (result) => result[0]?.transcript?.trim() ?? "")
    .filter(Boolean).join(" ").trim().slice(0, 1500);
}
