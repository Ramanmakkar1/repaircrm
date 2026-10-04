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

/** Public product story. Landing styles remain scoped away from the app. */
export function RepairsHome() {
  return (
    <div
      id="top"
      className={`${inter.className} ${inter.variable} ${instrumentSerif.variable} site min-h-screen w-full bg-(--site-page) p-0`}
    >
      <a href="#main" className="site-skip">
        Skip to content
      </a>
      <div className="p-3 sm:p-4"><HeroSection /></div>
      <main id="main" className="flex flex-col">
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
      <SiteFooter />
    </div>
  );
}
