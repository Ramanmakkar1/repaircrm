import Link from "next/link";
import { preload } from "react-dom";
import { ArrowRight, Check } from "lucide-react";

import { SHOTS } from "../media";
import { SIGN_UP_HREF } from "./navbar";

/** Phones get the phone capture; a 2048px tablet capture shrunk to 350px is unreadable. */
export const HERO_PHONE_QUERY = "(max-width: 639px)";

/**
 * The hero leads with the product itself: the real Home screen on a counter
 * tablet, with a repair job open on a phone beside it. On phones only the phone
 * capture is shown, at a size where its text can be read.
 */
export function HeroSection() {
  // The hero screenshot is the largest thing above the fold (the LCP image).
  // Preload exactly the file each viewport will use, before the CSS arrives.
  preload(SHOTS.homePhone.src, { as: "image", fetchPriority: "high", media: HERO_PHONE_QUERY });
  preload(SHOTS.home.src, { as: "image", fetchPriority: "high", media: "(min-width: 640px)" });

  return (
    <section className="site-hero" aria-labelledby="hero-title">
      <div className="site-hero-layout site-container">
        <div className="site-hero-copy">
          <p className="site-hero-kicker">From check-in to checkout</p>
          <h1 id="hero-title">
            Repair shop software for{" "}
            <span className="whitespace-nowrap">check-in,</span> the bench and
            pickup
          </h1>
          <p className="site-hero-description">
            Log the device and the fault while the customer is at the counter.
            Track parts, photos and notes on the bench, then take payment when
            they collect. It runs in the browser on the phone, tablet or
            computer you already have.
          </p>
          <div className="site-hero-actions">
            <Link href={SIGN_UP_HREF} className="site-button">
              Start free <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href="#product" className="site-button-secondary">
              See the screens <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
          <p className="site-hero-note">
            <Check size={15} aria-hidden="true" />
            Free during early access. No credit card needed.
          </p>
        </div>
      </div>
      <figure className="site-hero-shots site-container">
        <div className="site-hero-stage">
          <picture className="site-hero-tablet">
            <source media={HERO_PHONE_QUERY} srcSet={SHOTS.homePhone.src} width={1170} height={2532} />
            {/* Plain <img>: art direction by viewport, served as captured (no re-encoding of UI text). */}
            <img
              src={SHOTS.home.src}
              alt={SHOTS.home.alt}
              width={2048}
              height={1536}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="site-hero-phone"
            src={SHOTS.jobPhone.src}
            alt={SHOTS.jobPhone.alt}
            width={1170}
            height={2532}
            loading="lazy"
            decoding="async"
          />
        </div>
        <figcaption>Actual app · Demo shop data</figcaption>
      </figure>
    </section>
  );
}
