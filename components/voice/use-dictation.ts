"use client";

import * as React from "react";

import { transcribeAudioAction } from "@/app/(app)/voice/actions";
import { isVoiceSampleAboveThreshold, shouldStopForSilence } from "@/lib/voice/silence";

/**
 * Browser dictation with two engines behind one interface.
 *
 *   cloud = false  the browser's own speech recognition — free, no key, strong
 *                  for English in Chrome/Edge, weak/absent elsewhere.
 *   cloud = true   record a few seconds and send it to the Whisper-style
 *                  provider (see app/(app)/voice/actions.ts). Auto-detects the
 *                  language, so spoken Hindi/Hinglish/Punjabi works — and it runs
 *                  on iPhone, which has no browser speech engine at all.
 *
 * The caller passes `cloud` from the server's `sttEnabled()`; either way it gets
 * the same `{ supported, state, start, stop }`, and where nothing is supported
 * the mic simply hides and the text box carries on (typed input already
 * understands every language).
 */

type SpeechAlternative = { transcript: string };
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechAlternative>>;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function hasMediaRecorder(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Support never changes at runtime, so there's nothing to notify. */
const subscribe = () => () => {};

const MIC_BLOCKED = "Microphone blocked — allow mic access to use voice.";

export type DictationState = "idle" | "listening" | "transcribing";
export type Dictation = {
  supported: boolean;
  state: DictationState;
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

export function useDictation(
  onText: (transcript: string) => void,
  onError?: (message: string) => void,
  options?: { cloud?: boolean },
): Dictation {
  const cloud = options?.cloud ?? false;

  // Client-only capability with an SSR snapshot of false — no hydration mismatch.
  const supported = React.useSyncExternalStore(
    subscribe,
    () => (cloud ? hasMediaRecorder() : getRecognitionCtor() !== null),
    () => false,
  );

  const [state, setState] = React.useState<DictationState>("idle");

  const onTextRef = React.useRef(onText);
  const onErrorRef = React.useRef(onError);
  React.useEffect(() => {
    onTextRef.current = onText;
    onErrorRef.current = onError;
  }, [onText, onError]);

  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const generation = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const audioSourceRef = React.useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceFrameRef = React.useRef<number | null>(null);
  const discardCaptureRef = React.useRef(false);

  const stopSilenceMonitor = React.useCallback(() => {
    if (silenceFrameRef.current !== null) {
      cancelAnimationFrame(silenceFrameRef.current);
      silenceFrameRef.current = null;
    }
    audioSourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioSourceRef.current = null;
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, []);

  const cancel = React.useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    stopSilenceMonitor();
    const recognition = recognitionRef.current;
    if (recognition) { recognition.onresult = null; recognition.onend = null; recognition.onerror = null; recognition.abort(); }
    const recorder = recorderRef.current;
    if (recorder) { recorder.onstop = null; if (recorder.state !== "inactive") recorder.stop(); }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    discardCaptureRef.current = false;
    recognitionRef.current = null;
    setState("idle");
  }, [stopSilenceMonitor]);

  React.useEffect(
    () => cancel,
    [cancel],
  );

  const fail = React.useCallback((message: string) => {
    setState("idle");
    onErrorRef.current?.(message);
  }, []);

  const startBrowser = React.useCallback(() => {
    const Recognition = getRecognitionCtor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) onTextRef.current(transcript);
    };
    recognition.onerror = (event) => {
      if (event?.error === "no-speech") {
        setState("idle");
        return;
      }
      fail(
        event?.error === "not-allowed" || event?.error === "service-not-allowed"
          ? MIC_BLOCKED
          : "Voice input didn't work — you can type it instead.",
      );
    };
    recognition.onend = () => setState((current) => (current === "listening" ? "idle" : current));

    recognitionRef.current = recognition;
    setState("listening");
    try {
      recognition.start();
    } catch {
      setState("idle");
    }
  }, [fail]);

  const startCloud = React.useCallback(async () => {
    const capture = ++generation.current;
    setState("listening");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (capture === generation.current) fail(MIC_BLOCKED);
      return;
    }
    if (capture !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }

    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream); }
    catch { stream.getTracks().forEach(track => track.stop()); fail("Recording is unavailable. Please type your request."); return; }
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (timer.current) clearTimeout(timer.current);
      stopSilenceMonitor();
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (capture !== generation.current) return;
      if (discardCaptureRef.current) {
        discardCaptureRef.current = false;
        setState("idle");
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) {
        setState("idle");
        return;
      }

      setState("transcribing");
      const form = new FormData();
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.set("audio", blob, `command.${extension}`);
      transcribeAudioAction(form)
        .then((result) => {
          if (capture !== generation.current) return;
          setState("idle");
          if (result.ok) onTextRef.current(result.text);
          else if (!result.reason.toLowerCase().includes("didn't catch any speech")) onErrorRef.current?.(result.reason);
        })
        .catch(() => { if (capture === generation.current) fail("Couldn't transcribe that — try again."); });
    };

    recorderRef.current = recorder;
    streamRef.current = stream;
    discardCaptureRef.current = false;
    setState("listening");
    try {
      recorder.start();
      const AudioContextCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        try {
          const context = new AudioContextCtor();
          const analyser = context.createAnalyser();
          const source = context.createMediaStreamSource(stream);
          analyser.fftSize = 512;
          source.connect(analyser);
          audioContextRef.current = context;
          analyserRef.current = analyser;
          audioSourceRef.current = source;
          void context.resume().catch(() => undefined);

          const samples = new Uint8Array(analyser.fftSize);
          const startedAt = Date.now();
          let hasSpoken = false;
          let lastVoiceAt: number | null = null;
          const inspectAudio = () => {
            if (recorder.state !== "recording") {
              stopSilenceMonitor();
              return;
            }
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) {
              const normalized = (sample - 128) / 128;
              sum += normalized * normalized;
            }
            const rms = Math.sqrt(sum / samples.length);
            const now = Date.now();
            if (isVoiceSampleAboveThreshold(rms)) {
              hasSpoken = true;
              lastVoiceAt = now;
            } else if (shouldStopForSilence({ recording: true, hasSpoken, lastVoiceAt, startedAt, now })) {
              discardCaptureRef.current = !hasSpoken;
              recorder.stop();
              stopSilenceMonitor();
              return;
            }
            silenceFrameRef.current = requestAnimationFrame(inspectAudio);
          };
          silenceFrameRef.current = requestAnimationFrame(inspectAudio);
        } catch {
          stopSilenceMonitor();
        }
      }
      timer.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 60_000);
    } catch { stopSilenceMonitor(); stream.getTracks().forEach(track => track.stop()); fail("Recording didn't start. Please type your request."); }
  }, [fail, stopSilenceMonitor]);

  const start = React.useCallback(() => {
    if (state !== "idle") return;
    if (cloud) void startCloud();
    else startBrowser();
  }, [cloud, startBrowser, startCloud, state]);

  const stop = React.useCallback(() => {
    if (cloud) { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); else { generation.current += 1; setState("idle"); } }
    else recognitionRef.current?.stop();
  }, [cloud]);

  return { supported, state, start, stop, cancel };
}
