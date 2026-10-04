import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SHOTS } from "./media";
import { BrandMark } from "./brand";
import { SHOP_SCENES } from "./shop-story";

export function CustomerExperience() {
  return (
    <section
      id="customers"
      className="site-section site-customers"
      aria-labelledby="customers-title"
    >
      <div className="site-container">
        <div className="site-section-heading">
          <h2 id="customers-title">
            Keep customers in the loop.
            <br />
            From drop-off to pickup.
          </h2>
          <p>
            Record the details once. Keep customers informed as the repair moves
            from the counter to the bench and back.
          </p>
        </div>
        <div className="site-customer-grid">
          <figure>
            <Image
              src={SHOP_SCENES.dropoff.src}
              alt={SHOP_SCENES.dropoff.alt}
              width={1400}
              height={933}
              unoptimized
            />
            <figcaption>
              <h3>A better first hello.</h3>
              <p>
                Capture the device, the problem and the estimate while the
                customer is at the counter.
              </p>
            </figcaption>
          </figure>
          <figure>
            <Image
              src={SHOP_SCENES.pickup.src}
              alt={SHOP_SCENES.pickup.alt}
              width={1400}
              height={933}
              unoptimized
            />
            <figcaption>
              <h3>A clear final handover.</h3>
              <p>
                See what’s ready, collect the balance and return the device with
                the repair record complete.
              </p>
            </figcaption>
          </figure>
        </div>
        <div className="site-customer-note">
          <p>
            Customers can check their repair in the portal. Updates are
            delivered once your email or SMS provider is set up.
          </p>
          <span>Illustrative repair-shop scenes</span>
        </div>
      </div>
    </section>
  );
}

export function ShopAssistant() {
  return (
    <section
      id="assistant"
      className="site-section site-assistant"
      aria-labelledby="assistant-title"
    >
      <div className="site-container site-assistant-layout">
        <div className="site-assistant-copy">
          <div className="site-assistant-identity">
            <BrandMark className="size-9" />
            <span>Your shop assistant</span>
          </div>
          <h2 id="assistant-title">
            Find the answer.
            <br />
            Keep the day moving.
          </h2>
          <p>
            Find a repair, check what’s ready for pickup or get a quick view of
            the day. A little help, right inside your workspace.
          </p>
          <div className="site-assistant-questions">
            <p>“What’s ready for pickup?”</p>
            <p>“Which repairs are late?”</p>
          </div>
          <p className="site-small">
            Quick shop lookups work without AI. Free-form requests need a
            connected AI provider; voice input depends on your browser and shop
            setup. Changes require confirmation and respect staff permissions.
          </p>
          <a className="site-text-link" href="/signup">
            Meet your helper <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
        <figure className="site-assistant-preview">
          <Image
            src={SHOTS.assistant.src}
            alt={SHOTS.assistant.alt}
            width={1024}
            height={768}
            unoptimized
          />
          <figcaption>Actual app · Demo shop data</figcaption>
        </figure>
      </div>
    </section>
  );
}
