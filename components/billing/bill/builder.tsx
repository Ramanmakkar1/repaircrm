"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";

import { resolveScanAction } from "@/app/(app)/scan/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCents } from "@/lib/money";
import type { TaxRateOption } from "@/lib/tax";
import { IDLE_FORM_STATE, type CustomerOption, type FormState, type ProductOption } from "../types";
import { LineDialog, OneOffDialog, RepairDialog, UnitDialog } from "./dialogs";
import {
  LAST_STEP,
  addOneOff,
  addProduct,
  availableUnits,
  copyFor,
  fieldEntries,
  initialBillState,
  linkRepair,
  needsUnit,
  productQuantity,
  removeLine,
  setQuantity,
  stepForServerError,
  stepLabels,
  stepStatuses,
  stepTitle,
  submitReason,
  summaryLine,
  totalsOf,
  updateLine,
  validate,
  withTax,
  type BillContext,
  type BillInitial,
  type BillKind,
  type BillMode,
  type BillState,
  type RepairOption,
  type RepeatDetails,
} from "./flow";
import { RepeatStep } from "@/components/recurring/repeat-step";
import { BillMobileBar } from "./mobile-bar";
import { BillPanel } from "./panel";
import { BillStepper } from "./stepper";
import { CustomerStep } from "./step-customer";
import { ItemsStep } from "./step-items";
import { ReviewStep } from "./step-review";

export type BillBuilderProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  kind: BillKind;
  customers: CustomerOption[];
  products: ProductOption[];
  /** The shop's flat rate: what the document opens on when the shop keeps no named rates. */
  taxRateBps: number;
  taxRates: TaxRateOption[];
  /** The shop's open repairs, for "From repair". */
  repairs?: RepairOption[];
  /** The customers to tap before anything is typed, most recent first. */
  recentCustomerIds?: string[];
  initial?: BillInitial;
  /**
   * The page's own title block (breadcrumb and heading). It is drawn at the top of the choices rather
   * than above the whole builder, so "This invoice" can start at the top of the page and has the
   * height for a real list of lines; on a phone it is simply the first thing, as before.
   */
  header?: React.ReactNode;
  /**
   * "edit" changes a saved document: the same screen, opened on Check and save,
   * posting the document's `id` first so the update action rewrites it. The
   * fields posted are otherwise exactly the new document's.
   */
  mode?: BillMode;
  /** The saved document's id, for mode "edit". */
  documentId?: string;
  /** A plain-words note above the steps (e.g. "Already sent to Elena"). */
  notice?: React.ReactNode;
};

/**
 * The Easy-mode new invoice / new estimate: a bill builder, a sibling of the
 * Sell screen and the new-repair check-in. Choices on the left, one step at a
 * time (1 Customer, 2 Items, 3 Review); a live "This invoice" panel on the
 * right (a bar above the tab bar on a phone); one big Save button.
 *
 * Every choice lives in one BillState and reaches the server as hidden inputs
 * (see fieldEntries), so the form posts exactly what createInvoiceAction and
 * createEstimateAction have always read, whichever step is on screen. The inputs
 * you type into have no name of their own. The small windows (one-off item, edit
 * an item, which unit, from repair) are drawn outside the <form>, so nothing in
 * them can post or submit it.
 */
