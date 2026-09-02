import { ChevronIcon } from "./icons";

/**
 * Native <details>/<summary> disclosures: keyboard-operable, findable by the
 * browser's own in-page search, and zero JavaScript — the landing page ships
 * as a pure server component and stays that way.
 *
 * The answers are deliberately the honest ones. Two of the six say "no".
 */

const FAQS = [
  {
    q: "Is my data mine?",
    a: "Yes. Your customers, tickets, invoices and payments belong to your shop, and the owner account can export customers, invoices and payments to CSV from the Reports page at any time — no ticket to raise, no waiting. Nothing in your shop's records is sold or shared.",
  },
  {
    q: "Can customers pay online?",
    a: "Yes — connect your own Stripe account and every emailed invoice gets a pay link, with a Pay Online button in the customer portal. Payments settle straight onto the invoice automatically. Until you connect Stripe, you take payment at the counter and record it as cash, card, cheque or store credit.",
  },
  {
    q: "Does it work on a tablet at the counter?",
    a: "Yes. RepairFlow runs in the browser with nothing to install, and every screen is laid out to work from a phone up to a shop monitor — so a tablet on the counter is a first-class way to use it. Intake photos use the tablet's own camera, and the wall display has a full-screen mode for a spare monitor.",
  },
  {
    q: "Do I need a credit card to start?",
    a: "No. There is no billing anywhere in the product right now. Signing up creates your shop and your owner account, adds a default location, and drops you straight into the dashboard. That's the whole process.",
  },
  {
    q: "Can I import my data from RepairShopr or another system?",
    a: "Not automatically yet — there's no self-serve importer in the product, and pretending otherwise would waste your afternoon. It's on the roadmap. In the meantime, get in touch and we'll help move your customer list across by hand; most shops start by entering only their open repairs and letting the history stay where it is.",
  },
  {
    q: "Do the emails and text messages actually go out?",
    a: "Once you connect your own email or SMS provider in Settings, yes — public ticket updates, portal sign-in links, statements and follow-ups all send through it. Before you connect one, RepairFlow logs what it would have sent instead of sending it, so you can try the whole flow without messaging a real customer by accident.",
  },
];

export function Faq() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="scroll-mt-16 border-t border-border py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-accent">
              Questions
            </p>
            <h2
              id="faq-heading"
              className="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[40px]"
            >
              The ones worth asking first.
            </h2>
          </div>

          <div className="divide-y divide-border border-y border-border">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center gap-4 rounded-sm py-4 text-[15.5px] font-semibold tracking-tight text-foreground transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">{faq.q}</span>
                  <ChevronIcon className="size-[18px] shrink-0 text-faint-foreground transition-transform duration-200 group-open:-rotate-180" />
                </summary>
                <p className="max-w-2xl pb-5 pr-8 text-[14.5px] leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
