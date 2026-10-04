import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { DashboardPreview } from "./dashboard-preview";
import { Navbar, SIGN_UP_HREF } from "./navbar";

/** Calm typography and the actual counter, with no decorative background media. */
export function HeroSection() {
  return (
    <header className="site-hero relative w-full">
      <div className="relative z-10">
        <Navbar />

        <div className="flex flex-col items-center site-hero-copy px-4 pb-8 pt-10 text-center sm:pb-10 sm:pt-12">
          <span className="site-hero-tag">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-(--site-accent)"
            />
            Made for independent repair shops
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
            Repairs, sales and customer updates — together, from check-in to
            pickup.
          </p>

          <div className="site-hero-actions">
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
            <a className="site-hero-secondary" href="#product">
              See how it works <ChevronRight aria-hidden="true" size={16} />
            </a>
          </div>
          <p className="mt-3 text-[13px] text-(--site-muted)">
            Free during early access · No credit card needed
          </p>
        </div>

        <DashboardPreview />
      </div>
    </header>
  );
}
