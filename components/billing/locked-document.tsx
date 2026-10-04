import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * "This invoice is paid, so it can't be changed."
 *
 * Shown in place of the edit screen for a document that is past changing (a
 * paid or void invoice, a quote that became an invoice), instead of silently
 * bouncing back to it: the person tapped Edit, so they get a reason in plain
 * words and one big button to where they can act.
 */
export function LockedDocument({
  title,
  reason,
  action,
}: {
  /** "Invoice #1012 is paid". */
  title: string;
  /** One or two sentences: why, and what to do instead. */
  reason: string;
  action: { label: string; href: string };
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
      <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-surface-hover text-muted-foreground">
        <Lock className="size-7" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{reason}</p>
      </div>
      <Button asChild className="h-14 w-full px-6 text-lg sm:w-auto">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </div>
  );
}

/** The calm note above the edit screen of a document the customer has already seen. */
export function AlreadySentNotice({ customerName, noun }: { customerName: string; noun: "invoice" | "estimate" }) {
  return (
    <p role="note" className="rounded-2xl border border-border bg-surface-hover px-4 py-3 text-base leading-snug text-foreground">
      <span className="font-semibold">Already sent to {customerName}.</span>{" "}
      <span className="text-muted-foreground">
        After you save, send the new copy from the {noun} so they have the right one.
      </span>
    </p>
  );
}
