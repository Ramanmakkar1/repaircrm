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

/*
 * These are the survivors of the hand-built vignettes this page used before it
 * had screenshots. They are kept — shrunk to a corner card — because each one
 * shows something a still frame cannot: the shape of a workflow moving, and the
 * arithmetic at the bottom of an invoice. Everything else that used to be drawn
 * in divs is now the real screen behind them.
 *
 * Decorative: the prose beside each row already makes the claim, so neither
 * card is read out as a wall of orphaned numbers.
 */

function WorkflowCard() {
  const steps = ["Intake", "Diagnosed", "Repair", "QC"];
  const current = 2; // zero-indexed: "Repair" is in flight

  return (
    <div
      aria-hidden="true"
      className="rf-shot rounded-xl border border-border bg-surface p-4"
    >
      <p className="rf-nums text-[10.5px] font-bold uppercase tracking-[0.12em] text-faint-foreground">
        #1038 · workflow
      </p>

      <div className="mt-3 flex items-center">
        {steps.map((step, i) => (
          <div key={step} className="flex flex-1 items-center last:flex-none">
            <span
              className={[
                "flex size-[17px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                i < current
                  ? "bg-accent text-accent-foreground"
                  : i === current
                    ? "bg-accent-soft text-accent-soft-foreground ring-2 ring-accent"
                    : "border border-border-strong bg-surface text-faint-foreground",
              ].join(" ")}
            >
              {i < current ? "✓" : i + 1}
            </span>
            {i < steps.length - 1 ? (
              <span
                className={`mx-1.5 h-[2px] flex-1 rounded-full ${
                  i < current ? "bg-accent" : "bg-border"
                }`}
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between">
        {steps.map((step) => (
          <span
            key={step}
            className="text-[9.5px] font-semibold text-muted-foreground"
          >
            {step}
          </span>
        ))}
      </div>

      <p className="mt-3.5 flex items-center gap-1.5 border-t border-border pt-3 text-[11px] font-semibold text-accent-soft-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-accent" />
        Public update emailed to Priya
      </p>
    </div>
  );
}

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
    <div
      aria-hidden="true"
      className="rf-shot mt-5 rounded-xl border border-border bg-surface p-4"
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-faint-foreground">
        Customer portal
      </p>
      <p className="mt-1.5 text-[14px] font-bold tracking-tight text-foreground">
        Your Galaxy S22 is waiting on a part
      </p>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        Estimate for a replacement battery — $89.00
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex h-8 flex-1 items-center justify-center rounded-md bg-accent text-[12px] font-semibold text-accent-foreground shadow-xs">
          Approve &amp; sign
        </span>
        <span className="flex h-8 items-center justify-center rounded-md border border-border-strong px-3 text-[12px] font-semibold text-muted-foreground">
          Decline
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vignettes — a real crop of the app, with one card layered over it          */
/* -------------------------------------------------------------------------- */

/*
 * These rows render in a ~544px column, where a whole 1512px window would
 * shrink into unreadable texture. So each one shows a tight crop of the real
 * screen instead — cropped from the same captures used at full width further
 * down the page, and displayed at ~1.4x density so the type stays crisp.
 */

const DETAIL_SIZES = "(max-width: 1023px) 100vw, 544px";

function WorkroomVignette() {
  return (
    <ShotWithInset
      side="left"
      shot={
        <Panel>
          <Shot
            src="/marketing/detail-ticket.jpg"
            width={780}
            height={460}
            sizes={DETAIL_SIZES}
            alt="Two RepairFlow ticket cards side by side: an iPhone 14 Pro with an intermittent charging port, marked Waiting and Urgent, due Aug 28 and assigned to Marcus Webb; and an unassigned ThinkPad T14 with pop-ups and browser redirects, marked New. Each card shows its device tags and how long it has been open."
          />
        </Panel>
      }
      inset={<WorkflowCard />}
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
            src="/marketing/detail-pos.jpg"
            width={780}
            height={505}
            sizes={DETAIL_SIZES}
            alt="The RepairFlow point-of-sale product grid: filters for accessories, labour and parts, above tiles for a tempered glass protector at $24.99, a bench diagnostic at $95.00 per hour and level one data recovery at $175.00, each showing the stock left."
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
        <Shot
          src="/marketing/display-wall.jpg"
          width={1180}
          height={708}
          sizes={DETAIL_SIZES}
          alt="The RepairFlow shop display running full screen on a dark monitor: a headline count of nine open jobs, tallies for each status, a live clock, and a tile per repair showing its ticket number, device, customer surname, current status and how long it has been open."
        />
      </ScreenFrame>

      {/*
       * The customer's half of the same story, stacked under the shop's half
       * rather than overlapping it: the row's whole point is two audiences
       * seeing two different things, which reads better as two surfaces than
       * as one card obscuring the board it's meant to contrast with. No
       * screenshot exists for a one-off emailed link, so this stays hand-built.
       */}
      <PortalCard />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function DeepDives() {
  return (
    <section
      aria-label="How RepairFlow works"
      className="border-t border-border bg-surface-hover/50 py-20 sm:py-28"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-5 sm:gap-32 sm:px-8">
        <Row
          eyebrow="The workroom"
          heading={<>Everything about the repair, on the repair.</>}
          body="Open a ticket and the job is all there: where it sits in your workflow, the timer that's running, the parts and labour added so far, the photos taken at intake. Updates come in two kinds — the ones your customer receives, and the ones only your techs ever see."
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
            "Per-customer statements, printable or emailed",
            "CSV exports of customers, invoices and payments, QuickBooks-shaped",
          ]}
          caveat="Online payments run on your own Stripe account — connect it and invoice emails carry a pay link that settles onto the invoice by itself. No Stripe? Record counter payments as cash, card, cheque or store credit."
          vignette={<MoneyVignette />}
        />

        <Row
          eyebrow="Both sides of the counter"
          heading={<>What the shop sees. What the customer sees.</>}
          body="Put the display board on a spare monitor and the whole bench can tell what's ready and what's gone quiet without asking anyone. Customers get the calm version: a link in their inbox, no password, and the state of their own device."
          points={[
            "Full-screen wall display, grouped by status, refreshing itself",
            "Ageing repairs colour up on the board before anyone complains",
            "Customers sign in with an emailed link — nothing to remember",
            "Estimates approved or declined with a signature, on their phone",
            "Their invoices and a printable receipt, without a phone call",
          ]}
          vignette={<DisplayVignette />}
        />
      </div>
    </section>
  );
}
