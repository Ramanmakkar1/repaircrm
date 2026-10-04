import "./site.css";

import { inter, instrumentSerif } from "./fonts";
import { FinalCta } from "./final-cta";
import { Faq } from "./faq";
import { SiteFooter } from "./footer";
import { HeroSection } from "./hero/hero-section";
import { Pricing } from "./pricing";
import { ShelfSection } from "./shelf";
import {
  AssistantSection,
  BenchSection,
  CheckInSection,
  CounterSection,
  ModesSection,
  PaymentsSection,
  PickupSection,
} from "./story";

/**
 * The public front page (signed out). One light-grey frame, and every section
 * is a rounded panel on it, starting with the full-viewport video hero.
 * Server components throughout; the only client code is the navbar menu.
 *
 * The orange accent, page colours and fonts are all defined in site.css and
 * fonts.ts, so the whole look can be changed from those two files.
 */
export function RepairsHome() {
  return (
    <div
      id="top"
      className={`${inter.className} ${inter.variable} ${instrumentSerif.variable} site min-h-screen w-full bg-(--site-page) p-3 sm:p-4`}
    >
      <a href="#main" className="site-skip">
        Skip to content
      </a>
      <HeroSection />
      <main id="main" className="mt-3 flex flex-col gap-3 sm:mt-4 sm:gap-4">
        <CounterSection />
        <CheckInSection />
        <BenchSection />
        <PickupSection />
        <PaymentsSection />
        <ModesSection />
        <ShelfSection />
        <AssistantSection />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <div className="mt-3 sm:mt-4">
        <SiteFooter />
      </div>
    </div>
  );
}
