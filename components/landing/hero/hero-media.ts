/**
 * The hero's background media, as plain data so server components, the client
 * video and the tests can all read it.
 *
 * The clip is the owner's own (original link below: 33 MB, 3328x2492, 12 s).
 * It is hosted on this server in two web encodes of the same footage, no audio,
 * H.264, faststart: public/marketing/hero/hero.mp4 (1920 wide, about 3.4 MB)
 * and hero-mobile.mp4 (1080 wide, under 1 MB, picked on phones), plus the first
 * frame of the clip as the poster picture. The page therefore needs no third
 * party and shows the real sky at once, before the video has started.
 */
export const HERO_VIDEO_ORIGINAL_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260424_064411_9e9d7f84-9277-41f4-ab10-59172d89e6be.mp4";
export const HERO_VIDEO_SRC = "/marketing/hero/hero.mp4";
export const HERO_VIDEO_MOBILE_SRC = "/marketing/hero/hero-mobile.mp4";
export const HERO_POSTER_SRC = "/marketing/hero/hero-poster.webp";
export const HERO_POSTER_MOBILE_SRC = "/marketing/hero/hero-poster-mobile.webp";
/** Phones (and narrow windows) get the smaller video and poster. */
export const HERO_MOBILE_QUERY = "(max-width: 767px)";

export type HeroVideoConditions = {
  /** (prefers-reduced-motion: reduce) matches. */
  reducedMotion: boolean;
  /** The visitor turned on the browser's data saver (navigator.connection.saveData). */
  saveData: boolean;
  /** navigator.connection.effectiveType, where the browser reports it. */
  effectiveType?: string;
};

// Too slow to stream a few MB of video: the poster picture is the better experience meanwhile.
const TOO_SLOW = new Set(["slow-2g", "2g", "3g"]);

/**
 * Whether to request the hero video at all. `display: none` does not stop a
 * browser buffering a video, so visitors who asked for less motion or less data
 * must never get a `src`; they keep the poster image and download nothing.
 */
export function shouldLoadHeroVideo({ reducedMotion, saveData, effectiveType }: HeroVideoConditions): boolean {
  if (reducedMotion || saveData) return false;
  return !(effectiveType && TOO_SLOW.has(effectiveType));
}
