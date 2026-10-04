import * as React from "react";
import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ICONS } from "@/components/ui/icons";
import { smsHref, telHref } from "./customer-facts";
import { QuickTile } from "./quick-tile";

/**
 * The top of the customer screen in Easy mode, built like a register: who they
 * are (a big picture and name, the business under it), how to reach them (the
 * number as a very large tap-to-call button, a Text button beside it, the email
 * as a link), then ONE big black action, "New repair", beside four quick tiles:
 * New invoice, Book a visit, Message and More.
 *
 * Who they are and how to reach them sit side by side from `lg` (1024px) up; on
 * a portrait tablet there is not room for a name, an email and a 24px phone
 * number on one line, so the number gets a row of its own under them.
 *
 * One panel; the tiles are boxes in it, not cards in cards. No coloured edge.
 * On a phone the black button leaves the panel (`PinnedAction` keeps it above
 * the bottom bar) and the four tiles share one row. The panel is kept tight
 * there (the email link keeps its 48px tap area but not its 48px of height),
 * because the summary and the section tabs have to start on the first screen.
 *
 * `messageMenu` and `moreMenu` are the two tiles that open a menu; the page
 * passes them in, which keeps this file free of client code.
 */
export function CustomerHeader({
  visual,
  name,
  business,
  phone,
  email,
  detailsHref,
  newRepairHref,
  newInvoiceHref,
  bookHref,
  messageMenu,
  moreMenu,
}: {
  /** InitialsVisual (or IconVisual for a number-only customer). */
  visual: React.ReactNode;
  name: string;
  /** The business name, when there is one. */
  business?: string | null;
  /** Dialled on tap; nothing renders without one. */
  phone: string | null;
  email: string | null;
  /** Where "Add a phone number" goes when there is neither number nor email. */
  detailsHref: string;
  newRepairHref: string;
  newInvoiceHref: string;
  bookHref: string;
  messageMenu: React.ReactNode;
  moreMenu: React.ReactNode;
}) {
  return (
    <section aria-label="Customer" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-3 sm:gap-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <span className="shrink-0">{visual}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="min-w-0 text-balance break-words text-2xl font-semibold leading-tight tracking-tight sm:text-4xl">{name}</h1>
            {business ? <p className="break-words text-lg leading-snug text-muted-foreground">{business}</p> : null}
            {email ? (
              <a
                href={`mailto:${email}`}
                data-touch-control
                className="inline-flex min-h-12 max-w-full items-center gap-2 text-base font-medium text-accent-soft-foreground hover:underline max-sm:-my-3"
              >
                <Mail className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{email}</span>
              </a>
            ) : null}
          </div>
        </div>

        {phone ? (
          // On a narrow phone the number needs its full width, so Text drops to the next line rather than squeezing it.
          <div className="flex flex-wrap items-stretch gap-3 lg:shrink-0 lg:flex-nowrap">
            <a
              href={telHref(phone)}
              data-touch-control
              aria-label={`Call ${phone}`}
              className="rf-num inline-flex min-h-16 min-w-[12.5rem] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-accent-soft px-3 text-xl font-semibold text-accent-soft-foreground transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:px-5 sm:text-2xl lg:flex-none"
            >
              <Phone className="size-5 shrink-0 sm:size-6" aria-hidden />
              <span className="truncate">{phone}</span>
            </a>
            <a
              href={smsHref(phone)}
              data-touch-control
              aria-label={`Text ${phone}`}
              className="inline-flex min-h-16 shrink-0 items-center gap-2 rounded-2xl border border-border bg-surface-hover px-4 text-lg font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
            >
              <MessageCircle className="size-6 shrink-0 text-accent-soft-foreground" aria-hidden />
              Text
            </a>
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 text-base text-muted-foreground lg:max-w-xs lg:justify-end lg:text-right">
            No phone number yet.
            <Link
              href={detailsHref}
              data-touch-control
              className="inline-flex min-h-12 items-center font-semibold text-accent-soft-foreground hover:underline"
            >
              Add a phone number
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] sm:gap-3">
        <Button
          size="lg"
          className="h-20 w-full flex-col gap-1.5 rounded-2xl text-lg max-sm:hidden [&_svg]:size-6"
          asChild
        >
          <Link href={newRepairHref}>
            <ICONS.ticket aria-hidden />
            New repair
          </Link>
        </Button>
        <QuickTile href={newInvoiceHref} icon={ICONS.invoice}>
          New invoice
        </QuickTile>
        <QuickTile href={bookHref} icon={ICONS.appointment}>
          Book a visit
        </QuickTile>
        {messageMenu}
        {moreMenu}
      </div>
    </section>
  );
}

/**
 * Phone only: the one black button, fixed at the bottom of the screen just
 * above the app's tab bar (4rem tall, and gone from `sm` up) while the sections
 * scroll under it. <main> keeps 7rem of bottom padding, so the last of the page
 * is never hidden behind it. From a tablet up the same action is the big black
 * tile in the header.
 */
export function PinnedAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Next step"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-border-strong bg-surface py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:hidden print:hidden"
    >
      <Button size="lg" className="h-14 w-full text-lg" asChild>
        <Link href={href}>
          <ICONS.ticket className="size-6" aria-hidden />
          {children}
        </Link>
      </Button>
    </div>
  );
}
