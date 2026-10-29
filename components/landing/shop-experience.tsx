import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SHOTS } from "./media";
import { BrandMark } from "./brand";

/**
 * Drop-off and pickup, shown with the real screens a shop uses at those two
 * moments. (The earlier staged "customer scene" photos were dropped: they read
 * as generated images. Real photos from a working shop would be better still.)
 */
const HANDOVER = [
  {
    shot: SHOTS.newRepair,
    title: "At drop-off: check the device in",
    body: "Pick the device type and note the fault while the customer is still at the counter, then print the repair ticket.",
  },
  {
    shot: SHOTS.pickup,
    title: "At pickup: see what’s paid and hand it over",
    body: "Ready-for-pickup lists which repairs still need an invoice and which are paid in full, so the balance is collected before the device goes back.",
  },
] as const;

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
            Drop-off and pickup, recorded on the same ticket
          </h2>
          <p>
            Record the details once. Customers can check the repair in the
            portal while it moves from the counter to the bench and back.
          </p>
        </div>
        <div className="site-customer-grid">
          {HANDOVER.map((step) => (
            <figure key={step.title}>
              <div className="site-shot-frame site-shot-crop">
                {/* eslint-disable-next-line @next/next/no-img-element -- served as captured */}
                <img
                  src={step.shot.src}
                  alt={step.shot.alt}
                  width={2048}
                  height={1536}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="site-shot-note">Actual app · Demo shop data</p>
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
            <span>The shop helper</span>
          </div>
          <h2 id="assistant-title">
            Ask the helper what’s ready for pickup
          </h2>
          <p>
            Type or say a question and the helper looks it up in your shop:
            which repairs are late, what’s waiting to be collected, how the day
            is going. On a ticket, AI tools can summarise long notes and
            draft a reply to the customer.
          </p>
          <div className="site-assistant-questions">
            <p>“What’s ready for pickup?”</p>
            <p>“Which repairs are late?”</p>
            <p>“How did we do today?”</p>
          </div>
          <a className="site-text-link" href="#setup">
            What the helper needs to work <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
        <figure className="site-assistant-preview">
          <div className="site-assistant-crop">
            <Image
              src={SHOTS.assistant.src}
              alt={SHOTS.assistant.alt}
              width={1024}
              height={768}
              unoptimized
            />
          </div>
          <figcaption>Actual app · Demo shop data</figcaption>
        </figure>
      </div>
    </section>
  );
}
