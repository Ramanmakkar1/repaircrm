import "./site.css";

import { manrope } from "./fonts";
import { DeviceExperience } from "./device-experience";
import { Features } from "./features";
import { SplitformsPartner } from "./splitforms-partner";
import { FinalCta } from "./final-cta";
import { Faq } from "./faq";
import { SiteFooter } from "./footer";
import { HeroSection } from "./hero/hero-section";
import { Navbar } from "./hero/navbar";
import { Pricing } from "./pricing";
import { ProductExplorer } from "./product-explorer";
import { CustomerExperience, ShopAssistant } from "./shop-experience";
import { TrustBand } from "./trust";

/**
 * Public product story. Landing styles remain scoped away from the app.
 * Backgrounds alternate: white hero, tray trust band, white product, tray
 * features, white handover, tray devices, navy helper, tray integrations,
 * white pricing, tray FAQ, blue closing call to action.
 */
export function RepairsHome() {
  return (
    <div
      id="top"
      className={`${manrope.className} ${manrope.variable} site min-h-screen w-full bg-(--site-page) p-0`}
    >
      <a href="#main" className="site-skip">
        Skip to content
      </a>
      {/* display: contents, so the navbar sticks for the whole page rather than only inside the header box. */}
      <header className="contents">
        <Navbar />
      </header>
      <main id="main" className="flex flex-col">
        <HeroSection />
        <TrustBand />
        <ProductExplorer />
        <Features />
        <CustomerExperience />
        <DeviceExperience />
        <ShopAssistant />
        <SplitformsPartner />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
