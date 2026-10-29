import "@/components/landing/site.css";

import type { ReactNode } from "react";

import { manrope } from "@/components/landing/fonts";
import { SiteFooter } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/hero/navbar";

/**
 * The frame for every public marketing page: the home page's navigation,
 * typeface, palette and footer, so a visitor moving between / and /pricing
 * sees one website.
 */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div
      id="top"
      className={`${manrope.className} ${manrope.variable} site min-h-screen w-full bg-(--site-page) p-0`}
    >
      <a href="#main" className="site-skip">
        Skip to content
      </a>
      <header>
        <Navbar />
      </header>
      <main id="main" className="flex flex-col">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
