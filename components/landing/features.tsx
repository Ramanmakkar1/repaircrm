import type { ComponentType, SVGProps } from "react";

import { Card } from "@/components/ui/card";

import {
  BarcodeIcon,
  BoardIcon,
  DocumentIcon,
  KeyLinkIcon,
  SendIcon,
  SparkIcon,
} from "./icons";

type Feature = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
};

/**
 * Six real features. Every sentence here describes behaviour that exists in the
 * app today — where something is optional, manual or needs configuring, the
 * copy says so rather than rounding up to the marketing version.
 */
const FEATURES: Feature[] = [
  {
    icon: BoardIcon,
    title: "Tickets that raise their hand",
    body: "Every repair is a ticket with a status, an owner, a timeline and the customer attached. Tickets that have gone quiet colour themselves in as they age, so the one nobody has touched since Tuesday is the one you notice first.",
  },
  {
    icon: DocumentIcon,
    title: "Estimates and invoices, no retyping",
    body: "Write an estimate, get it approved, turn it into an invoice without keying the parts in twice. Customers sign on the screen with a finger, and every document prints — or saves as a PDF — straight from the browser.",
  },
  {
    icon: BarcodeIcon,
    title: "A counter that knows the stockroom",
    body: "A proper register with a cart, tender and change due, drawing on the same inventory your repairs pull parts from. Print Code 128 barcode labels for any product and scan them back at the till.",
  },
  {
    icon: KeyLinkIcon,
    title: "A portal customers will actually open",
    body: "Customers get a sign-in link by email — no password to forget — and can see where their device is up to, plus their estimates and invoices. Approving or declining an estimate takes a signature and lands straight on your ticket.",
  },
  {
    icon: SendIcon,
    title: "Follow-ups that send themselves",
    body: "Set a rule like “two weeks after a repair is resolved” and RepairFlow builds the list from your real tickets, invoices and new customers, then sends on schedule — every fifteen minutes while the app is running. Guard rails built in: it never double-sends, and it never blasts old history.",
  },
  {
    icon: SparkIcon,
    title: "AI drafting, and reports that add up",
    body: "Optional AI writes the first draft of a customer update or boils a long ticket down to a summary. It stays switched off until you turn it on, and personal details are stripped before anything leaves. The reports are plain arithmetic over your own numbers.",
  },
];

export function Features() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-16 border-t border-border py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-accent">
            Everything in one place
          </p>
          <h2
            id="features-heading"
            className="mt-3 text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[44px]"
          >
            Six things a repair shop
            <br className="hidden sm:block" /> runs on. All of them here.
          </h2>
          <p className="mt-5 text-[16.5px] leading-relaxed text-muted-foreground">
            Not a suite of modules you buy separately — one system where the
            ticket, the parts, the invoice and the customer are the same records.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="rf-lift p-6 hover:shadow-md">
              <span className="flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
                <feature.icon className="size-[22px]" />
              </span>
              <h3 className="mt-5 text-[15.5px] font-bold tracking-tight text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