export function BillBuilder({
  action,
  kind,
  customers,
  products,
  taxRateBps,
  taxRates,
  repairs = [],
  recentCustomerIds = [],
  initial,
  header,
  mode = "new",
  documentId,
  notice,
}: BillBuilderProps) {
  const [server, formAction, pending] = useActionState(action, IDLE_FORM_STATE);
  const copy = copyFor(kind, mode);
  const ctx = React.useMemo<BillContext>(
    () => ({ kind, customers, products, taxRates, taxRateBps, repairs, recentCustomerIds }),
    [kind, customers, products, taxRates, taxRateBps, repairs, recentCustomerIds],
  );

  const [state, setState] = React.useState<BillState>(() => initialBillState(ctx, initial));
  // A saved document opens on Check and save (everything on one page, Save
  // right there); a new one opened for a customer already starts on the items.
  const [step, setStep] = React.useState(() =>
    mode === "edit" ? LAST_STEP : customers.some((customer) => customer.id === initial?.customerId) ? 1 : 0,
  );
  /** The steps something was refused on: their messages stay up until each is fixed. */
  const [attempted, setAttempted] = React.useState<number[]>([]);
  /** Counts refusals, so each one brings its message into view. */
  const [refusals, setRefusals] = React.useState(0);
  const refuse = (steps: number[]) => {
    setAttempted((current) => [...new Set([...current, ...steps])]);
    setRefusals((count) => count + 1);
  };

  const [oneOffOpen, setOneOffOpen] = React.useState(false);
  const [repairOpen, setRepairOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [unitFor, setUnitFor] = React.useState<ProductOption | null>(null);
  /** What the last tap did, in words. */
  const [status, setStatus] = React.useState("");

  // A refusal from the server lands on the step that can fix it.
  const [seen, setSeen] = React.useState(server);
  if (server !== seen) {
    setSeen(server);
    if (server?.error) {
      const target = stepForServerError(server.error);
      if (target !== null) setStep(target);
      setRefusals((count) => count + 1);
    }
  }

  const found = validate(state, ctx);
  const issues = found.filter((issue) => attempted.includes(issue.step));
  const reason = submitReason(state, ctx);
  const totals = totalsOf(state, kind);
  const statuses = stepStatuses(state, ctx);

  // React resets a <form action> after its action finishes, and it does so during commit, where a
  // React onReset handler never runs. The fields here are all controlled by BillState, so a reset
  // would blank the tax picker, the date and the notes on screen while the state (and the next
  // save) still held them. A native listener is called whenever the reset is, and cancels it.
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const keep = (event: Event) => event.preventDefault();
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, []);

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const stepperRef = React.useRef<HTMLDivElement>(null);
  const leftRef = React.useRef<HTMLDivElement>(null);
  const firstRender = React.useRef(true);
  const shownRefusals = React.useRef(0);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Step 1 puts the cursor in its search box itself.
    if (step !== 0) headingRef.current?.focus({ preventScroll: true });
    // A refusal brings its message into view; an ordinary step change shows the top of the step.
    const refused = refusals !== shownRefusals.current;
    shownRefusals.current = refusals;
    const message = refused ? (leftRef.current?.querySelector("section [data-issues]") ?? leftRef.current?.querySelector("[data-issues]")) : null;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    (message ?? stepperRef.current)?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [step, refusals]);

  const goTo = (next: number) => setStep(Math.max(0, Math.min(LAST_STEP, next)));

  /** The Next button, here and on the phone's bar. A step that is missing something stops it with its message. */
  function goNext() {
    if (step < LAST_STEP && found.some((issue) => issue.step === step)) {
      refuse([step]);
      return;
    }
    goTo(step + 1);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    // The scanner window has a form of its own, and a submit in it bubbles through here: not ours.
    if (event.target !== event.currentTarget) return;
    const first = found[0];
    if (pending || first) {
      event.preventDefault();
      if (first) {
        // Everything in the way is shown on its own step, the first one right now.
        refuse(found.map((issue) => issue.step));
        goTo(first.step);
      }
    }
  }

  // A scanner, a keyboard or a stray Enter must never save a document. In a field marked
  // data-enter="next" (the new customer's name or number) it means Next instead.
  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || !(event.target instanceof HTMLInputElement)) return;
    if (!event.currentTarget.contains(event.target)) return;
    event.preventDefault();
    if (event.target.dataset.enter === "next") goNext();
  }

  // ------------------------------------------------------------------ lines

  /** A tap on a product tile (or a scanned one): says what happened. */
  function pick(product: ProductOption): string {
    if (needsUnit(product, kind)) {
      if (availableUnits(product, state).length === 0) return `No more units of ${product.name} in stock.`;
      setUnitFor(product);
      return `Pick a unit of ${product.name}.`;
    }
    const count = productQuantity(state, product.id) + 1;
    setState((current) => addProduct(current, product, kind));
    return count > 1 ? `Added another ${product.name}. ${count} on this ${copy.noun}.` : `Added ${product.name}.`;
  }

  /** A typed or scanned code the list did not know: the server says which product or unit it is. */
  async function resolveCode(raw: string): Promise<{ ok: boolean; message: string }> {
    const result = await resolveScanAction(raw);

    if (result.kind === "product") {
      const product = products.find((option) => option.id === result.product.id);
      if (!product) return { ok: false, message: `${result.product.name} is not on this list.` };
      const message = pick(product);
      setStatus(message);
      return { ok: true, message };
    }

    if (result.kind === "serial") {
      const product = products.find((option) => option.id === result.serial.productId);
      if (!product) return { ok: false, message: "That unit's product is not on this list." };
      // An estimate has no serial column, so only the product is quoted, which is what quoting a serialized item means.
      if (kind !== "invoice") {
        setState((current) => addProduct(current, product, kind));
        const message = `Added ${product.name}.`;
        setStatus(message);
        return { ok: true, message };
      }
      const serial = result.serial.serial;
      if (!(product.serials ?? []).includes(serial)) return { ok: false, message: `Serial ${serial} is not in stock.` };
      if (state.lines.some((line) => line.serial.trim() === serial)) return { ok: false, message: `Serial ${serial} is already on this ${copy.noun}.` };
      setState((current) => addProduct(current, product, kind, serial));
      const message = `Added ${product.name} · ${serial}.`;
      setStatus(message);
      return { ok: true, message };
    }

    if (result.kind === "none") return { ok: false, message: `Nothing matches “${result.value}”.` };
    return { ok: false, message: `${result.label} is not something you can bill. Scan a product.` };
  }

  const editing = editKey ? (state.lines.find((line) => line.key === editKey) ?? null) : null;
  const editingProduct = editing?.productId ? products.find((product) => product.id === editing.productId) : undefined;
  const editingUnits = editing && editingProduct?.serialized && kind === "invoice" ? availableUnits(editingProduct, state, editing.key) : null;

  const panelHandlers = {
    state,
    ctx,
    copy,
    totals,
    onQuantity: (key: string, quantity: number) => setState((current) => setQuantity(current, key, quantity)),
    onRemove: (key: string) => setState((current) => removeLine(current, key)),
    onEdit: (key: string) => setEditKey(key),
    onTax: (taxRateId: string | null) => setState((current) => withTax(current, taxRateId, ctx)),
    onDate: (value: string) => setState((current) => ({ ...current, date: value })),
    onNotes: (value: string) => setState((current) => ({ ...current, notes: value })),
    reason,
    pending,
  };

  const { title, hint } = stepTitle(kind, step);
  const stepIssues = issues.filter((issue) => issue.step === step);

  return (
    <>
      <form ref={formRef} action={formAction} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-5">
        {fieldEntries(state, ctx, mode === "edit" ? documentId : null).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
          <div ref={leftRef} className="flex min-w-0 flex-col gap-5">
            {header}
            {notice}
            <div ref={stepperRef}>
              <BillStepper step={step} statuses={statuses} onStep={goTo} label={copy.stepsLabel} labels={stepLabels(kind)} />
            </div>

            {server?.error ? (
              <div role="alert" data-issues="" className="flex scroll-mt-28 scroll-mb-44 items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive-soft px-4 py-3 text-[15px] font-medium text-destructive">
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>{server.error}</span>
              </div>
            ) : null}

            <section aria-labelledby="bill-heading" className="flex flex-col gap-5">
              <div>
                <h2 id="bill-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
                  {title}
                </h2>
                <p className="text-base text-muted-foreground">{hint}</p>
              </div>

              {step === 0 ? (
                <CustomerStep state={state} ctx={ctx} setState={setState} onChosen={() => goTo(1)} onNext={goNext} issues={issues} allowNew={mode !== "edit"} />
              ) : null}
              {step === 1 ? (
                <ItemsStep
                  state={state}
                  ctx={ctx}
                  onPick={(product) => setStatus(pick(product))}
                  onCode={resolveCode}
                  onOneOff={() => setOneOffOpen(true)}
                  onRepair={() => setRepairOpen(true)}
                  onNext={goNext}
                  issues={issues}
                  status={status}
                />
              ) : null}
              {step === 2 && kind === "repeat" ? (
                <RepeatStep
                  state={state}
                  ctx={ctx}
                  copy={copy}
                  editing={mode === "edit"}
                  onDate={panelHandlers.onDate}
                  onRepeat={(patch: Partial<RepeatDetails>) => setState((current) => ({ ...current, repeat: { ...current.repeat, ...patch } }))}
                  issues={issues}
                  phonePanel={
                    <BillPanel {...panelHandlers} onStep={goTo} showActions={false} showOptions={false} idPrefix="review-panel" />
                  }
                />
              ) : null}
              {step === 2 && kind !== "repeat" ? (
                <ReviewStep
                  state={state}
                  ctx={ctx}
                  copy={copy}
                  totals={totals}
                  onStep={goTo}
                  onDate={panelHandlers.onDate}
                  onNotes={panelHandlers.onNotes}
                  issues={issues}
                  phonePanel={
                    <BillPanel {...panelHandlers} onStep={goTo} showActions={false} showOptions={false} idPrefix="review-panel" />
                  }
                />
              ) : null}
            </section>
          </div>

          <aside aria-label={copy.panel} className="hidden lg:sticky lg:top-2 lg:block">
            <BillPanel
              {...panelHandlers}
              onStep={goTo}
              // A repeat bill's day is on its "How often" step, and it has no printed notes.
              showOptions={step !== LAST_STEP && kind !== "repeat"}
              idPrefix="aside"
              className="lg:h-[calc(100dvh-7rem)] lg:min-h-[28rem]"
            />
          </aside>
        </div>

        <BillMobileBar
          step={step}
          line={summaryLine(state, ctx, step !== LAST_STEP)}
          reason={reason}
          warning={stepIssues[0]?.message ?? null}
          pending={pending}
          copy={copy}
          onNext={goNext}
          // The last step draws the panel on the page itself.
          onOpenItems={state.lines.length > 0 && step !== LAST_STEP ? () => setSheetOpen(true) : undefined}
        />
      </form>

      <OneOffDialog open={oneOffOpen} onOpenChange={setOneOffOpen} onAdd={(item) => { setState((current) => addOneOff(current, item)); setStatus(`Added ${item.description}.`); }} />

      <LineDialog
        line={editing}
        product={editingProduct}
        kind={kind}
        units={editingUnits}
        onSave={(patch) => editKey && setState((current) => updateLine(current, editKey, patch))}
        onRemove={() => editKey && setState((current) => removeLine(current, editKey))}
        onClose={() => setEditKey(null)}
      />

      <UnitDialog
        product={unitFor}
        units={unitFor ? availableUnits(unitFor, state) : []}
        onPick={(serial) => {
          if (!unitFor) return;
          setState((current) => addProduct(current, unitFor, kind, serial));
          setStatus(`Added ${unitFor.name} · ${serial}.`);
          setUnitFor(null);
        }}
        onClose={() => setUnitFor(null)}
      />

      <RepairDialog
        open={repairOpen}
        repairs={repairs.filter((repair) => repair.customerId === state.customerId)}
        currentId={state.ticketId}
        onPick={(id) => {
          // The repair's unbilled charges come onto the bill with it.
          setState((current) => linkRepair(current, id, ctx));
          const picked = repairs.find((repair) => repair.id === id);
          const count = picked?.charges?.length ?? 0;
          setStatus(count > 0 ? `Added ${count} ${count === 1 ? "charge" : "charges"} from repair #${picked?.number}.` : `Linked to repair #${picked?.number}.`);
        }}
        onUnlink={() => setState((current) => linkRepair(current, "", ctx))}
        onOpenChange={setRepairOpen}
      />

      {/* The phone's "what is on this invoice": the panel as a sheet, so quantities can be changed from any step. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          className="max-h-[92dvh] overflow-y-auto"
          // Focus the sheet itself, not its first button: nothing in it should look pre-pressed.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{copy.panel}</DialogTitle>
            <DialogDescription>Change how many, edit an item or take it off.</DialogDescription>
          </DialogHeader>
          <BillPanel
            {...panelHandlers}
            onStep={(next) => { setSheetOpen(false); goTo(next); }}
            showActions={false}
            showHeading={false}
            idPrefix="sheet"
            className="border-0 p-0"
          />
          {/* Stays in view while a long list scrolls under it. */}
          <DialogFooter className="sticky bottom-0 -mx-5 -mb-5 items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3">
            <span className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-muted-foreground">Total</span>
              <span className="text-2xl font-bold tabular-nums tracking-tight">{formatCents(totals.totalCents)}</span>
            </span>
            <Button type="button" className="h-12 px-8" onClick={() => setSheetOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
