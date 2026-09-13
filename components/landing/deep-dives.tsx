import type { ReactNode } from "react";

import { CheckIcon } from "./icons";
import { Panel, ScreenFrame, Shot, ShotWithInset } from "./shot";

/* -------------------------------------------------------------------------- */
/* Shared row scaffold                                                        */
/* -------------------------------------------------------------------------- */

function Row({
  eyebrow,
  heading,
  body,
  points,
  caveat,
  vignette,
  flip,
}: {
  eyebrow: string;
  heading: ReactNode;
  body: string;
  points: string[];
  caveat?: string;
  vignette: ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "lg:order-2" : undefined}>
        <p className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-accent">
          {eyebrow}
        </p>
        {/* h2, not h3: this band has no visible heading of its own (it is
            labelled by `aria-label`), so each row's title is a top-level
            heading of the page. h3 here skipped a level. */}
        <h2 className="mt-3 text-[28px] font-bold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[36px]">
          {heading}
        </h2>
        <p className="mt-5 text-[16px] leading-relaxed text-muted-foreground">
          {body}
        </p>

        <ul className="mt-6 space-y-2.5">
          {points.map((point) => (
            <li key={point} className="flex gap-3 text-[14.5px] text-foreground">
              <CheckIcon className="mt-0.5 size-[18px] shrink-0 text-accent" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        {caveat ? (
          <p className="mt-6 rounded-md border border-border bg-surface-hover px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground">
            {caveat}
          </p>
        ) : null}
      </div>

      <div className={flip ? "lg:order-1" : undefined}>{vignette}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inset cards                                                                */
/* -------------------------------------------------------------------------- */

/* Small interface details support the workshop photography. */

function InvoiceCard() {
  return (
    <div
      aria-hidden="true"
      className="rf-shot rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="rf-nums text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint-foreground">
          INV-1042
        </p>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-resolved-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-status-resolved-fg">
          <span className="size-1.5 rounded-full bg-status-resolved" />
          Paid
        </span>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-[11.5px] text-muted-foreground">
          <span>Subtotal</span>
          <span className="rf-nums">$233.00</span>
        </div>
        <div className="flex justify-between text-[11.5px] text-muted-foreground">
          <span>Tax (5%)</span>
          <span className="rf-nums">$11.65</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-[12px] font-bold text-foreground">Total</span>
          <span className="rf-nums text-[17px] font-bold tracking-tight text-foreground">
            $244.65
          </span>
        </div>
      </div>
    </div>
  );
}

function PortalCard() {
  return (
    <div aria-hidden="true" className="rf-shot mt-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Customer portal</p>
          <p className="mt-1 text-[14px] font-semibold text-foreground">Your repair is ready</p>
        </div>
        <span className="rounded-sm bg-status-ready-bg px-2 py-1 text-[10px] font-semibold text-status-ready-fg">Ready for pickup</span>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <span className="size-2 rounded-full bg-status-resolved" />
        Repair completed · We&rsquo;re open until 6 pm
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vignettes — repair photography paired with compact product previews        */
/* -------------------------------------------------------------------------- */

/* Images are rendered at their natural aspect ratio in a two-column layout. */

const DETAIL_SIZES = "(max-width: 1023px) 100vw, 544px";

function WorkroomVignette() {
  return (
    <ShotWithInset
      side="left"
      shot={
        <Panel>
          <Shot
            src="/marketing/diagnostics.jpg"
            width={1600}
            height={1000}
            sizes={DETAIL_SIZES}
            alt="A repair technician diagnosing a phone at a tidy electronics workbench."
          />
        </Panel>
      }
      inset={
        <div aria-hidden="true" className="rf-shot rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="rf-nums text-[10px] font-bold uppercase tracking-[0.12em] text-faint-foreground">Ticket #1042</p>
            <span className="rounded-sm bg-status-in-progress-bg px-2 py-0.5 text-[9px] font-semibold text-status-in-progress-fg">In progress</span>
          </div>
          <p className="mt-3 text-[12.5px] font-semibold text-foreground">iPhone 13 · charging fault</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">Diagnostic notes, parts and customer updates stay with the repair.</p>
        </div>
      }
    />
  );
}

function MoneyVignette() {
  return (
    <ShotWithInset
      side="right"
      shot={
        <Panel>
          <Shot
            src="/marketing/repair-bench.jpg"
            width={1600}
            height={900}
            sizes={DETAIL_SIZES}
            alt="A clean electronics repair bench with tools and a phone ready for service."
          />
        </Panel>
      }
      inset={<InvoiceCard />}
    />
  );
}

function DisplayVignette() {
  return (
    <div>
      <ScreenFrame>
        <div aria-label="Shop display preview with ten repairs grouped by status" role="img" className="bg-[#111214] p-5 text-white sm:p-6">
          <div className="flex items-center justify-between border-b border-white/15 pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">RepairPilot · Live board</p>
              <p className="mt-1 text-[16px] font-semibold tracking-tight sm:text-[19px]">Today&apos;s repair queue</p>
            </div>
            <span className="flex items-center gap-2 text-[10px] font-medium text-white/65">
              <span className="size-2 rounded-full bg-emerald-400" />
              Updating
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["New", "3", "bg-status-new"],
              ["In progress", "4", "bg-status-in-progress"],
              ["Waiting", "1", "bg-status-waiting"],
              ["Ready", "2", "bg-status-ready"],
            ].map(([label, count, color]) => (
              <div key={label} className="rounded-md border border-white/10 bg-white/[0.06] p-3">
                <p className="flex items-center gap-1.5 text-[9px] font-medium text-white/65">
                  <span aria-hidden="true" className={"size-1.5 rounded-full " + color} />
                  {label}
                </p>
                <p className="mt-2 text-[24px] font-semibold leading-none tabular-nums">{count}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-2.5">
              <p className="text-[9px] font-semibold text-white/45">#1042 · IPHONE 13</p>
              <p className="mt-1 text-[11px] font-semibold">Charging port repair</p>
            </div>
            <div className="hidden rounded-md border border-white/10 bg-white/[0.06] px-3 py-2.5 sm:block">
              <p className="text-[9px] font-semibold text-white/45">#1046 · MACBOOK AIR</p>
              <p className="mt-1 text-[11px] font-semibold">Ready for pickup</p>
            </div>
          </div>
        </div>
      </ScreenFrame>

      {/*
       * The customer's half of the same story, stacked under the shop's half
       * The customer's view sits under the shop's board. Both previews stay
       * visible so the two sides of the counter are easy to compare.
       */}
      <Panel>
        <Shot
          src="/marketing/customer-handoff.jpg"
          width={1600}
          height={1000}
          sizes={DETAIL_SIZES}
          alt="A technician hands a repaired laptop back to a customer across a neighborhood repair shop counter."
        />
      </Panel>
      <PortalCard />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function DeepDives() {
  return (
    <section
      aria-label="How RepairPilot works"
      className="border-t border-border bg-surface-hover/50 py-20 sm:py-28"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-5 sm:gap-32 sm:px-8">
        <Row
          eyebrow="The workroom"
          heading={<>Everything about the repair, on the repair.</>}
          body="Open a ticket and the job is all there: its workflow status, running timer, parts and labour, and intake photos. Keep customer-facing updates separate from internal notes, so shop-only details stay with the team."
          points={[
            "Workflow steps you define, not ours",
            "Public updates reach the customer; internal notes stay internal",
            "Saved replies for the messages you send twelve times a week",
            "Start/stop timer per tech, logged against the ticket",
            "Photos from the counter, attachments, and custom fields",
          ]}
          vignette={<WorkroomVignette />}
        />

        <Row
          flip
          eyebrow="The money loop"
          heading={<>From “that&rsquo;ll be another two parts” to paid.</>}
          body="Add charges to the ticket as the work happens. When the job's done, one click sweeps every un-invoiced charge into a draft invoice — nothing keyed in twice, nothing left in a notebook. Record how the customer paid, send a statement, and hand your bookkeeper a clean CSV at month end."
          points={[
            "Ticket charges become a draft invoice in one click",
            "Cash, card, cheque and store credit recorded against the invoice",
            "Recurring invoices for the managed-IT clients you bill monthly",
            "Per-customer statements, printable or emailed after sender setup",
            "CSV exports of customers, invoices and payments, QuickBooks-shaped",
          ]}
          caveat="Stripe (NZ, US, Canada and UK) and Square (US, Canada and UK) payment connections need provider credentials and a verified test before activation. Otherwise, record counter payments as cash, card, cheque or store credit."
          vignette={<MoneyVignette />}
        />

        <Row
          eyebrow="Both sides of the counter"
          heading={<>What the shop sees. What the customer sees.</>}
          body="Put the display board on a spare monitor and the whole bench can tell what's ready and what's gone quiet without asking anyone. Once outbound email is configured, customers can use a passwordless link to check the status of their own device."
          points={[
            "Full-screen wall display, grouped by status, refreshing itself",
            "Ageing repairs colour up on the board before anyone complains",
            "Customers sign in with an emailed link once email delivery is configured",
            "Estimates approved or declined with a signature, on their phone",
            "Their invoices and a printable receipt, without a phone call",
          ]}
          vignette={<DisplayVignette />}
        />
      </div>
    </section>
  );
}
