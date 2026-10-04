import "./site.css";

import { manrope } from "./fonts";
import { DeviceExperience } from "./device-experience";
import { Features } from "./features";
import { SplitformsPartner } from "./splitforms-partner";
import { FinalCta } from "./final-cta";
import { Faq } from "./faq";
import { SiteFooter } from "./footer";
import { HeroSection } from "./hero/hero-section";
import { Pricing } from "./pricing";
import { ProductExplorer } from "./product-explorer";
import { CustomerExperience, ShopAssistant } from "./shop-experience";

/** Public product story. Landing styles remain scoped away from the app. */
export function RepairsHome() {
  return (
    <div
      id="top"
      className={`${manrope.className} ${manrope.variable} site min-h-screen w-full bg-(--site-page) p-0`}
    >
      <a href="#main" className="site-skip">
        Skip to content
      </a>
      <HeroSection />
      <main id="main" className="flex flex-col">
        <ProductExplorer />
        <Features />
        <CustomerExperience />
        <DeviceExperience />
        <SplitformsPartner />
        <ShopAssistant />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
