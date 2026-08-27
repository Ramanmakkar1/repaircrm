import type { ReactNode } from "react";

import { CheckIcon } from "./icons";

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
        <h3 className="mt-3 text-[28px] font-bold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-[36px]">
          {heading}
        </h3>
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
/* Vignette A — the ticket workroom                                           */
/* -------------------------------------------------------------------------- */

function WorkroomVignette() {
  const steps = ["Intake", "Diagnosed", "Repair", "QC"];
  const current = 2; // zero-indexed: "Repair" is in flight

  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-border bg-surface p-5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="rf-nums text-[11px] font-bold text-faint-foreground">
            #1038
          </p>
          <p className="mt-0.5 truncate text-[15px] font-bold tracking-tight text-foreground">
            MacBook Air — liquid damage
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-in-progress-bg px-2.5 py-1 text-[11.5px] font-semibold text-status-in-progress-fg">
          <span className="size-1.5 rounded-full bg-status-in-progress" />
          In progress
        </span>
      </div>

      {/* workflow step tracker */}
      <div className="mt-5">
        <div className="flex items-center">
          {steps.map((step, i) => (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <span
                className={[
                  "flex size-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
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
              className="text-[10px] font-semibold text-muted-foreground"
            >
              {step}
            </span>
          ))}
        </div>
      </div>

      {/* updates */}
      <div className="mt-5 space-y-2.5">
        <div className="rounded-md border border-accent-soft bg-accent-soft/40 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-accent-soft-foreground">
            <span className="size-1.5 rounded-full bg-accent" />
            Public · emailed to Priya
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-foreground">
            Board cleaned and dried out — it&rsquo;s powering on again. Running it
            overnight before we call it done.
          </p>
        </div>

        <div className="rounded-md border border-border bg-surface-hover p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span className="size-1.5 rounded-full bg-border-strong" />
            Internal note
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
            Corrosion near the trackpad connector. Quote a replacement if it
            plays up.
          </p>
        </div>
      </div>

      {/* canned replies + timer */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4">
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Waiting on parts
        </span>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Ready for pickup
        </span>
        <span className="rf-nums ml-auto flex items-center gap-1.5 rounded-full bg-status-in-progress-bg px-2.5 py-1 text-[11.5px] font-bold text-status-in-progress-fg">
          <span className="size-1.5 rounded-full bg-status-in-progress" />
          01:24:07
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vignette B — the money loop                                                */
/* -------------------------------------------------------------------------- */

function InvoiceVignette() {
  const lines = [
    { label: "Screen assembly — iPhone 13", qty: "1", amount: "129.00" },
    { label: "Labour — screen replacement", qty: "1", amount: "80.00" },
    { label: "Tempered glass protector", qty: "2", amount: "24.00" },
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-border bg-surface shadow-lg"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-[15px] font-bold tracking-tight text-foreground">
            Invoice INV-1042
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            Dana Whitfield · from ticket #1042
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-status-resolved-bg px-2.5 py-1 text-[11.5px] font-semibold text-status-resolved-fg">
          <span className="size-1.5 rounded-full bg-status-resolved" />
          Paid
        </span>
      </div>

      <div className="px-5 py-4">
        {lines.map((line) => (
          <div
            key={line.label}
            className="flex items-baseline gap-3 border-b border-border py-2.5 last:border-b-0"
          >
            <span className="rf-nums w-5 shrink-0 text-[11.5px] font-semibold text-faint-foreground">
              {line.qty}×
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
              {line.label}
            </span>
            <span className="rf-nums shrink-0 text-[13px] font-semibold text-foreground">
              ${line.amount}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="ml-auto max-w-[220px] space-y-1.5">
          <div className="flex justify-between text-[12.5px] text-muted-foreground">
            <span>Subtotal</span>
            <span className="rf-nums">$233.00</span>
          </div>
          <div className="flex justify-between text-[12.5px] text-muted-foreground">
            <span>Tax (5%)</span>
            <span className="rf-nums">$11.65</span>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="text-[13px] font-bold text-foreground">Total</span>
            <span className="rf-nums text-[19px] font-bold tracking-tight text-foreground">
              $244.65
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-hover px-5 py-3.5">
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Print / save PDF
        </span>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Statement
        </span>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          QuickBooks CSV
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Vignette C — the wall display + the portal                                 */
/* -------------------------------------------------------------------------- */

/*
 * The only deliberately dark surface on the page: the shop-wall display really
 * is dark in the product, because it lives on a monitor across the room. The
 * hexes below are the app's own dark-mode token values, hard-coded because the
 * landing page runs in the light palette (see .rf-landing in globals.css).
 */
function DisplayVignette() {
  const rows = [
    { id: "#1021", device: "ThinkPad T14", label: "Ready", bg: "#0e2724", fg: "#6ed3c5", dot: "#33b7a8" },
    { id: "#1018", device: "iPad 9", label: "Ready", bg: "#0e2724", fg: "#6ed3c5", dot: "#33b7a8" },
    { id: "#1038", device: "MacBook Air", label: "In progress", bg: "#2e230f", fg: "#f0bd73", dot: "#e5a041" },
    { id: "#1029", device: "Galaxy S22", label: "On parts", bg: "#241d3a", fg: "#c6adf7", dot: "#a683f0" },
  ];

  return (
    <div aria-hidden="true" className="relative">
      <div className="rounded-xl border border-[#25272c] bg-[#0b0c0e] p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#25272c] pb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6c7079]">
            Shop display
          </p>
          <p className="rf-nums text-[13px] font-bold text-[#f1f2f4]">4:12 PM</p>
        </div>

        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center gap-3 rounded-md border border-[#25272c] bg-[#131417] px-3.5 py-3"
            >
              <span className="rf-nums shrink-0 text-[12px] font-bold text-[#6c7079]">
                {row.id}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#f1f2f4]">
                {row.device}
              </span>
              <span
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                style={{ background: row.bg, color: row.fg }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: row.dot }}
                />
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* the customer's half, overlapping the corner on wide screens */}
      <div className="mx-auto -mt-8 w-[85%] rounded-xl border border-border bg-surface p-4 shadow-xl sm:mr-0 sm:-mt-10 sm:w-[68%] lg:w-[74%]">
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
          vignette={<InvoiceVignette />}
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
