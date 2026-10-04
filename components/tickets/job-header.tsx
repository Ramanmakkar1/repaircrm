import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Clock, MessageSquare, Phone, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetaChip } from "@/components/ui/record-card";
import { DeviceVisual } from "@/components/dashboard/device-visual";
import { asPriority } from "./ticket-meta";
import { phoneLinks, priorityWords } from "./job-screen-logic";
import type { DueWords } from "./repair-card-facts";

/**
 * The top of the Easy-mode repair screen: a big picture of the device, what it
 * is, where it stands, and who it is for, with the phone one tap away.
 *
 *   ← Repairs                                                  [ More ]
 *   [ picture ]  #1008 Lenovo ThinkPad T14 Gen 3
 *                ThinkPad T14 - pop-ups and browser redirects
 *                ● New   Due in 6h   Low priority
 *   ──────────────────────────────────────────────────────────────────
 *   Owen Fitzgerald      [ Call (512) 555-0189 ]  [ Text ]
 *
 * Everything is a word (status, due date, priority), the customer is a link and
 * the two phone buttons are siblings of it, never nested inside it. The picture
 * is the real intake photo when the shop took one, else the family picture for
 * the device (laptop, phone, console), else an icon.
 */
export function JobHeader({
  back,
  number,
  title,
  subject,
  deviceType,
  photoId,
  status,
  due,
  priority,
  customer,
  extras,
  more,
}: {
  back: { label: string; href: string };
  number: number;
  /** The device ("Lenovo ThinkPad T14 Gen 3"), or the subject when no device is on file. */
  title: string;
  /** What is wrong, when the title is the device. */
  subject?: string | null;
  /** The device type ("Laptop"), for the family picture. */
  deviceType?: string;
  /** The intake photo, when there is one. */
  photoId?: string;
  /** The live status badge. */
  status: React.ReactNode;
  due: DueWords | null;
  priority: string;
  customer: { id: string; name: string; phone?: string | null };
  /** Extra chips after the priority: the warranty claim, for one. */
  extras?: React.ReactNode;
  /** The `MoreActions` button. */
  more?: React.ReactNode;
}) {
  const phone = phoneLinks(customer.phone);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={back.href}
          data-touch-control
          className="inline-flex min-h-12 w-fit items-center gap-1.5 rounded-lg text-base font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-5 shrink-0" />
          {back.label}
        </Link>
        {more ? <div className="shrink-0">{more}</div> : null}
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface p-4 sm:gap-x-5 sm:p-5">
        <DeviceVisual
          label={title}
          type={deviceType ?? ""}
          photoId={photoId}
          className="size-24 self-start rounded-2xl sm:row-span-3 sm:size-32"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-balance break-words text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            <span className="rf-num">#{number}</span> {title}
          </h1>
          {subject ? <p className="text-base leading-snug text-muted-foreground">{subject}</p> : null}
        </div>

        {/* The state of it, all in words. Under the picture on a phone so the three fit one line. */}
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-2">
          {status}
          {due ? (
            <MetaChip icon={Clock} tone={due.alert ? "alert" : "neutral"}>
              {due.label}
            </MetaChip>
          ) : null}
          <MetaChip tone={asPriority(priority) === "URGENT" ? "alert" : "neutral"}>{priorityWords(priority)}</MetaChip>
          {extras}
        </div>

        {/* Who it is for, with the phone one tap away. */}
        <div className="col-span-2 flex flex-col gap-2 sm:col-span-1 sm:col-start-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
          <Link
            href={`/customers/${customer.id}`}
            data-touch-control
            className="inline-flex min-h-12 min-w-0 items-center gap-2 rounded-lg text-xl font-semibold text-accent-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <User aria-hidden className="size-5 shrink-0" />
            <span className="min-w-0 break-words">{customer.name}</span>
          </Link>
          {phone ? (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button asChild variant="outline" className="h-14 gap-3 px-4 text-base sm:h-12 [&_svg]:size-5">
                <a href={phone.tel} aria-label={`Call ${phone.display}`}>
                  <Phone aria-hidden />
                  <span className="flex flex-col items-start leading-tight sm:flex-row sm:items-center sm:gap-2">
                    <span>Call</span>
                    <span className="rf-num text-[13px] font-medium text-muted-foreground sm:text-base sm:text-foreground">{phone.display}</span>
                  </span>
                </a>
              </Button>
              <Button asChild variant="outline" className="h-14 px-4 text-base sm:h-12 [&_svg]:size-5">
                <a href={phone.sms} aria-label={`Text ${phone.display}`}>
                  <MessageSquare aria-hidden />
                  Text
                </a>
              </Button>
            </div>
          ) : (
            <span className="text-base text-muted-foreground">No phone on file</span>
          )}
        </div>
      </div>
    </header>
  );
}
