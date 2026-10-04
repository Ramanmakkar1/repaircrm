"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Minus, PackageCheck, Plus, Printer, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
  receivePurchaseOrderAction,
  type PoActionState,
} from "@/app/(app)/inventory/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProductImage } from "./product-image";
import {
  bookInCount,
  bookInIssues,
  bookInQuantities,
  bookInResult,
  orderTheRestHref,
  outstandingLines,
  stillOwed,
  type BookInMode,
  type BookInResult,
  type ReceivableLine,
} from "./receive-flow";
import { SerialScanField } from "./serial-scan-field";
import { itemsWord } from "./stock-words";

export type { ReceivableLine } from "./receive-flow";

const EMPTY: PoActionState = {};

/** Every control in the sheet is a thumb-sized 48px or more, words beside icons. */
const BIG = "h-12 px-5 text-base [&_svg]:size-5";

/**
 * "Book in delivery": the moment a box turns into stock.
 *
 * A full-width sheet (a bottom sheet on a phone). Each line still owed is a
 * card with its picture. The common case is one tap: the black "Everything
 * arrived (7 items)" books in everything still owed. "Something is missing"
 * shows a big minus / plus on every card, already set to the full amount, so
 * only the short lines need touching. A serialized line asks for its serial
 * numbers with a big scan box and a "2 of 5 scanned" counter.
 *
 * Afterwards the sheet says what happened and offers the two next steps:
 * shelf labels for what came in, and "Order the rest" for anything that did
 * not. The form posts exactly what receivePurchaseOrderAction has always read
 * (`qty-<lineId>`, `serials-<lineId>`).
 *
 * `available` hides the trigger once nothing is owed, but the sheet stays
 * mounted, so the success screen survives the page refreshing behind it.
 * `defaultOpen` opens it on arrival (the list's "Book in delivery" button).
 */
