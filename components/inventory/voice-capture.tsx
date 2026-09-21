"use client";

import * as React from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { useDictation } from "@/components/voice/use-dictation";
import {
  parseProductVoiceAction,
  type VoiceProductFields,
} from "@/app/(app)/inventory/voice-actions";

/**
 * The "Speak" control inside Quick Add.
 *
 * Captures speech, has the server turn it into product fields, and calls
 * `onFill` — it never saves anything; the human still reviews and presses Add.
 *
 * Voice capture is the shared `useDictation` hook: the browser's own engine when
 * cloud transcription isn't set up (`cloud=false`), or record-and-Whisper when
 * it is (`cloud=true`), which is what makes spoken Hindi/Hinglish/Punjabi — and
 * the iPhone, with no browser engine — work. Either way the transcript flows
 * through the same `parseProductVoiceAction`.
 */
export function VoiceCapture({
  onFill,
  cloud = false,
}: {
  onFill: (fields: VoiceProductFields) => void;
  /** Use cloud transcription (Whisper) instead of the browser's own engine. */
  cloud?: boolean;
}) {
  const [parsing, setParsing] = React.useState(false);

  const dictation = useDictation(
    (transcript) => {
      setParsing(true);
      parseProductVoiceAction(transcript)
        .then((result) => {
          if (result.ok) {
            onFill(result.fields);
            toast.success(`Heard: “${transcript}”`);
          } else {
            toast.error(result.reason);
          }
        })
        .catch(() => toast.error("Couldn't read that — try again."))
        .finally(() => setParsing(false));
    },
    (message) => toast.error(message),
    { cloud },
  );

  if (!dictation.supported) return null;

  const busy = parsing || dictation.state === "transcribing";
  const listening = dictation.state === "listening";

  return (
    <Button
      type="button"
      variant="soft"
      size="sm"
      aria-pressed={listening}
      aria-busy={busy}
      disabled={busy}
      onClick={listening ? dictation.stop : dictation.start}
      className={cn("shrink-0 gap-1.5", listening && "ring-2 ring-inset ring-accent/50")}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : listening ? (
        <Square className="size-4" aria-hidden />
      ) : (
        <Mic className="size-4" aria-hidden />
      )}
      {busy ? "Reading…" : listening ? "Listening…" : "Speak"}
    </Button>
  );
}
