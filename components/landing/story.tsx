import type { ReactNode } from "react";

import { DeviceDuo, PhoneFrame, TabletFrame } from "./device-frame";
import { SHOTS } from "./media";
import { Dot, Panel, Serif } from "./ui";

/**
 * The product story, one screen at a time: counter, check-in, bench, pickup,
 * payment, modes, assistant. Every sentence describes something the app does
 * today; where a feature needs setup (card terminals, email, SMS, an AI
 * provider) the copy says so next to it.
 */

const grid = "mx-auto grid max-w-[1120px] items-center gap-10 lg:grid-cols-12 lg:gap-14";

function Copy({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`lg:col-span-5 ${className}`}>{children}</div>;
}

function Media({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return <div className={`lg:col-span-7 ${first ? "lg:order-first" : ""}`}>{children}</div>;
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-7 space-y-3 text-[15px] leading-relaxed text-neutral-700">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <Dot />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** 1. Home: the counter tablet, bleeding off the bottom of the panel like the hero tray. */
export function CounterSection() {
  return (
    <Panel id="product" labelledBy="counter-title" className="pb-0 sm:pb-0 lg:pb-0">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="counter-title" className="site-h2">
          Every job starts with <Serif>one tap</Serif>
        </h2>
        <p className="site-lede mt-5">
          Home is a counter-sized screen of big picture tiles. New repair and New sale are always
          pinned on top, with what needs attention right underneath.
        </p>
        <ul className="mx-auto mt-7 grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-left text-[15px] text-neutral-700 sm:flex sm:max-w-2xl sm:flex-wrap sm:justify-center sm:gap-x-7">
          {["Check a device in", "Sell at the till", "Hand a repair back", "Add or find a customer"].map((x) => (
            <li key={x} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-(--site-accent)" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto mt-12 -mb-[9%] max-w-[940px] sm:mt-14">
        <TabletFrame src={SHOTS.home.src} alt={SHOTS.home.alt} sizes="(min-width: 1024px) 940px, 92vw" />
      </div>
    </Panel>
  );
}

/** 2. New repair: step by step, with the live summary. */
export function CheckInSection() {
  return (
    <Panel id="check-in" labelledBy="checkin-title" tone="tray">
      <div className={grid}>
        <Copy>
          <h2 id="checkin-title" className="site-h2">
            Check a device in, <Serif>step by step</Serif>
          </h2>
          <p className="site-lede mt-5">
            Four short steps, one question at a time, with a live summary beside you so nothing
            is missed before you check the repair in.
          </p>
          <Bullets
            items={[
              <>
                <strong className="font-semibold text-neutral-900">Customer.</strong> Search by name
                or phone, or add someone new on the spot.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">Device.</strong> Tap Phone, Tablet,
                Laptop, Computer, Game console, TV, Watch or Other, or pick one the customer already
                has saved.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">Problem.</strong> Common faults for
                that device, so there is very little to type.
              </>,
              <>
                <strong className="font-semibold text-neutral-900">Details.</strong> Price and promised
                time. Email, serial number and passcode are optional.
              </>,
            ]}
          />
        </Copy>
        <Media>
          <TabletFrame src={SHOTS.newRepair.src} alt={SHOTS.newRepair.alt} />
        </Media>
      </div>
    </Panel>
  );
}

/** 3. The bench: one big next step. */
export function BenchSection() {
  return (
    <Panel id="bench" labelledBy="bench-title">
      <div className={grid}>
        <Copy>
          <h2 id="bench-title" className="site-h2">
            At the bench, one big <Serif>next step</Serif>
          </h2>
          <p className="site-lede mt-5">
            Open a job and the next move is the biggest thing on the screen. One tap starts the
            repair, and the customer, device and due time stay in view the whole time.
          </p>
          <Bullets
            items={[
              "Call or text the customer straight from the job.",
              "Add a part, a photo or a note without leaving the page.",
              "Status steps run along the top: New, In Progress, Waiting for Parts, Waiting on Customer, Ready for Pickup and Resolved.",
            ]}
          />
        </Copy>
        <Media first>
          <DeviceDuo
            side="left"
            tablet={{ src: SHOTS.job.src, alt: SHOTS.job.alt }}
            phone={{ src: SHOTS.jobPhone.src, alt: SHOTS.jobPhone.alt }}
          />
        </Media>
      </div>
    </Panel>
  );
}

const customerPoints: { title: string; body: string }[] = [
  {
    title: "Text and email updates",
    body: "Message a customer from the job, or when it is ready. Messages go out once an email or SMS provider is set up for your shop.",
  },
  {
    title: "A portal to check on their repair",
    body: "Customers open a link to see status and documents, approve or decline an estimate, and pay an invoice online when a payment provider is connected.",
  },
  {
    title: "A self check-in link",
    body: "Switch on your check-in page, share the link or put it on your website, and customers enter their device and problem before they arrive.",
  },
];

/** 4. Hand it back, and keep customers informed. */
export function PickupSection() {
  return (
    <Panel id="pickup" labelledBy="pickup-title" tone="tray">
      <div className={grid}>
        <Copy>
          <h2 id="pickup-title" className="site-h2">
            Hand it back, and keep customers <Serif>posted</Serif>
          </h2>
          <p className="site-lede mt-5">
            Pickup &amp; pay lists everything that is ready. Each card says whether it is paid or
            still to bill, with the one big button that fits: Hand over or Create invoice.
          </p>
          <dl className="mt-8 border-t border-neutral-300/70">
            {customerPoints.map((p) => (
              <div key={p.title} className="border-b border-neutral-300/70 py-4">
                <dt className="text-[16px] font-semibold text-neutral-900">{p.title}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-neutral-700">{p.body}</dd>
              </div>
            ))}
          </dl>
        </Copy>
        <Media first>
          <TabletFrame src={SHOTS.pickup.src} alt={SHOTS.pickup.alt} />
        </Media>
      </div>
    </Panel>
  );
}

const payments: { title: string; body: string }[] = [
  {
    title: "Automatic",
    body: "Send the amount to a supported Stripe or Square terminal. Once the payment is confirmed, the sale is marked paid.",
  },
  {
    title: "Manual",
    body: "Use the bank terminal you already own, then record the approved card payment against the sale.",
  },
  {
    title: "Cash, split payments and credit",
    body: "See the change due, split cash and an approved card payment, take a deposit at check-in, or apply store credit at the till.",
  },
];

/** 5. Getting paid. */
export function PaymentsSection() {
  return (
    <Panel id="payments" labelledBy="payments-title">
      <div className={grid}>
        <Copy>
          <h2 id="payments-title" className="site-h2">
            Get paid on the card machine you <Serif>already have</Serif>
          </h2>
          <p className="site-lede mt-5">
            Sell from the Sell screen, or take payment on an invoice with one big button. You
            choose how Card works at your counter.
          </p>
          <dl className="mt-8 border-t border-neutral-200">
            {payments.map((p) => (
              <div key={p.title} className="grid gap-1 border-b border-neutral-200 py-4 sm:grid-cols-[9.5rem_1fr] sm:gap-6">
                <dt className="text-[16px] font-semibold text-neutral-900">{p.title}</dt>
                <dd className="text-[15px] leading-relaxed text-neutral-700">{p.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[13px] leading-relaxed text-neutral-600">
            Stripe and Square need your own account and a quick test before they go live.
          </p>
        </Copy>
        <Media>
          <DeviceDuo
            side="left"
            tablet={{ src: SHOTS.sell.src, alt: SHOTS.sell.alt }}
            phone={{ src: SHOTS.invoicePhone.src, alt: SHOTS.invoicePhone.alt }}
          />
        </Media>
      </div>
    </Panel>
  );
}

/** 6. Easy mode, Full view, and every kind of screen. */
export function ModesSection() {
  return (
    <Panel id="modes" labelledBy="modes-title" tone="tray">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="modes-title" className="site-h2">
          Easy mode at the counter. <Serif>Full</Serif> view at the desk.
        </h2>
        <p className="site-lede mt-5">
          Easy mode is big boxes and big buttons for the counter. Full view adds dense tables for detailed work. Counter is always your home, with the Shop
          overview one tap away. Both use the same records, you switch from the
          account menu on each device, and every tool stays reachable from Home under More tools.
        </p>
      </div>
      <div className="mx-auto mt-12 grid max-w-[1120px] items-end gap-10 sm:mt-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <figure className="mx-auto w-full max-w-[260px] lg:max-w-[280px]">
          <PhoneFrame src={SHOTS.homePhone.src} alt={SHOTS.homePhone.alt} />
          <figcaption className="mt-4 text-center text-[14px] text-neutral-700">
            <span className="font-semibold text-neutral-900">Easy mode</span>, on a phone
          </figcaption>
        </figure>
        <figure>
          <TabletFrame src={SHOTS.dashboard.src} alt={SHOTS.dashboard.alt} />
          <figcaption className="mt-4 text-center text-[14px] text-neutral-700">
            <span className="font-semibold text-neutral-900">Full view</span>: the Shop overview, on a tablet or desk screen
          </figcaption>
        </figure>
      </div>
      <p className="mx-auto mt-10 max-w-2xl text-center text-[15px] leading-relaxed text-neutral-700">
        Nothing to install. Repairs helper runs in the browser on the tablet, phone or computer
        you already have, and you can add it to the home screen so it opens like an app.
      </p>
    </Panel>
  );
}

const prompts = [
  "What’s ready for pickup?",
  "Which repairs are late?",
  "What’s running low?",
  "How did we do today?",
  "Who’s coming in today?",
];

/** 8. The assistant. */
export function AssistantSection() {
  return (
    <Panel id="assistant" labelledBy="assistant-title" tone="tray">
      <div className={grid}>
        <Copy>
          <h2 id="assistant-title" className="site-h2">
            Ask your shop <Serif>anything</Serif>
          </h2>
          <p className="site-lede mt-5">
            Type it, or press Talk. The assistant looks things up in your shop, opens the right
            screen, and asks you to confirm before it changes anything.
          </p>
          <ul className="mt-7 flex flex-wrap gap-2" aria-label="Examples of what to ask">
            {prompts.map((p) => (
              <li
                key={p}
                className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-[14px] text-neutral-800"
              >
                {p}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] leading-relaxed text-neutral-600">
            Quick lookups such as low stock, overdue repairs and today’s sales don’t need AI.
            Free-form requests need a connected AI provider, and voice input depends on your
            browser and your shop’s voice setup.
          </p>
        </Copy>
        <Media>
          <TabletFrame src={SHOTS.assistant.src} alt={SHOTS.assistant.alt} />
        </Media>
      </div>
    </Panel>
  );
}
