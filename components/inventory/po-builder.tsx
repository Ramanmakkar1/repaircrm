"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Check, ChevronUp, Minus, PackageSearch, Pencil, Plus, Store, Tag, Trash2, TriangleAlert } from "lucide-react";

import { createPurchaseOrderAction, type PoFormState } from "@/app/(app)/inventory/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ACTIONS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InitialsVisual } from "@/components/ui/record-card";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/money";
import { ProductImage } from "./product-image";
import {
  PO_LAST_STEP,
  PO_STEPS,
  addLowItems,
  addOneOff,
  addProduct,
  draftFields,
  draftIssues,
  draftTotals,
  firstTapQuantity,
  initialDraft,
  initialStep,
  lowItemsFor,
  moneyText,
  parseMoneyText,
  productsForSupplier,
  quantityOf,
  removeLine,
  searchProducts,
  setCost,
  setProductQuantity,
  setQuantity,
  stockLine,
  summaryWords,
  type PoBuilderProduct,
  type PoBuilderVendor,
  type PoDraft,
  type PoLine,
} from "./po-flow";

/** More than this on screen is a search job, not a looking job. */
const SHOWN = 120;

const STEP_BUTTON =
  "flex size-12 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/**
 * The Easy-mode "New order" screen, built like New repair and New invoice:
 * one decision at a time (1 Supplier, 2 Items, 3 Check), a live "This order"
 * panel beside the choices (a bar above the tab bar on a phone), and one big
 * black "Place order" with a quieter "Save as draft".
 *
 * No supplier is chosen for you: the screen opens on the supplier tiles unless
 * the address named one on purpose (a supplier's own "New order" button, or
 * "Order more" on a stock card).
 *
 * Everything reaches the server as hidden fields (see draftFields), the same
 * fields the old form posted to createPurchaseOrderAction, plus `intent`.
 */
