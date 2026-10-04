"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";
import {
  HERO_MOBILE_QUERY,
  HERO_POSTER_MOBILE_SRC,
  HERO_POSTER_SRC,
  HERO_VIDEO_MOBILE_SRC,
  HERO_VIDEO_SRC,
  shouldLoadHeroVideo,
} from "./hero-media";

type Connection = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const connection = () =>
  (navigator as Navigator & { connection?: Connection }).connection;
function subscribe(onChange: () => void) {
  const queries = [
    window.matchMedia(REDUCED_MOTION),
    window.matchMedia(HERO_MOBILE_QUERY),
  ];
  queries.forEach((query) => query.addEventListener("change", onChange));
  const network = connection();
  network?.addEventListener?.("change", onChange);
  return () => {
    queries.forEach((query) => query.removeEventListener("change", onChange));
    network?.removeEventListener?.("change", onChange);
  };
}
const chooseSource = () =>
  shouldLoadHeroVideo({
    reducedMotion: window.matchMedia(REDUCED_MOTION).matches,
    saveData: connection()?.saveData === true,
    effectiveType: connection()?.effectiveType,
  })
    ? window.matchMedia(HERO_MOBILE_QUERY).matches
      ? HERO_VIDEO_MOBILE_SRC
      : HERO_VIDEO_SRC
    : null;
const noSourceYet = () => null;

/** No video source is attached until motion and data preferences have been checked. */
export function HeroVideo() {
  const source = useSyncExternalStore(subscribe, chooseSource, noSourceYet);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = source && failedSource !== source;
  async function togglePlayback() {
    if (!video.current) return;
    if (!video.current.paused) {
      setUserPaused(true);
      video.current.pause();
    } else {
      setUserPaused(false);
      try {
        await video.current.play();
      } catch {
        setPlaying(false);
      }
    }
  }
  return (
    <figure className="site-hero-film site-container">
      <div className="site-film-frame">
        <picture>
          <source media={HERO_MOBILE_QUERY} srcSet={HERO_POSTER_MOBILE_SRC} />
          {/* Native picture gives the poster its own responsive source before hydration. */}
          <img
            src={HERO_POSTER_SRC}
            alt="A technician carefully repairing a smartphone at a workbench"
            width={1600}
            height={900}
            fetchPriority="high"
          />
        </picture>
        <video
          key={source ?? "poster"}
          ref={video}
          src={available ? source : undefined}
          hidden={!available}
          autoPlay={!userPaused}
          loop
          muted
          playsInline
          preload="none"
          disableRemotePlayback
          aria-hidden="true"
          tabIndex={-1}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailedSource(source)}
        />
        {available && (
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={playing ? "Pause repair video" : "Play repair video"}
            className="site-film-control"
          >
            {playing ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            <span>{playing ? "Pause" : "Play"}</span>
          </button>
        )}
      </div>
      <figcaption>
        <span>For the people behind the repairs.</span>
        <a
          href="https://www.pexels.com/video/man-repairing-a-broken-phone-6754828/"
          target="_blank"
          rel="noreferrer"
        >
          Film by Tima Miroshnichenko / Pexels{" "}
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  );
}
