import "./site.css";

import { inter, instrumentSerif } from "./fonts";
import { FinalCta } from "./final-cta";
import { Faq } from "./faq";
import { SiteFooter } from "./footer";
import { HeroSection } from "./hero/hero-section";
import { Pricing } from "./pricing";
import {
  DropoffSection,
  BenchOverview,
  HandoffSection,
  ShopToolsSection,
  HelperSection,
} from "./shop-story";

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
      <HeroSection />
      <main id="main" className="flex flex-col">
        <DropoffSection />
        <BenchOverview />
        <HandoffSection />
        <ShopToolsSection />
        <HelperSection />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