export function ReceivePoDialog({
  purchaseOrderId,
  lines,
  trigger,
  available = true,
  defaultOpen = false,
  heading,
}: {
  purchaseOrderId: string;
  lines: ReceivableLine[];
  trigger: React.ReactNode;
  available?: boolean;
  defaultOpen?: boolean;
  /** "Order #1001 from Meridian", under the title. */
  heading?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const outstanding = outstandingLines(lines);

  const [open, setOpen] = React.useState(defaultOpen && available);
  const [mode, setMode] = React.useState<BookInMode>("all");
  const [counted, setCounted] = React.useState<Record<string, number>>(() => seed(outstanding));
  const [serials, setSerials] = React.useState<Record<string, string>>({});
  const [result, setResult] = React.useState<BookInResult | null>(null);
  const [tried, setTried] = React.useState(false);

  const [state, formAction, pending] = useActionState(
    async (previous: PoActionState, formData: FormData): Promise<PoActionState> => {
      const result = await receivePurchaseOrderAction(purchaseOrderId, previous, formData);
      if (result.ok) {
        // What was posted is what came in; the lines are the ones on screen when it was sent.
        const posted: Record<string, number> = {};
        for (const line of outstandingLines(lines)) posted[line.id] = Number(formData.get(`qty-${line.id}`) ?? 0) || 0;
        const done = bookInResult(lines, posted);
        setResult(done);
        setSerials({});
        toast.success(`Booked in ${itemsWord(done.items)}. Stock and costs are updated.`);
      }
      return result;
    },
    EMPTY,
  );

  const quantities = bookInQuantities(outstanding, mode, counted);
  const count = bookInCount(quantities);
  const issues = bookInIssues(outstanding, quantities, serials);
  const owedTotal = outstanding.reduce((sum, line) => sum + stillOwed(line), 0);
  const hasSerials = outstanding.some((line) => line.serialized);

  const change = (next: boolean) => {
    if (next) {
      setMode("all");
      setCounted(seed(outstanding));
      setSerials({});
      setResult(null);
      setTried(false);
    } else if (defaultOpen) {
      // Opened from the list's "Book in delivery": closing leaves the address clean.
      router.replace(pathname, { scroll: false });
    }
    setOpen(next);
  };

  const submitButton = (label: string) => (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={issues.length > 0 || undefined}
      onClick={(event) => {
        if (issues.length > 0) {
          event.preventDefault();
          setTried(true);
        }
      }}
      className={cn("h-14 w-full px-6 text-base sm:w-auto [&_svg]:size-5", issues.length > 0 && "opacity-60")}
    >
      <PackageCheck aria-hidden />
      {pending ? "Booking in…" : label}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={change}>
      {available ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-3xl"
        onOpenAutoFocus={(event) => {
          // Nothing should look pre-pressed: focus the sheet, not its first button.
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        {result ? (
          <Done result={result} onDone={() => change(false)} />
        ) : (
          <form action={formAction} className="flex flex-col">
            {outstanding.map((line) => (
              <input key={line.id} type="hidden" name={`qty-${line.id}`} value={String(quantities[line.id] ?? 0)} />
            ))}

            <div className="flex flex-col gap-4 p-5 pb-4">
              <DialogHeader>
                <DialogTitle className="text-2xl font-semibold tracking-tight">Book in delivery</DialogTitle>
                <DialogDescription className="text-base">
                  {heading ? `${heading}. ` : ""}Check the box against this list.
                </DialogDescription>
              </DialogHeader>

              {state.error ? (
                <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
                  {state.error}
                </p>
              ) : null}

              {mode === "all" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {submitButton(`Everything arrived (${itemsWord(owedTotal)})`)}
                  <Button type="button" variant="outline" className={cn(BIG, "h-14")} onClick={() => setMode("some")}>
                    Something is missing
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-hover px-4 py-3">
                  <p className="text-[15px] font-medium">Set how many of each actually came.</p>
                  <Button
                    type="button"
                    variant="outline"
                    className={BIG}
                    onClick={() => {
                      setMode("all");
                      setCounted(seed(outstanding));
                    }}
                  >
                    Everything arrived after all
                  </Button>
                </div>
              )}

              {(tried || (mode === "all" && hasSerials)) && issues.length > 0 ? (
                <div role="alert" className="flex flex-col gap-1 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
                  {issues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <ul className="flex flex-col gap-3 px-5 pb-5" aria-label="What is in the delivery">
              {outstanding.map((line) => {
                const owed = stillOwed(line);
                const qty = quantities[line.id] ?? 0;
                return (
                  <li key={line.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-4">
                      <ProductImage
                        productId={line.productId ?? undefined}
                        name={line.description}
                        category={line.category}
                        catalogImage={line.catalogImage}
                        imageUrl={line.imageUrl}
                        className="size-16 shrink-0 rounded-xl border border-border sm:size-20"
                        sizes="80px"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{line.description}</span>
                        <span className="text-[15px] text-muted-foreground">
                          {line.receivedQty > 0 ? `${owed} still to come (${line.receivedQty} already in)` : `${owed} coming`}
                        </span>
                      </div>
                      {mode === "all" ? (
                        <span className="rf-num shrink-0 text-2xl font-semibold tabular-nums" aria-label={`${owed} arriving`}>
                          {owed}
                        </span>
                      ) : null}
                    </div>

                    {mode === "some" ? (
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-medium text-muted-foreground">Arrived</span>
                        <Stepper
                          label={line.description}
                          value={qty}
                          max={owed}
                          onChange={(next) => setCounted((current) => ({ ...current, [line.id]: next }))}
                        />
                        <span className="text-[15px] text-muted-foreground">of {owed}</span>
                      </div>
                    ) : null}

                    {line.serialized && qty > 0 ? (
                      <SerialScanField
                        id={`serials-${line.id}`}
                        name={`serials-${line.id}`}
                        label={`Scan ${qty} serial ${qty === 1 ? "number" : "numbers"}`}
                        value={serials[line.id] ?? ""}
                        onChange={(next) => setSerials((current) => ({ ...current, [line.id]: next }))}
                        target={qty}
                        invalid={tried}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {/* Stays in view under a long delivery: the way out, and (when counting) the one black button. */}
            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="ghost" className={BIG} onClick={() => change(false)}>
                Cancel
              </Button>
              {mode === "some" ? submitButton(count === 0 ? "Book in" : `Book in ${itemsWord(count)}`) : null}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

/** After booking in: what happened, labels for what came, and "Order the rest". */
function Done({ result, onDone }: { result: BookInResult; onDone: () => void }) {
  const rest = orderTheRestHref(result.missing);
  const missingCount = result.missing.reduce((sum, line) => sum + line.count, 0);
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <CheckCircle2 aria-hidden className="size-12 text-foreground" strokeWidth={1.75} />
        <DialogTitle className="text-2xl font-semibold tracking-tight">Booked in</DialogTitle>
        <DialogDescription className="text-base">
          {itemsWord(result.items)} {result.items === 1 ? "is" : "are"} on the shelf. Stock and costs are updated.
        </DialogDescription>
      </div>

      {result.labels.length > 0 ? (
        <section aria-labelledby="book-in-labels" className="flex flex-col gap-2">
          <h3 id="book-in-labels" className="text-lg font-semibold">
            Print shelf labels
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {result.labels.map((label) => (
              <li key={label.productId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-[15px] font-medium [overflow-wrap:anywhere]">{label.name}</span>
                <Button variant="outline" asChild className={BIG}>
                  <Link href={`/print/labels/${label.productId}?count=${Math.min(30, label.count)}`}>
                    <Printer aria-hidden />
                    Print {label.count} {label.count === 1 ? "label" : "labels"}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {missingCount > 0 ? (
        <section aria-labelledby="book-in-missing" className="flex flex-col gap-2 rounded-2xl border border-border p-4">
          <h3 id="book-in-missing" className="text-lg font-semibold">
            Still to come: {itemsWord(missingCount)}
          </h3>
          <ul className="text-[15px] text-muted-foreground">
            {result.missing.map((line) => (
              <li key={`${line.productId ?? ""}${line.name}`}>
                {line.count} × {line.name}
              </li>
            ))}
          </ul>
          <p className="text-[15px] text-muted-foreground">This order stays open for them. If they are not coming, order them again.</p>
          {rest ? (
            <Button variant="outline" asChild className={cn(BIG, "self-start")}>
              <Link href={rest}>
                <ShoppingCart aria-hidden />
                Order the rest
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      <Button type="button" className="h-14 text-base" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

/** A big minus, the number, a big plus: 48px each, with words for screen readers. */
function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (next: number) => void }) {
  const step = "flex size-12 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={step} aria-label={`One fewer ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
        <Minus className="size-5" aria-hidden />
      </button>
      <span className="rf-num w-10 text-center text-2xl font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={step} aria-label={`One more ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}

function seed(lines: ReceivableLine[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lines) out[line.id] = stillOwed(line);
  return out;
}
