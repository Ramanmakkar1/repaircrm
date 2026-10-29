import { Check, Plus } from "lucide-react";

import { Container, DarkCta, Panel } from "./ui";

/**
 * One plan, one price, and a plain list of what is not finished next to it.
 * There are no invented tiers because there is no billing in the product:
 * signing up creates a shop and nothing ever asks for a card.
 */

export const PRICE = "$0";

export const INCLUDED = [
  "Easy mode counter, Sell screen and step-by-step repair check-in",
  "Your whole team, with owner, tech and front-desk roles",
  "Customer portal and shop display",
  "Spreadsheet and CSV import for customers and products",
  "CSV exports for customers, invoices and payments",
  "No feature tiers and no per-seat charges during early access",
];

export const NOT_YET = [
  "One-click migration with repair history from another system is not available; customers and products can be imported from a spreadsheet or CSV.",
  "Stripe and Square connections need your own account, provider credentials and test verification before they go live.",
  "Email and SMS need a provider set up for your shop before real messages are delivered.",
  "Connected providers (AI, SMS, card processing) may charge their own usage fees.",
];

export function Pricing() {
  return (
    <Panel id="pricing" labelledBy="pricing-title">
      {/* Phones read heading, then the $0 card, then the caveats; desktop puts the card on the right. */}
      <Container className="grid items-start gap-10 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-8">
        <div className="lg:col-start-1 lg:row-start-1">
          <h2 id="pricing-title" className="site-h2">
            Free during early access
          </h2>
          <p className="site-lede mt-5">
            Bring your team, customers and stock into one workspace at no cost
            during early access. Paid plans will come later, and we’ll announce
            them well before anything changes. You can export your records to
            CSV the whole time.
          </p>
        </div>

        <div className="rounded-2xl bg-(--site-tray) p-6 sm:p-9 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[17px] font-semibold tracking-tight text-neutral-900">
              Early access
            </p>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[13px] text-neutral-800">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-(--site-accent)"
              />
              Open now
            </span>
          </div>
          <p className="mt-6 flex items-end gap-3">
            <span
              className="font-medium leading-none text-neutral-900"
              style={{
                fontSize: "clamp(64px, 11vw, 104px)",
                letterSpacing: "-0.04em",
              }}
            >
              {PRICE}
            </span>
            <span className="pb-2 text-[15px] text-neutral-700">
              per shop, per month
            </span>
          </p>
          <ul className="mt-8 space-y-3 border-t border-neutral-300/70 pt-8">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex gap-3 text-[15px] leading-relaxed text-neutral-900"
              >
                <Check
                  aria-hidden="true"
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 text-(--site-accent-ink)"
                />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-9">
            <DarkCta href="/signup">Start free</DarkCta>
            <p className="mt-3 text-[13px] text-neutral-600">
              No credit card. Nothing in Repairs helper asks for one.
            </p>
          </div>
        </div>

        <details className="group border-y border-neutral-200 lg:col-start-1 lg:row-start-2">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3 text-[17px] font-semibold tracking-tight text-neutral-900">
            Before you rely on these workflows
            <Plus
              aria-hidden="true"
              className="h-4 w-4 shrink-0 transition-transform group-open:rotate-45"
            />
          </summary>
          <ul className="border-t border-neutral-200">
            {NOT_YET.map((item) => (
              <li
                key={item}
                className="border-b border-neutral-200 py-3.5 text-[15px] leading-relaxed text-neutral-700 last:border-b-0"
              >
                {item}
              </li>
            ))}
          </ul>
        </details>
      </Container>
    </Panel>
  );
}
