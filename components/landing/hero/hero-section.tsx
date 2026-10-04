import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { HeroVideo } from "./hero-video";
import { Navbar, SIGN_UP_HREF } from "./navbar";

export function HeroSection() {
  return (
    <header className="site-hero">
      <Navbar />
      <div className="site-hero-layout site-container">
        <div className="site-hero-copy">
          <p className="site-hero-kicker">From check-in to checkout</p>
          <h1>
            Repair shop software.
            <br />
            Built for your counter.
          </h1>
          <p className="site-hero-description">
            Manage repair tickets, counter sales, inventory and customer updates
            in one workspace. Get a helping hand from your AI helper, on your
            phone, tablet or computer.
          </p>
          <div className="site-hero-actions">
            <Link href={SIGN_UP_HREF} className="site-button">
              Get started free <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href="#product" className="site-button-secondary">
              See how it works <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
          <p className="site-hero-note">
            <Check size={15} aria-hidden="true" />
            Free during early access. No credit card needed.
          </p>
        </div>
      </div>
      <HeroVideo />
      <div
        className="site-capability-bar site-container"
        aria-label="Connected shop tools"
      >
        <span>Built around your working day</span>
        <a href="#check-in">Repair management</a>
        <a href="#payments">Counter sales</a>
        <a href="#customers">Customer experience</a>
        <a href="#stock">Stock & purchasing</a>
      </div>
    </header>
  );
}
