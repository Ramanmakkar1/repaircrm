import { Plus } from "lucide-react";

import { Panel, Serif } from "./ui";

/**
 * Native <details> disclosures: keyboard-operable, found by the browser's own
 * in-page search, and no JavaScript. Several answers are honest "not yet"s.
 */

export const FAQS = [
  {
    q: "Do I need new hardware?",
    a: "No. Repairs helper runs in the browser on the tablet, phone or computer you already have. Take card payments on a supported connected terminal, or record payments from the card machine you already own.",
  },
  {
    q: "Can I switch between Easy mode and Full view?",
    a: "Yes. Easy mode gives you big picture boxes for the counter, with New repair and New sale always one tap away. Full view adds dense tables for detailed work. Both views start at Counter, with Shop overview a tap away. Both use the same records, and every tool stays reachable from Home under More tools.",
  },
  {
    q: "What can the AI assistant do?",
    a: "Look up shop information, summarise repair tickets, draft customer replies and help with everyday tasks. Type a request or use voice input. It asks you to confirm changes and respects shop permissions. Free-form requests need a connected AI provider, and voice depends on your browser and your shop’s setup.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. There is no billing anywhere in the product right now. Signing up creates your shop and your owner account, and you can start right away.",
  },
  {
    q: "Can customers pay online?",
    a: "Stripe and Square payment connections are implemented, but they must be configured and tested before activation. Until a provider is connected, record counter payments as cash, card, cheque or store credit.",
  },
  {
    q: "Will my existing card machine update the invoice automatically?",
    a: "Only if it is a compatible terminal connected through a supported payment provider. Stripe Terminal and Square Terminal are supported; a generic bank terminal will not report its payment to Repairs helper by itself, so you record that payment manually. Confirm your provider and reader model before relying on automatic settlement.",
  },
  {
    q: "Do the emails and text messages actually go out?",
    a: "The messaging workflows are built, but email and SMS providers must be set up for your shop before real messages leave. Check password recovery, portal links and customer updates after you connect a sender.",
  },
  {
    q: "Can I bring my customers and stock with me?",
    a: "Yes. Import customers and products from a spreadsheet or CSV, review the preview, then save. There is no one-click migration of repair history from another system yet.",
  },
  {
    q: "Where do website enquiries go?",
    a: "Into Leads. Connect a Splitforms form on your website to collect the device, the problem and the customer’s contact details.",
  },
  {
    q: "Is my data mine?",
    a: "Your shop’s records belong to you. Owners can export customers, invoices, payments and report data to CSV. A complete archive of every record is not available yet. Repairs helper does not sell your shop records.",
  },
];

export function Faq() {
  return (
    <Panel className="site-faq" id="faq" labelledBy="faq-title" tone="tray">
      <div className="mx-auto grid max-w-[1120px] gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-4">
          <h2 id="faq-title" className="site-h2">
            Questions owners ask <Serif>first</Serif>
          </h2>
          <p className="site-lede mt-5">Short, honest answers, including the “not yet” ones.</p>
        </div>
        <div className="space-y-2 lg:col-span-8">
          {FAQS.map((faq, i) => (
            <details
              key={faq.q}
              name="faq"
              open={i === 0}
              className="group rounded-2xl bg-white px-5 sm:px-6"
            >
              <summary className="flex min-h-14 cursor-pointer items-center gap-4 py-4 text-[17px] font-medium tracking-tight text-neutral-900">
                <span className="min-w-0 flex-1">{faq.q}</span>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--site-tray) text-neutral-900 transition-transform group-open:rotate-45"
                >
                  <Plus className="h-4 w-4" />
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-[15px] leading-relaxed text-neutral-700">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Panel>
  );
}
