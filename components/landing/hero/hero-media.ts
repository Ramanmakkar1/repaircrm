/** Self-hosted, silent 16-second phone-repair film. Source and license are documented in docs/square-landing-2026-10-04.md. */
export const HERO_VIDEO_ORIGINAL_URL =
  "https://www.pexels.com/video/man-repairing-a-broken-phone-6754828/";
export const HERO_VIDEO_SRC = "/marketing/repair-film/repair-desktop.mp4";
export const HERO_VIDEO_MOBILE_SRC = "/marketing/repair-film/repair-mobile.mp4";
export const HERO_POSTER_SRC = "/marketing/repair-film/repair-poster.webp";
export const HERO_POSTER_MOBILE_SRC =
  "/marketing/repair-film/repair-poster-mobile.webp";
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
export function shouldLoadHeroVideo({
  reducedMotion,
  saveData,
  effectiveType,
}: HeroVideoConditions): boolean {
  if (reducedMotion || saveData) return false;
  return !(effectiveType && TOO_SLOW.has(effectiveType));
}
