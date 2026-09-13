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
    title: "A clear next step for every repair",
    body: "Track status, owner, due date and history together. Aging tickets stand out, so stalled jobs are easier to spot.",
  },
  {
    icon: DocumentIcon,
    title: "Estimates through to invoices",
    body: "Create estimates from the job, capture customer approval, and carry charges into invoices without typing them twice. Print or save documents as PDFs.",
  },
  {
    icon: BarcodeIcon,
    title: "Counter and stock in sync",
    body: "Sell at the register, use stock on repair jobs, and keep both in one inventory. Print Code 128 barcode labels and scan them at the till.",
  },
  {
    icon: KeyLinkIcon,
    title: "A portal customers can check",
    body: "After email delivery is configured, customers can sign in without a password to check repair progress and documents, then approve or decline estimates online.",
  },
  {
    icon: SendIcon,
    title: "Follow-ups on schedule",
    body: "Build outreach from repair, invoice and customer records. The scheduler checks every 15 minutes; email or SMS delivery requires a configured provider.",
  },
  {
    icon: SparkIcon,
    title: "AI drafts when you ask",
    body: "With an AI provider enabled, get a first draft of a customer update or a ticket summary. AI is off by default; email, phone, street address, last name, device serials and unlock codes are excluded from prompts.",
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
