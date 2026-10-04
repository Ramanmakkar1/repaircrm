"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ExternalLink, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Label } from "@/components/ui/label";

/**
 * The boxes the check-in is made of. Every one is a real button with
 * aria-pressed, a tick when chosen (shape as well as colour), and a target well
 * over 48px. Same family as the Home PictureTile and the Sell screen's tiles.
 */

export const TILE =
  "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,transform] duration-150 " +
  "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function tone(selected: boolean) {
  return selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring";
}

export function Tick() {
  return (
    <span aria-hidden className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
      <Check className="size-4" strokeWidth={3} />
    </span>
  );
}

export function Caption({ title, detail }: { title: string; detail?: string }) {
  return (
    <span className="flex flex-col gap-0.5 px-2 pb-3 pt-2 sm:px-3">
      <span className="text-[15px] font-semibold leading-tight [overflow-wrap:anywhere] sm:text-base lg:text-sm">{title}</span>
      {detail ? <span className="text-[13px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{detail}</span> : null}
    </span>
  );
}

/**
 * The picture half of a box: a photo on its white canvas (shot on white in every theme), or a clear
 * icon in a soft square when there is no photo. Shared by the check-in tiles and by the editor in
 * Settings, so the owner sees exactly what staff will see.
 */
export function TileFace({ photo, icon: Icon }: { photo?: string | null; icon?: LucideIcon }) {
  if (photo) {
    return (
      <span className="relative block aspect-[3/2] w-full bg-white">
        <Image src={photo} alt="" fill sizes="(max-width: 640px) 45vw, 180px" className="object-contain p-1.5" />
      </span>
    );
  }
  return (
    <span className="flex aspect-[3/2] w-full items-center justify-center bg-surface-hover text-foreground">
      {Icon ? <Icon aria-hidden className="size-10" strokeWidth={1.5} /> : null}
    </span>
  );
}

/**
 * The box that opens a longer list in place ("More devices"). A disclosure, not a choice: it says
 * aria-expanded rather than aria-pressed, and never shows a tick.
 */
export function MoreTile({
  icon,
  title,
  detail,
  expanded,
  onClick,
  className,
  ...rest
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  expanded: boolean;
  onClick: () => void;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title">) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onClick} className={cn(TILE, "border-dashed border-border-strong hover:border-ring", "min-h-36", className)} {...rest}>
      <TileFace icon={icon} />
      <Caption title={title} detail={detail} />
    </button>
  );
}

/** A box with a photo on its white canvas (the photos are shot on white in every theme). */
export function PhotoTile({
  photo,
  title,
  detail,
  selected = false,
  onClick,
  className,
}: {
  photo: string;
  title: string;
  detail?: string;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn(TILE, tone(selected), "min-h-36", className)}>
      <TileFace photo={photo} />
      <Caption title={title} detail={detail} />
      {selected ? <Tick /> : null}
    </button>
  );
}

/** The same box with a clear icon in a soft square, for things with no photo. */
export function IconTile({
  icon: Icon,
  title,
  detail,
  selected = false,
  onClick,
  className,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cn(TILE, tone(selected), "min-h-36", className)}>
      <TileFace icon={Icon} />
      <Caption title={title} detail={detail} />
      {selected ? <Tick /> : null}
    </button>
  );
}

/** A plain big box with a name: brands, priorities, pickup times. */
export function TextTile({
  title,
  detail,
  selected = false,
  onClick,
  className,
}: {
  title: string;
  detail?: string;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(TILE, tone(selected), "min-h-14 items-center justify-center px-3 py-2 text-center", className)}
    >
      <span className="inline-flex items-center gap-1.5 text-base font-semibold leading-tight [overflow-wrap:anywhere] sm:text-lg">
        {selected ? <Check aria-hidden className="size-4 shrink-0" strokeWidth={3} /> : null}
        {title}
      </span>
      {detail ? <span className="text-[13px] leading-snug text-muted-foreground">{detail}</span> : null}
    </button>
  );
}

/** A smaller box for long lists (models, technicians). */
export function ChipButton({
  children,
  selected = false,
  onClick,
  className,
  id,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-ring",
        className,
      )}
    >
      {selected ? <Check aria-hidden className="size-4" strokeWidth={3} /> : null}
      {children}
    </button>
  );
}

/** A section inside a step: a quiet title and its content. */
export function Block({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** The one-line "show more" button: aria-expanded, never smaller than 48px. */
export function MoreToggle({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 text-left text-[15px] font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>{children}</span>
      <span aria-hidden className="text-lg leading-none text-muted-foreground">{open ? "−" : "+"}</span>
    </button>
  );
}

/** A label above one input, with a quiet hint under it. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[15px]">{label}</Label>
      {children}
      {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * What is wrong with this step, in plain words. Announced when it appears.
 * Put it at the TOP of the step, under the heading: on a phone anything below
 * the tiles is off screen. The scroll margins keep it clear of the fixed top
 * bar and the bottom bar when it is scrolled into view (data-issues is how the
 * check-in finds it).
 */
export function IssueLines({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      data-issues=""
      className="flex scroll-mt-28 scroll-mb-44 flex-col gap-1 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive"
    >
      {Array.from(new Set(messages)).map((message) => <p key={message}>{message}</p>)}
    </div>
  );
}

/**
 * The step's main button. On a phone the sticky bar carries "Next", so this one
 * only shows from the large layout up, where the summary sits to the side.
 */
export function NextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div className="hidden lg:block">
      <Button type="button" onClick={onClick} className="h-14 px-8 text-base">{children}</Button>
    </div>
  );
}

/**
 * A quiet link to Settings, Workflow, where the owner adds boxes. It opens in a new tab so the
 * repair being checked in is not lost.
 */
export function OwnerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      className="inline-flex min-h-12 items-center gap-1.5 self-start rounded-xl px-1 text-[15px] font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </Link>
  );
}
