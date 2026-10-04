import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { DashboardPreview } from "./dashboard-preview";
import { HERO_MOBILE_QUERY, HERO_POSTER_MOBILE_SRC, HERO_POSTER_SRC } from "./hero-media";
import { HeroVideo } from "./hero-video";
import { Navbar, SIGN_UP_HREF } from "./navbar";

/** The owner's sky hero, grounded by the real counter screen and shop workflow. */
export function HeroSection() {
  return (
    <header className="site-hero relative w-full overflow-hidden rounded-2xl bg-[#d9d9d9] sm:rounded-3xl">
      {/* The poster is the first large thing painted (and the LCP candidate): React hoists this hint into <head>. */}
      <link rel="preload" as="image" href={HERO_POSTER_MOBILE_SRC} media={HERO_MOBILE_QUERY} fetchPriority="high" />
      <link rel="preload" as="image" href={HERO_POSTER_SRC} media={`not all and ${HERO_MOBILE_QUERY}`} fetchPriority="high" />
      <HeroVideo />
      <div aria-hidden="true" className="site-hero-wash absolute inset-0" />

      <div className="relative z-10">
        <Navbar />

        <div className="flex flex-col items-center site-hero-copy px-4 pb-8 pt-10 text-center sm:pb-10 sm:pt-12">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-[13px] shadow-sm">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-(--site-accent)" />
            Repairs helper
          </span>

          <h1
            className="mt-5 max-w-4xl text-[#0b0f1a] sm:mt-6"
            style={{
              fontSize: "clamp(36px, 8vw, 72px)",
              lineHeight: 1.05,
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            Your <span className="site-serif">repair shop</span>
            <br />
            on one calm screen
          </h1>

          <p
            className="mt-4 px-2 max-w-xl text-(--site-muted) sm:mt-6"
            style={{ fontSize: "clamp(16px, 1.3vw, 18px)" }}
          >
            Repairs, sales and customer updates — together, from check-in to pickup.
          </p>

          <Link
            href={SIGN_UP_HREF}
            className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-full bg-[#0b0f1a] py-2 pl-6 pr-2 text-sm font-medium text-white sm:mt-8 sm:py-2.5 sm:pl-7"
          >
            Start your shop
            <span
              aria-hidden="true"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 sm:h-7 sm:w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
          <p className="mt-3 text-[13px] text-(--site-muted)">Free during early access · No credit card needed</p>
        </div>

        <DashboardPreview />
      </div>
    </header>
  );
}
