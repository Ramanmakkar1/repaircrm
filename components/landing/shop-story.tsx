import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { BrandMark } from "./brand";
import { SHOTS } from "./media";
import { Panel, Serif } from "./ui";

export const SHOP_SCENES = {
  dropoff: {
    src: "/marketing/shop/customer-dropoff.webp",
    alt: "Illustrative scene: a customer handing her phone to a repair shopkeeper at the counter.",
  },
  pickup: {
    src: "/marketing/shop/customer-pickup.webp",
    alt: "Illustrative scene: a shopkeeper returning a repaired phone to a customer.",
  },
} as const;

function AppShot({
  shot,
  caption,
}: {
  shot: { src: string; alt: string };
  caption: string;
}) {
  return (
    <figure className="site-app-shot">
      <Image
        src={shot.src}
        alt={shot.alt}
        width={2048}
        height={1536}
        unoptimized
        className="w-full"
      />
      <figcaption>{caption} · Actual app, demo shop data</figcaption>
    </figure>
  );
}

function Detail({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="site-detail">
      <Check aria-hidden="true" size={18} />
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function DropoffSection() {
  return (
    <Panel
      id="product"
      labelledBy="dropoff-title"
      className="site-human-section"
    >
      <div id="check-in" className="site-split site-container">
        <figure className="site-scene">
          <Image
            src={SHOP_SCENES.dropoff.src}
            alt={SHOP_SCENES.dropoff.alt}
            width={1536}
            height={1024}
            unoptimized
            sizes="(max-width: 800px) 100vw, 50vw"
          />
          <figcaption>Illustrative repair-shop scene</figcaption>
        </figure>
        <div className="site-story-copy">
          <p className="site-step">01 / At the counter</p>
          <h2 id="dropoff-title" className="site-h2">
            A good repair starts with a <Serif>good welcome.</Serif>
          </h2>
          <p className="site-lede mt-5">
            Give the customer your attention. Keep their device, details and
            repair request together, ready for the bench.
          </p>
          <div className="site-details">
            <Detail title="Check in without the guesswork">
              A guided flow for the customer, device, problem and estimate.
            </Detail>
            <Detail title="The next task is one tap away">
              New repair, new sale and pickup live on the same clear counter
              screen.
            </Detail>
          </div>
          <a className="site-text-link" href="/signup">
            Set up your counter <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </Panel>
  );
}

export function BenchOverview() {
  return (
    <Panel
      id="bench"
      labelledBy="bench-title"
      tone="tray"
      className="site-bench"
    >
      <div className="site-container">
        <div className="site-section-heading">
          <div>
            <p className="site-step">02 / On the bench</p>
            <h2 id="bench-title" className="site-h2">
              Every job. Every detail.
              <br />
              <Serif>All together.</Serif>
            </h2>
          </div>
          <p className="site-lede">
            Less chasing notes. More time fixing devices. Everyone works from
            the same repair record.
          </p>
        </div>
        <div className="site-bench-layout">
          <AppShot
            shot={SHOTS.job}
            caption="A repair record your team can follow"
          />
          <div className="site-bench-notes">
            <Detail title="Know where each repair stands">
              Follow status, parts, photos and notes from intake to ready for
              pickup.
            </Detail>
            <Detail title="Keep the customer in the loop">
              Send updates once your email or SMS provider is set up. Customers
              can check their repair in the portal.
            </Detail>
            <Detail title="A view for the way you work">
              Easy mode gives the counter big picture buttons. Full view adds
              detailed tables for the office. Both start at Counter.
            </Detail>
            <p className="site-small" id="modes">
              Works in your browser on a phone, tablet or computer.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function HandoffSection() {
  return (
    <Panel id="pickup" labelledBy="pickup-title" className="site-human-section">
      <div className="site-split site-container site-split-reverse">
        <div className="site-story-copy">
          <p className="site-step">03 / Back in their hands</p>
          <h2 id="pickup-title" className="site-h2">
            Finish the repair.
            <br />
            <Serif>Make their day.</Serif>
          </h2>
          <p className="site-lede mt-5">
            A clear pickup list, the balance due and the handover—together, so
            the last step feels as easy as the first.
          </p>
          <div className="site-details">
            <Detail title="Ready means ready">
              See which devices can go home and which still need an invoice.
            </Detail>
            <Detail title="Close the loop">
              Collect what’s owed, record the payment and hand the device back.
            </Detail>
          </div>
          <a className="site-text-link" href="/signup">
            Start with your next repair{" "}
            <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
        <figure className="site-scene">
          <Image
            src={SHOP_SCENES.pickup.src}
            alt={SHOP_SCENES.pickup.alt}
            width={1536}
            height={1024}
            unoptimized
            sizes="(max-width: 800px) 100vw, 50vw"
          />
          <figcaption>Illustrative repair-shop scene</figcaption>
        </figure>
      </div>
    </Panel>
  );
}

export function ShopToolsSection() {
  return (
    <Panel labelledBy="tools-title" tone="tray">
      <div className="site-container">
        <div className="site-section-heading">
          <h2 id="tools-title" className="site-h2">
            The rest of your shop,
            <br />
            <Serif>connected.</Serif>
          </h2>
          <p className="site-lede">
            Repairs are only part of the day. Keep sales, payments and the shelf
            moving alongside them.
          </p>
        </div>
        <div className="site-tool-columns">
          <div id="payments">
            <AppShot
              shot={SHOTS.sell}
              caption="A picture-first sales counter"
            />
            <h3>Sell a case. Take a payment.</h3>
            <p>
              Tap products into a sale. Record cash, deposits, split payments or
              store credit, with invoices kept alongside the customer.
            </p>
            <p className="site-small">
              Stripe and Square need your own account, provider credentials and
              test verification. Existing card-machine payments can be recorded
              manually.
            </p>
          </div>
          <div id="stock">
            <AppShot
              shot={SHOTS.stock}
              caption="Stock grouped by what you sell"
            />
            <h3>A shelf you can keep track of.</h3>
            <p>
              Find parts and accessories with product pictures, track quantities
              and keep purchasing in the same place.
            </p>
            <p className="site-small">
              Import customers and products from CSV. Product pictures come from
              the built-in library or your uploads.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function HelperSection() {
  return (
    <Panel id="assistant" labelledBy="assistant-title">
      <div className="site-container site-helper-layout">
        <div>
          <BrandMark className="site-helper-mark" />
          <h2 id="assistant-title" className="site-h2">
            A little help.
            <br />
            <Serif>Right when you need it.</Serif>
          </h2>
          <p className="site-lede mt-5">
            Ask what’s ready for pickup, find a repair or get a quick view of
            the day. Your shop assistant is close at hand.
          </p>
          <div className="site-helper-prompts">
            <span>“What’s ready for pickup?”</span>
            <span>“Which repairs are late?”</span>
            <span>“How did we do today?”</span>
          </div>
          <p className="site-small">
            Quick shop lookups work without AI. Free-form requests need a
            connected AI provider; voice input depends on your browser and shop
            setup. Changes require confirmation and respect staff permissions.
          </p>
        </div>
        <AppShot
          shot={SHOTS.assistant}
          caption="Help without leaving your counter"
        />
      </div>
    </Panel>
  );
}