export function PoBuilder({
  vendors,
  products,
  initialVendorId,
  add,
  header,
}: {
  vendors: PoBuilderVendor[];
  products: PoBuilderProduct[];
  initialVendorId?: string;
  /** `?add=productId:qty,...` from "Order more" / "Order the rest". */
  add?: string;
  /** The page title block, drawn at the top of the choices. */
  header?: React.ReactNode;
}) {
  const [server, formAction, pending] = useActionState<PoFormState, FormData>(createPurchaseOrderAction, undefined);
  const [start] = React.useState(() => initialDraft({ vendorId: initialVendorId, add, vendors, products }));
  const [draft, setDraft] = React.useState<PoDraft>(start);
  const [step, setStep] = React.useState(() => initialStep(start));
  const [refused, setRefused] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [oneOffOpen, setOneOffOpen] = React.useState(false);
  const [costKey, setCostKey] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const vendor = vendors.find((option) => option.id === draft.vendorId) ?? null;
  const totals = draftTotals(draft);
  const issues = draftIssues(draft);
  const stepIssues = refused ? issues.filter((issue) => issue.step === step) : [];

  // React resets a <form action> after it settles; every field here is held in state, so the
  // reset would only blank what is on screen. Cancel it (the same guard the bill builder uses).
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const keep = (event: Event) => event.preventDefault();
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, []);

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    headingRef.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [step]);

  const goTo = (next: number) => {
    setRefused(false);
    setStep(Math.max(0, Math.min(PO_LAST_STEP, next)));
  };

  function goNext() {
    if (issues.some((issue) => issue.step === step)) {
      setRefused(true);
      return;
    }
    goTo(step + 1);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (event.target !== event.currentTarget) return;
    const first = issues[0];
    if (pending || first) {
      event.preventDefault();
      if (first) {
        setStep(first.step);
        setRefused(true);
      }
    }
  }

  // Enter in a box (the search, a scanner) never places an order.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
  }

  const update = (next: PoDraft, message?: string) => {
    setDraft(next);
    if (message) setStatus(message);
  };

  const editing = costKey ? (draft.lines.find((line) => line.key === costKey) ?? null) : null;
  const totalLabel = formatCents(totals.totalCents);

  const panelProps = {
    draft,
    vendor,
    products,
    totals,
    pending,
    onChangeSupplier: () => goTo(0),
    onQuantity: (key: string, quantity: number) => update(setQuantity(draft, key, quantity)),
    onRemove: (line: PoLine) => update(removeLine(draft, line.key), `Took ${line.description} off the order.`),
    onCost: (key: string) => setCostKey(key),
    onShipping: (cents: number) => setDraft((current) => ({ ...current, shippingCents: cents })),
  };

  return (
    <>
      <form ref={formRef} action={formAction} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-5">
        {draftFields(draft).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-5">
            {header}
            <Stepper step={step} draft={draft} vendor={vendor} onStep={goTo} />

            {server?.error ? (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{server.error}</span>
              </div>
            ) : null}

            <section aria-labelledby="po-step-heading" className="flex flex-col gap-5">
              <div>
                <h2 id="po-step-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
                  {PO_STEPS[step].title}
                </h2>
                <p className="text-base text-muted-foreground">{PO_STEPS[step].hint}</p>
              </div>

              {stepIssues.length > 0 ? (
                <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
                  {stepIssues.map((issue) => (
                    <p key={issue.message}>{issue.message}</p>
                  ))}
                </div>
              ) : null}

              {step === 0 ? (
                <SupplierStep
                  vendors={vendors}
                  products={products}
                  chosen={draft.vendorId}
                  onChoose={(id) => {
                    setDraft((current) => ({ ...current, vendorId: id }));
                    setStatus(`Ordering from ${vendors.find((option) => option.id === id)?.name ?? "this supplier"}.`);
                    goTo(1);
                  }}
                />
              ) : null}

              {step === 1 ? (
                <ItemsStep
                  draft={draft}
                  vendor={vendor}
                  products={products}
                  onAdd={(product, quantity) =>
                    update(addProduct(draft, product, quantity), `Added ${quantity} × ${product.name}.`)
                  }
                  onSetQuantity={(product, quantity) => update(setProductQuantity(draft, product, quantity))}
                  onAddLow={() => {
                    const result = addLowItems(draft, products);
                    update(result.draft, result.added > 0 ? `Added ${result.added} running-low ${result.added === 1 ? "item" : "items"}.` : "Every low item is already on the order.");
                  }}
                  onOneOff={() => setOneOffOpen(true)}
                />
              ) : null}

              {step === 2 ? (
                <CheckStep
                  draft={draft}
                  onDate={(value) => setDraft((current) => ({ ...current, expectedAt: value }))}
                  onNotes={(value) => setDraft((current) => ({ ...current, notes: value }))}
                  phonePanel={<OrderPanel {...panelProps} idPrefix="check" showActions={false} />}
                />
              ) : null}

              <p role="status" aria-live="polite" className="sr-only">
                {status}
              </p>

              {step < PO_LAST_STEP ? (
                <div className="hidden lg:block">
                  <Button type="button" onClick={goNext} className="h-14 px-8 text-base">
                    Next: {PO_STEPS[step + 1].label}
                  </Button>
                </div>
              ) : null}
            </section>
          </div>

          <aside aria-label="This order" className="hidden lg:sticky lg:top-2 lg:block">
            <OrderPanel {...panelProps} idPrefix="aside" showActions className="lg:max-h-[calc(100dvh-7rem)]" />
          </aside>
        </div>

        {/* The phone's version of the panel: one line of what is on the order and the one button. */}
        <div
          role="region"
          aria-label="This order"
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border-strong bg-surface py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:bottom-0 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] sm:pr-24 lg:hidden print:hidden"
        >
          <button
            type="button"
            onClick={() => (draft.lines.length > 0 && step !== PO_LAST_STEP ? setSheetOpen(true) : undefined)}
            className="-my-1 flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={draft.lines.length > 0 ? "Show what is on this order" : undefined}
          >
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              Step {step + 1} of {PO_LAST_STEP + 1}
              {draft.lines.length > 0 && step !== PO_LAST_STEP ? (
                <>
                  <span aria-hidden>·</span> Tap to see items <ChevronUp aria-hidden className="size-3.5" />
                </>
              ) : null}
            </span>
            <span className={cn("text-[15px] font-semibold", stepIssues[0] ? "line-clamp-2 leading-snug text-destructive" : "truncate")}>
              {stepIssues[0]?.message ?? summaryWords(draft, totalLabel)}
            </span>
          </button>
          {step === PO_LAST_STEP ? (
            <div className="flex shrink-0 gap-2">
              <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending} className="h-14 px-3 text-[15px]">
                Save draft
              </Button>
              <Button type="submit" name="intent" value="place" disabled={pending} className="h-14 px-4 text-base">
                {pending ? "Saving…" : "Place order"}
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={goNext} className="h-14 shrink-0 px-8 text-base">
              Next
            </Button>
          )}
        </div>
      </form>

      <OneOffDialog
        open={oneOffOpen}
        onOpenChange={setOneOffOpen}
        onAdd={(item) => update(addOneOff(draft, item), `Added ${item.quantity} × ${item.description}.`)}
      />

      <CostDialog
        line={editing}
        onClose={() => setCostKey(null)}
        onSave={(cents) => {
          if (editing) update(setCost(draft, editing.key, cents), `${editing.description} now costs ${formatCents(cents)} each.`);
        }}
      />

      {/* The phone's "what is on this order", from any step. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          className="max-h-[92dvh] overflow-y-auto"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg">This order</DialogTitle>
            <DialogDescription className="text-[15px]">Change how many, or take something off.</DialogDescription>
          </DialogHeader>
          <OrderPanel {...panelProps} idPrefix="sheet" showActions={false} className="border-0 p-0" onChangeSupplier={() => { setSheetOpen(false); goTo(0); }} />
          <DialogFooter>
            <Button type="button" className="h-12 w-full px-8 text-base sm:w-auto" onClick={() => setSheetOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

/** 1 Supplier, 2 Items, 3 Check. Never locked; the current one is filled AND carries aria-current. */
function Stepper({ step, draft, vendor, onStep }: { step: number; draft: PoDraft; vendor: PoBuilderVendor | null; onStep: (next: number) => void }) {
  const count = draft.lines.reduce((sum, line) => sum + line.quantity, 0);
  const done = [Boolean(vendor), draft.lines.length > 0, false];
  const text = [vendor?.name ?? null, count > 0 ? `${count} ${count === 1 ? "item" : "items"}` : null, null];
  return (
    <nav aria-label="New order steps">
      <ol className="grid grid-cols-3 gap-2">
        {PO_STEPS.map((item, index) => {
          const current = index === step;
          return (
            <li key={item.label} className="min-w-0">
              <button
                type="button"
                onClick={() => onStep(index)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-full min-h-14 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors sm:flex-row sm:justify-start sm:gap-2 sm:px-3 sm:text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground hover:border-ring",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    current ? "bg-accent-foreground text-accent" : done[index] ? "bg-accent-soft text-accent-soft-foreground" : "bg-surface-hover text-muted-foreground",
                  )}
                >
                  {done[index] && !current ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span className="flex min-w-0 max-w-full flex-col">
                  <span className="truncate text-[13px] font-semibold leading-tight sm:text-[15px]">
                    {item.label}
                    {done[index] && !current ? <span className="sr-only"> (done)</span> : null}
                  </span>
                  {text[index] ? (
                    <span className={cn("hidden truncate text-[13px] leading-tight sm:block", current ? "text-accent-foreground/80" : "text-muted-foreground")}>
                      {text[index]}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Step 1: the suppliers as big tiles with their initials. Nothing is chosen until someone taps one. */
function SupplierStep({
  vendors,
  products,
  chosen,
  onChoose,
}: {
  vendors: PoBuilderVendor[];
  products: PoBuilderProduct[];
  chosen: string;
  onChoose: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {vendors.map((vendor) => {
        const selected = vendor.id === chosen;
        const mine = products.filter((product) => product.vendorId === vendor.id);
        const low = mine.filter((product) => product.low).length;
        const detail = [`${mine.length} ${mine.length === 1 ? "part" : "parts"}`, low > 0 ? `${low} running low` : null].filter(Boolean).join(" · ");
        return (
          <button
            key={vendor.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChoose(vendor.id)}
            className={cn(
              "relative flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border bg-surface p-4 text-center transition-[border-color,transform] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
            )}
          >
            <InitialsVisual name={vendor.name} className="size-14 text-lg sm:size-16 sm:text-xl" />
            <span className="text-base font-semibold leading-tight [overflow-wrap:anywhere]">{vendor.name}</span>
            <span className="text-[13px] leading-snug text-muted-foreground">{detail}</span>
            {selected ? (
              <span aria-hidden className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
                <Check className="size-4" strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
      })}
      <Link
        href="/inventory/vendors"
        className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong bg-surface p-4 text-center text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Store aria-hidden className="size-8" strokeWidth={1.6} />
        <span className="text-base font-semibold">Add a supplier</span>
        <span className="text-[13px]">Opens your supplier list</span>
      </Link>
    </div>
  );
}

/** Step 2: product pictures with a big minus / plus, and the pinned "Running low" tile. */
function ItemsStep({
  draft,
  vendor,
  products,
  onAdd,
  onSetQuantity,
  onAddLow,
  onOneOff,
}: {
  draft: PoDraft;
  vendor: PoBuilderVendor | null;
  products: PoBuilderProduct[];
  onAdd: (product: PoBuilderProduct, quantity: number) => void;
  onSetQuantity: (product: PoBuilderProduct, quantity: number) => void;
  onAddLow: () => void;
  onOneOff: () => void;
}) {
  const { mine, others } = React.useMemo(() => productsForSupplier(products, draft.vendorId), [products, draft.vendorId]);
  const [scope, setScope] = React.useState<"mine" | "all">(mine.length > 0 ? "mine" : "all");
  const [query, setQuery] = React.useState("");
  const needle = query.trim();
  const pool = needle || scope === "all" ? [...mine, ...others] : mine;
  const visible = searchProducts(pool, needle);
  const low = lowItemsFor(products, draft.vendorId);
  const lowLeft = low.filter((product) => quantityOf(draft, product.id) === 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <ACTIONS.search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          name="po-search"
          autoComplete="off"
          spellCheck={false}
          type="search"
          enterKeyHint="search"
          aria-label="Search products"
          placeholder="Search name or code…"
          className="h-14 w-full rounded-xl border border-border-strong bg-surface pl-12 pr-4 text-base font-medium text-foreground outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {vendor && mine.length > 0 ? (
          <ScopeButton active={scope === "mine" && !needle} onClick={() => setScope("mine")}>
            From {vendor.name} ({mine.length})
          </ScopeButton>
        ) : null}
        <ScopeButton active={scope === "all" || Boolean(needle) || mine.length === 0} onClick={() => setScope("all")}>
          Everything ({products.length})
        </ScopeButton>
        <Button type="button" variant="outline" className="h-12 px-4 text-[15px]" onClick={onOneOff}>
          <Plus aria-hidden />
          Something not in the list
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {low.length > 0 && !needle ? (
          <button
            type="button"
            onClick={onAddLow}
            disabled={lowLeft === 0}
            aria-label={lowLeft > 0 ? `Running low: add all ${lowLeft} at their usual amounts` : "Every running-low item is on the order"}
            className={cn(
              "flex min-h-12 flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,transform] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:active:scale-100",
              lowLeft === 0 ? "border-accent ring-1 ring-accent" : "border-border-strong hover:border-ring",
            )}
          >
            <span className="flex aspect-[3/2] w-full items-center justify-center bg-surface-hover">
              {lowLeft === 0 ? <Check aria-hidden className="size-10" strokeWidth={2.5} /> : <TriangleAlert aria-hidden className="size-10" strokeWidth={1.6} />}
            </span>
            <span className="flex flex-1 flex-col gap-1 p-3">
              <span className="text-base font-semibold leading-tight">Running low ({low.length})</span>
              <span className="text-[13px] leading-snug text-muted-foreground">
                {lowLeft === 0 ? "All added" : `Adds ${lowLeft === low.length ? "all of them" : `the other ${lowLeft}`} at the usual amounts`}
              </span>
            </span>
          </button>
        ) : null}

        {visible.slice(0, SHOWN).map((product) => (
          <ProductTile
            key={product.id}
            product={product}
            quantity={quantityOf(draft, product.id)}
            onAdd={() => onAdd(product, firstTapQuantity(product))}
            onSet={(quantity) => onSetQuantity(product, quantity)}
          />
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-10 text-center">
          <PackageSearch aria-hidden className="size-8 text-faint-foreground" />
          <p className="text-base font-semibold">{products.length === 0 ? "No products yet" : "Nothing here matches"}</p>
          <p className="text-sm text-muted-foreground">Use “Something not in the list” to order it anyway.</p>
        </div>
      ) : null}
      {visible.length > SHOWN ? <p className="text-sm text-muted-foreground">Showing the first {SHOWN}. Search to find the rest.</p> : null}
    </div>
  );
}

function ScopeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-12 items-center rounded-xl border px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * A product as a picture tile: photo, name, what is left, what it costs. Before
 * it is on the order a big "Add" (its usual amount when it is low); after, a
 * big minus / plus with the number between, and "On the order" in words.
 */
function ProductTile({
  product,
  quantity,
  onAdd,
  onSet,
}: {
  product: PoBuilderProduct;
  quantity: number;
  onAdd: () => void;
  onSet: (quantity: number) => void;
}) {
  const added = quantity > 0;
  const firstTap = firstTapQuantity(product);
  return (
    <div className={cn("flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface", added ? "border-accent ring-1 ring-accent" : "border-border")}>
      <button
        type="button"
        onClick={onAdd}
        aria-label={added ? `Add one more ${product.name} (${quantity} on the order)` : `Add ${firstTap} × ${product.name}`}
        className="relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ProductImage
          productId={product.id}
          name={product.name}
          category={product.category}
          catalogImage={product.catalogImage}
          imageUrl={product.imageUrl}
          className="aspect-[3/2] w-full rounded-none bg-white p-1"
          sizes="(max-width: 639px) 44vw, (max-width: 1023px) 30vw, 180px"
        />
        {added ? (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[13px] font-semibold tabular-nums text-accent-foreground shadow-sm">
            <Check aria-hidden className="size-3.5" strokeWidth={3} />
            {quantity} on the order
          </span>
        ) : product.low ? (
          <span className="absolute left-1.5 top-1.5 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-[13px] font-semibold text-foreground shadow-sm">
            Running low
          </span>
        ) : null}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 min-h-[2.5rem] text-[14px] font-semibold leading-5 [overflow-wrap:anywhere]">{product.name}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">{stockLine(product)}</span>
        <span className="text-[15px] font-bold tabular-nums">{product.costCents != null ? `${formatCents(product.costCents)} each` : "No cost yet"}</span>
      </div>
      <div className="border-t border-border p-2">
        {added ? (
          <div className="flex items-center justify-between gap-1">
            <button type="button" className={STEP_BUTTON} aria-label={`One fewer ${product.name}`} onClick={() => onSet(quantity - 1)}>
              <Minus className="size-5" aria-hidden />
            </button>
            <span className="rf-num min-w-8 text-center text-xl font-semibold tabular-nums" aria-live="polite">
              {quantity}
            </span>
            <button type="button" className={STEP_BUTTON} aria-label={`One more ${product.name}`} onClick={() => onSet(quantity + 1)}>
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={onAdd} tabIndex={-1} aria-hidden>
            <Plus aria-hidden />
            {firstTap > 1 ? `Add ${firstTap}` : "Add"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Step 3 (the panel itself sits beside it on a wide screen): when it arrives and a note for the supplier. */
function CheckStep({
  draft,
  onDate,
  onNotes,
  phonePanel,
}: {
  draft: PoDraft;
  onDate: (value: string) => void;
  onNotes: (value: string) => void;
  phonePanel: React.ReactNode;
}) {
  const [noteOpen, setNoteOpen] = React.useState(draft.notes !== "");
  return (
    <div className="flex flex-col gap-5">
      <div className="lg:hidden">{phonePanel}</div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="po-expected" className="text-base font-semibold">
          When will it arrive? <span className="font-normal text-muted-foreground">(if they said)</span>
        </Label>
        <Input id="po-expected" type="date" value={draft.expectedAt} onChange={(event) => onDate(event.target.value)} className="h-12 max-w-xs text-base" />
      </div>

      {noteOpen ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="po-notes" className="text-base font-semibold">
            Note to the supplier
          </Label>
          <Textarea
            id="po-notes"
            rows={3}
            maxLength={2000}
            value={draft.notes}
            onChange={(event) => onNotes(event.target.value)}
            placeholder="Ship to the shop. Call before delivery."
            className="text-base"
          />
        </div>
      ) : (
        <Button type="button" variant="outline" className="h-12 self-start px-4 text-[15px]" onClick={() => setNoteOpen(true)}>
          <Pencil aria-hidden />
          Add a note for the supplier
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The live panel
// ---------------------------------------------------------------------------

/**
 * "This order", live: who it is for (with Change), every line with a big minus
 * and plus, "Add shipping" tucked away until wanted, the total, and the two
 * buttons: black "Place order" and a quieter "Save as draft". Only the lines
 * scroll; the total and the buttons stay in view.
 */
function OrderPanel({
  draft,
  vendor,
  products,
  totals,
  pending,
  showActions,
  idPrefix,
  className,
  onChangeSupplier,
  onQuantity,
  onRemove,
  onCost,
  onShipping,
}: {
  draft: PoDraft;
  vendor: PoBuilderVendor | null;
  products: PoBuilderProduct[];
  totals: ReturnType<typeof draftTotals>;
  pending: boolean;
  showActions: boolean;
  idPrefix: string;
  className?: string;
  onChangeSupplier: () => void;
  onQuantity: (key: string, quantity: number) => void;
  onRemove: (line: PoLine) => void;
  onCost: (key: string) => void;
  onShipping: (cents: number) => void;
}) {
  const [shippingOpen, setShippingOpen] = React.useState(draft.shippingCents > 0);
  const [shippingText, setShippingText] = React.useState(draft.shippingCents > 0 ? moneyText(draft.shippingCents) : "");
  const count = draft.lines.reduce((sum, line) => sum + line.quantity, 0);
  const shippingBad = shippingOpen && parseMoneyText(shippingText) === null;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4", className)}>
      <div className="flex min-h-12 shrink-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-tight">
            This order
            {count > 0 ? (
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[13px] font-semibold tabular-nums text-accent-soft-foreground">
                {count} {count === 1 ? "item" : "items"}
              </span>
            ) : null}
          </h2>
          <p className="truncate text-[15px] leading-snug text-muted-foreground">
            {vendor ? (
              <>
                From <span className="font-semibold text-foreground">{vendor.name}</span>
              </>
            ) : (
              "No supplier yet"
            )}
          </p>
        </div>
        <Button type="button" variant="outline" className="h-12 shrink-0 px-4 text-[15px]" onClick={onChangeSupplier}>
          {vendor ? "Change" : "Choose"}
        </Button>
      </div>

      <div className="flex min-h-[5.5rem] flex-1 flex-col overflow-y-auto border-t border-border">
        {draft.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-6 text-center">
            <p className="text-[16px] font-semibold">Nothing here yet</p>
            <p className="text-[14px] leading-snug text-muted-foreground">Tap a picture to add it.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {draft.lines.map((line) => {
              const product = line.productId ? products.find((option) => option.id === line.productId) : undefined;
              return (
                <li key={line.key} className="flex gap-3 py-2">
                  {product ? (
                    <ProductImage
                      productId={product.id}
                      name={product.name}
                      category={product.category}
                      catalogImage={product.catalogImage}
                      imageUrl={product.imageUrl}
                      className="mt-0.5 size-10 shrink-0 rounded-md"
                      sizes="40px"
                    />
                  ) : (
                    <span aria-hidden className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-hover text-muted-foreground">
                      <Tag className="size-5" />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{line.description}</span>
                      <span className="shrink-0 text-[15px] font-bold tabular-nums">{formatCents(line.quantity * line.unitCostCents)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCost(line.key)}
                      className="flex min-h-10 items-center gap-1.5 self-start text-[14px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Change what ${line.description} costs (${formatCents(line.unitCostCents)} each)`}
                    >
                      <span className="tabular-nums">{formatCents(line.unitCostCents)} each</span>
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <div className="flex items-center gap-1">
                      <button type="button" className={STEP_BUTTON} aria-label={`Fewer ${line.description}`} onClick={() => onQuantity(line.key, line.quantity - 1)}>
                        <Minus className="size-5" aria-hidden />
                      </button>
                      <span className="w-10 text-center text-[17px] font-bold tabular-nums">{line.quantity}</span>
                      <button type="button" className={STEP_BUTTON} aria-label={`More ${line.description}`} onClick={() => onQuantity(line.key, line.quantity + 1)}>
                        <Plus className="size-5" aria-hidden />
                      </button>
                      <span className="min-w-0 flex-1" />
                      <button
                        type="button"
                        onClick={() => onRemove(line)}
                        aria-label={`Take ${line.description} off the order`}
                        className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <Trash2 className="size-5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-3">
        {shippingOpen ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${idPrefix}-shipping`} className="text-[15px]">
              Shipping
            </Label>
            <div className="relative w-36">
              <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                $
              </span>
              <Input
                id={`${idPrefix}-shipping`}
                inputMode="decimal"
                value={shippingText}
                aria-invalid={shippingBad || undefined}
                onChange={(event) => {
                  setShippingText(event.target.value);
                  const cents = parseMoneyText(event.target.value);
                  if (cents !== null) onShipping(cents);
                }}
                onBlur={() => {
                  const cents = parseMoneyText(shippingText);
                  if (cents !== null) setShippingText(cents > 0 ? moneyText(cents) : "");
                }}
                placeholder="0.00"
                className="h-12 pl-7 text-right text-base tabular-nums"
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShippingOpen(true)}
            className="flex min-h-12 items-center gap-1.5 self-start text-[15px] font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-4" aria-hidden />
            Add shipping
          </button>
        )}
        {shippingBad ? <p className="text-[14px] font-medium text-destructive">Type the shipping like 12.50.</p> : null}

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] text-muted-foreground">
            Parts {formatCents(totals.subtotalCents)}
            {totals.shippingCents > 0 ? ` · shipping ${formatCents(totals.shippingCents)}` : ""}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-base font-semibold">Total</span>
          <span className="rf-num text-[28px] font-bold leading-none tabular-nums tracking-tight">{formatCents(totals.totalCents)}</span>
        </div>

        {showActions ? (
          <div className="flex flex-col gap-2 pt-1">
            <Button type="submit" name="intent" value="place" disabled={pending} className="h-14 w-full text-base">
              {pending ? "Saving…" : "Place order"}
            </Button>
            <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending} className="h-12 w-full text-base">
              Save as draft
            </Button>
            <p className="text-center text-[13px] text-muted-foreground">Place order marks it as sent to the supplier. A draft waits for you.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small windows (drawn outside the form, so nothing in them posts)
// ---------------------------------------------------------------------------

function OneOffDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: { description: string; quantity: number; unitCostCents: number }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open ? <OneOffBody onAdd={(item) => { onAdd(item); onOpenChange(false); }} onCancel={() => onOpenChange(false)} /> : null}</DialogContent>
    </Dialog>
  );
}

function OneOffBody({ onAdd, onCancel }: { onAdd: (item: { description: string; quantity: number; unitCostCents: number }) => void; onCancel: () => void }) {
  const [description, setDescription] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [cost, setCost] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    if (!description.trim()) return setError("Say what you are ordering.");
    const cents = parseMoneyText(cost);
    if (cents === null) return setError("Type the cost like 12.50.");
    onAdd({ description: description.trim(), quantity, unitCostCents: cents });
  };

  return (
    <div
      className="grid gap-4"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg">Something not in the list</DialogTitle>
        <DialogDescription className="text-[15px]">A part you have not added to your stock yet.</DialogDescription>
      </DialogHeader>
      {error ? (
        <p role="alert" className="text-[15px] font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="po-oneoff-name" className="text-[15px]">
          What is it?
        </Label>
        <Input id="po-oneoff-name" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Galaxy S22 back glass" className="h-12 text-base" autoFocus maxLength={300} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-medium">How many?</span>
          <div className="flex items-center gap-2">
            <button type="button" className={STEP_BUTTON} aria-label="One fewer" disabled={quantity <= 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              <Minus className="size-5" aria-hidden />
            </button>
            <span className="w-10 text-center text-xl font-semibold tabular-nums" aria-live="polite">
              {quantity}
            </span>
            <button type="button" className={STEP_BUTTON} aria-label="One more" onClick={() => setQuantity((q) => Math.min(100_000, q + 1))}>
              <Plus className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="po-oneoff-cost" className="text-[15px]">
            Cost each
          </Label>
          <div className="relative w-36">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
              $
            </span>
            <Input id="po-oneoff-cost" inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0.00" className="h-12 pl-7 text-right text-base tabular-nums" />
          </div>
        </div>
      </div>
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="ghost" className="h-12 px-5 text-base" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="h-12 px-6 text-base" onClick={submit}>
          Add to order
        </Button>
      </DialogFooter>
    </div>
  );
}

function CostDialog({ line, onClose, onSave }: { line: PoLine | null; onClose: () => void; onSave: (cents: number) => void }) {
  return (
    <Dialog open={line !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>{line ? <CostBody key={line.key} line={line} onCancel={onClose} onSave={(cents) => { onSave(cents); onClose(); }} /> : null}</DialogContent>
    </Dialog>
  );
}

function CostBody({ line, onCancel, onSave }: { line: PoLine; onCancel: () => void; onSave: (cents: number) => void }) {
  const [text, setText] = React.useState(moneyText(line.unitCostCents));
  const cents = parseMoneyText(text);
  const save = () => {
    if (cents !== null) onSave(cents);
  };
  return (
    <div
      className="grid gap-4"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          save();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg">What does it cost?</DialogTitle>
        <DialogDescription className="text-[15px]">{line.description}: the price the supplier charges for one.</DialogDescription>
      </DialogHeader>
      <div className="relative w-44">
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-muted-foreground">
          $
        </span>
        <Input
          aria-label="Cost each"
          inputMode="decimal"
          value={text}
          autoFocus
          onChange={(event) => setText(event.target.value)}
          aria-invalid={cents === null || undefined}
          className="h-14 pl-7 text-right text-xl tabular-nums"
        />
      </div>
      {cents === null ? <p className="text-[15px] font-medium text-destructive">Type it like 12.50.</p> : null}
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="ghost" className="h-12 px-5 text-base" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="h-12 px-6 text-base" disabled={cents === null} onClick={save}>
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}
