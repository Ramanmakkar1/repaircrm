"use client";

import { useSyncExternalStore } from "react";

import { HERO_MOBILE_QUERY, HERO_VIDEO_MOBILE_SRC, HERO_VIDEO_SRC, shouldLoadHeroVideo } from "./hero-media";

type Connection = { saveData?: boolean; effectiveType?: string };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// Not in TypeScript's DOM types: a Chromium API, so every read is optional.
const connection = (): Connection | undefined => (navigator as Navigator & { connection?: Connection }).connection;

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The file this visitor should stream, or null when they should keep the poster picture only. */
const chooseSource = (): string | null =>
  shouldLoadHeroVideo({
    reducedMotion: window.matchMedia(REDUCED_MOTION).matches,
    saveData: connection()?.saveData === true,
    effectiveType: connection()?.effectiveType,
  })
    ? window.matchMedia(HERO_MOBILE_QUERY).matches
      ? HERO_VIDEO_MOBILE_SRC
      : HERO_VIDEO_SRC
    : null;

// On the server, and for the first client render, there is no src: nothing can start downloading
// before this component has checked the visitor's motion and data settings.
const noSourceYet = (): string | null => null;

// Attributes some mobile in-app browsers still look for. Spread so React passes them through untouched.
const legacyInlinePlayback = { "webkit-playsinline": "true", "x5-playsinline": "true" } as Record<string, string>;

/**
 * The owner's looping muted background video, with all of their playback
 * attributes. The file is attached after hydration, and only for visitors who
 * have not asked for reduced motion, turned on data saver or are on a 2G/3G
 * connection; phones get the smaller encode. Everyone else keeps the poster
 * picture (the first frame of the same clip, see .site-hero in site.css), so the
 * hero never looks empty and never jumps when the video starts.
 */
export function HeroVideo() {
  const source = useSyncExternalStore(subscribe, chooseSource, noSourceYet);

  return (
    <video
      className="site-hero-video pointer-events-none absolute inset-0 h-full w-full object-cover"
      src={source ?? undefined}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disableRemotePlayback
      aria-hidden="true"
      tabIndex={-1}
      {...legacyInlinePlayback}
    />
  );
}
