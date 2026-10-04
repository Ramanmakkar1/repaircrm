"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, Info, SlidersHorizontal, TriangleAlert } from "lucide-react";

import {
  createProductAction,
  updateProductAction,
  type ProductFormState,
} from "@/app/(app)/inventory/actions";
import { ScanButton } from "@/components/scan/scan-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WARRANTY_PRESETS } from "@/lib/warranty-presets";
import { marginPct } from "./format";
import { PictureThumb, ProductPicturePicker } from "./image-picker";
import { validPictureKey } from "./picture-picker-logic";
import { NewProductPhoto, ProductPhotoEditor } from "./product-photo-editor";

export type ProductFormValues = {
  id: string;
  name: string;
  category: string | null;
  sku: string | null;
  upc: string | null;
  description: string | null;
  priceCents: number;
  costCents: number | null;
  taxable: boolean;
  stockQty: number;
  lowStockAt: number | null;
  warrantyDays: number | null;
  reorderQty: number | null;
  vendorId: string | null;
  vendorSku: string | null;
  serialized: boolean;
  active: boolean;
  imageUrl?: string | null;
  /** Key of the picture chosen on purpose, or null for "pick it from the name". */
  catalogImage?: string | null;
};

/** A supplier the product can be sourced from. */
export type VendorOption = { id: string; name: string };

/** Radix Select cannot hold "", so "no vendor" needs a sentinel. */
const NO_VENDOR = "__none__";

type TextKey =
  | "name"
  | "category"
  | "sku"
  | "upc"
  | "description"
  | "price"
  | "cost"
  | "stockQty"
  | "lowStockAt"
  | "warrantyDays"
  | "reorderQty"
  | "vendorSku";

type Values = Record<TextKey, string> & {
  taxable: boolean;
  active: boolean;
  serialized: boolean;
  vendorId: string;
};

const dollars = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2);

/**
 * A brand new product can arrive pre-seeded with a code — that is what the
 * register's "Create product with this UPC" shortcut does when a scan finds
 * nothing, so the number never has to be typed twice.
 */
export type ProductFormDefaults = { sku?: string; upc?: string };

function initialValues(
  product?: ProductFormValues | null,
  defaults?: ProductFormDefaults,
): Values {
  return {
    name: product?.name ?? "",
    category: product?.category ?? "",
    sku: product?.sku ?? defaults?.sku ?? "",
    upc: product?.upc ?? defaults?.upc ?? "",
    description: product?.description ?? "",
    price: product ? dollars(product.priceCents) : "",
    cost: dollars(product?.costCents),
    stockQty: product ? String(product.stockQty) : "",
    lowStockAt: product?.lowStockAt == null ? "" : String(product.lowStockAt),
    warrantyDays:
      product?.warrantyDays == null ? "" : String(product.warrantyDays),
    reorderQty: product?.reorderQty == null ? "" : String(product.reorderQty),
    vendorSku: product?.vendorSku ?? "",
    vendorId: product?.vendorId ?? NO_VENDOR,
    taxable: product?.taxable ?? true,
    serialized: product?.serialized ?? false,
    active: product?.active ?? true,
  };
}

/** Everything the field pieces below need from the form, so Easy and Full are two layouts of the same fields. */
type Api = {
  values: Values;
  set: <K extends keyof Values>(key: K, value: Values[K]) => void;
  field: (key: TextKey) => {
    id: string;
    name: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  };
  errors: Record<string, string>;
  isEdit: boolean;
  product?: ProductFormValues | null;
  /** Easy mode: bigger boxes and plainer words. */
  easy: boolean;
};

/** 48px boxes for the optional fields in Easy mode. */
const EASY_INPUT = "h-12 pointer-coarse:min-h-12 rounded-xl text-base pointer-coarse:text-base";
/** The three boxes that matter: item name, price and quantity. */
const BIG_INPUT = "h-14 pointer-coarse:min-h-14 rounded-xl text-[17px] pointer-coarse:text-[17px]";
const inputClass = (api: Api) => (api.easy ? EASY_INPUT : undefined);

/**
 * One form, two routes: /inventory/new posts to createProductAction and
 * /inventory/[id]/edit posts to updateProductAction. Both redirect on success,
 * so the only state this ever renders is the validation failure path.
 *
 * Two layouts of the same fields. Easy mode (`simple`) is picture-first: the
 * picture picker, then item name, selling price and quantity in big boxes, one
 * big button, and every other field under "More details". Full mode keeps the
 * dense form it has always had and gains a compact picture row beside the name.
 * Both post the same field names, plus "catalogImage": the key of the picture
 * chosen on purpose, or "" for "pick it from the name".
 *
 * Every field is CONTROLLED on purpose. React 19 resets a `<form action={…}>`
 * once the action settles, which would wipe the form the moment the server
 * came back with "that SKU is taken". Controlled values survive that reset.
 *
 * Stock quantity only exists on the CREATE form. Once a product is real, its
 * level moves through the Adjust Stock dialog so every change lands in the
 * audit trail — a silently editable number here would be a hole in it.
 */
export function ProductForm({
  product,
  vendors,
  canSeeCost,
  defaults,
  simple = false,
}: {
  product?: ProductFormValues | null;
  /** Suppliers this product can be bought from. */
  vendors: VendorOption[];
  /** Cost is owner-only; a non-owner never sees or submits it. */
  canSeeCost: boolean;
  /** Codes to start a NEW product with, e.g. a UPC that just failed to scan. */
  defaults?: ProductFormDefaults;
  /** Easy mode: the picture-first layout. Off keeps the dense form. */
  simple?: boolean;
}) {
  const isEdit = Boolean(product);
  const quick = !isEdit;
  const extraDetails = React.useRef<HTMLDetailsElement>(null);
  const alertRef = React.useRef<HTMLDivElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const priceRef = React.useRef<HTMLInputElement>(null);
  const qtyRef = React.useRef<HTMLInputElement>(null);
  const [state, formAction] = React.useActionState<ProductFormState, FormData>(
    isEdit ? updateProductAction : createProductAction,
    undefined,
  );
  const [values, setValues] = React.useState<Values>(() =>
    initialValues(product, defaults),
  );
  const [confirmed, setConfirmed] = React.useState(false);
  const [customSku, setCustomSku] = React.useState(Boolean(defaults?.sku));
  const [photo, setPhoto] = React.useState<File | null>(null);
  /** The picture chosen on purpose ("" = pick it from the name). */
  const [catalogImage, setCatalogImage] = React.useState(() => validPictureKey(product?.catalogImage));
  /** The product's own photo (saved, or just chosen in this browser): it always wins over the picture. */
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(product?.imageUrl ?? null);

  // Turning serial tracking ON for a product that already has stock is the one
  // destructive edit on this form, so it asks first (and the server refuses
  // without the confirmation).
  const needsSerialConfirm =
    isEdit && values.serialized && !product?.serialized && (product?.stockQty ?? 0) !== 0;

  const set = React.useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) =>
      setValues((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const errors = state?.fieldErrors ?? {};
  React.useEffect(() => {
    if (!state?.error) return;
    if (state.fieldErrors && Object.keys(state.fieldErrors).some(key => !["name", "price", "stockQty"].includes(key)) && extraDetails.current) extraDetails.current.open = true;
    // A refused save brings its message into view (the button may be pinned far below it).
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alertRef.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    if (state.fieldErrors?.name) nameRef.current?.focus({ preventScroll: true });
  }, [state]);
  const cancelHref = product ? `/inventory/${product.id}` : "/inventory";

  const field = (key: TextKey) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, event.target.value),
  });
  const api: Api = { values, set, field, errors, isEdit, product, easy: simple };

  // Live margin readout — the number an owner is actually pricing against.
  const margin = React.useMemo(() => {
    const price = Math.round(Number.parseFloat(values.price) * 100);
    const cost = Math.round(Number.parseFloat(values.cost) * 100);
    if (!Number.isFinite(price) || !Number.isFinite(cost)) return null;
    return marginPct(price, cost);
  }, [values.price, values.cost]);

  const picker = (compact: boolean) => (
    <ProductPicturePicker
      name={values.name}
      category={values.category.trim() || null}
      value={catalogImage}
      onChange={setCatalogImage}
      uploadedPhotoUrl={photoUrl}
      compact={compact}
    />
  );

  const photoBox = product ? (
    <ProductPhotoEditor
      productId={product.id}
      name={values.name}
      category={values.category}
      catalogImage={catalogImage || null}
      imageUrl={product.imageUrl ?? null}
      onPhotoChange={setPhotoUrl}
      showStatus={false}
    />
  ) : (
    <NewProductPhoto
      name={values.name}
      category={values.category}
      catalogImage={catalogImage || null}
      file={photo}
      onChange={setPhoto}
      onPreview={setPhotoUrl}
      error={errors.photo}
      showStatus={false}
    />
  );

  const serialSwitch = (
    <SerializedRow api={api} needsSerialConfirm={needsSerialConfirm} confirmed={confirmed} onConfirm={setConfirmed} />
  );

  const errorBanner = state?.error ? (
    <div
      ref={alertRef}
      role="alert"
      className={cn(
        "flex scroll-mt-28 scroll-mb-44 items-start gap-2.5 border border-destructive/30 bg-destructive-soft px-4 py-3 font-medium text-destructive",
        simple ? "rounded-xl text-base" : "rounded-md text-sm",
      )}
    >
      <AlertCircle aria-hidden className={cn("mt-0.5 shrink-0", simple ? "size-5" : "size-4")} />
      <span>{state.error}</span>
    </div>
  ) : null;

  const action = (formData: FormData) => {
    if (photo) formData.set("photo", photo);
    formAction(formData);
  };

  // ------------------------------------------------------------------------------------------- Easy
  if (simple) {
    const saveLabel = isEdit ? "Save changes" : "Add product";
    const blocked = needsSerialConfirm && !confirmed;
    // Enter in a box means "next box"; only the last one saves. A stray Enter must not save half a product.
    const isEnter = (event: React.KeyboardEvent) => event.key === "Enter" && !event.nativeEvent.isComposing;
    const onNameKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isEnter(event) || !priceRef.current) return;
      event.preventDefault();
      priceRef.current.focus();
    };
    // Past the price: on to the quantity when there is one, otherwise Enter saves.
    const onPriceKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!isEnter(event) || !qtyRef.current) return;
      event.preventDefault();
      qtyRef.current.focus();
    };
    const bits = [
      values.price.trim() ? `$${values.price.trim()}` : "",
      !isEdit && !values.serialized && values.stockQty.trim() ? `${values.stockQty.trim()} in stock` : "",
    ].filter(Boolean);

    return (
      <form action={action} className="flex flex-col gap-5">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}
        {errorBanner}

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-6">
          <section aria-labelledby="pf-picture" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-2">
            <h2 id="pf-picture" className="sr-only">Picture</h2>
            {picker(false)}
          </section>

          <div className="flex min-w-0 flex-col gap-5">
            <section aria-label="The basics" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Item name" htmlFor="name" required error={errors.name} easy className="sm:col-span-2">
                  <Input
                    {...field("name")}
                    ref={nameRef}
                    onKeyDown={onNameKey}
                    className={BIG_INPUT}
                    autoFocus={!isEdit}
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="e.g. iPhone 14 screen guard"
                    aria-invalid={Boolean(errors.name)}
                  />
                </Field>
                <Field label="Selling price" htmlFor="price" required error={errors.price} easy>
                  <MoneyInput
                    {...field("price")}
                    ref={priceRef}
                    onKeyDown={onPriceKey}
                    className={BIG_INPUT}
                    enterKeyHint={isEdit || values.serialized ? "done" : "next"}
                    aria-invalid={Boolean(errors.price)}
                  />
                </Field>
                {isEdit ? (
                  <p className="flex items-start gap-2.5 self-center text-sm text-muted-foreground">
                    <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-faint-foreground" />
                    <span>
                      In stock now: <strong className="font-semibold text-foreground tabular-nums">{product?.stockQty ?? 0}</strong>. Change it from the product page so the change is recorded.
                    </span>
                  </p>
                ) : values.serialized ? (
                  <p className="self-center text-sm text-muted-foreground">Serial tracking is on. Add individual units after saving.</p>
                ) : (
                  <Field label="Quantity in stock" htmlFor="stockQty" error={errors.stockQty} easy>
                    <Input
                      {...field("stockQty")}
                      ref={qtyRef}
                      className={BIG_INPUT}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      enterKeyHint="done"
                      placeholder="0"
                      aria-invalid={Boolean(errors.stockQty)}
                    />
                  </Field>
                )}
              </div>
              {quick ? <p className="text-sm text-muted-foreground">A product code is generated automatically. Extra details can be added now or later.</p> : null}
              {/* A scanned code arrives filled in under More details: say so, so nobody retypes it. */}
              {quick && defaults?.upc && values.upc.trim() ? (
                <p className="text-sm text-muted-foreground">
                  Barcode <span className="font-mono text-foreground">{values.upc.trim()}</span> from your scan is saved with this product.
                </p>
              ) : null}
            </section>

            <details ref={extraDetails} className="group overflow-hidden rounded-2xl border border-border bg-surface">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-5 py-3 active:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
                  <SlidersHorizontal aria-hidden className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold">More details</span>
                  <span className="text-sm text-muted-foreground">Category, codes, cost, supplier, warranty, your own photo</span>
                </span>
                <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col divide-y divide-border border-t border-border">
                <Section title="About this item">
                  <CategoryField api={api} />
                  <DescriptionField api={api} />
                </Section>
                <Section title="Your own photo" hint="A photo of this exact item, if you have one.">
                  {photoBox}
                </Section>
                <Section title="Codes">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SkuField api={api} customSku={customSku} onCustomSku={setCustomSku} />
                    <UpcField api={api} />
                  </div>
                </Section>
                <Section title="Money">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {canSeeCost ? <CostField api={api} margin={margin} /> : null}
                    <WarrantyField api={api} className="sm:col-span-2" />
                  </div>
                  <TaxableRow api={api} />
                </Section>
                <Section title="Supplier">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <VendorFields api={api} vendors={vendors} />
                    <ReorderQtyField api={api} className="sm:col-span-2" />
                  </div>
                </Section>
                <Section title="Stock rules">
                  <ReorderPointField api={api} />
                  {serialSwitch}
                  <ActiveRow api={api} />
                </Section>
              </div>
            </details>

            <div className="flex flex-col gap-2">
              <SubmitButton
                disabled={blocked}
                pendingLabel="Saving…"
                className="hidden h-14 w-full text-base lg:inline-flex"
              >
                {saveLabel}
              </SubmitButton>
              <Button variant="ghost" asChild className="h-12 text-[15px]">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* On a phone or a standing tablet the button is pinned to the bottom, above the tab bar. */}
        <div
          role="region"
          aria-label={saveLabel}
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-border-strong bg-surface py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:bottom-0 sm:pb-[max(.75rem,env(safe-area-inset-bottom))] sm:pr-24 lg:hidden print:hidden"
        >
          <PictureThumb name={values.name} category={values.category.trim() || null} value={catalogImage} uploadedPhotoUrl={photoUrl} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold">{values.name.trim() || "New product"}</span>
            <span className="truncate text-sm text-muted-foreground">{bits.length ? bits.join(" · ") : "Add a name and price"}</span>
          </div>
          <SubmitButton disabled={blocked} pendingLabel="Saving…" className="h-14 shrink-0 px-6 text-base">
            {saveLabel}
          </SubmitButton>
        </div>
      </form>
    );
  }

  // ------------------------------------------------------------------------------------------- Full
  return (
    <form action={action} className="flex flex-col gap-5">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      {errorBanner}

      {quick ? <Card><CardHeader><CardTitle>Add inventory</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" htmlFor="name" required error={errors.name} className="sm:col-span-2"><Input {...field("name")} ref={nameRef} autoFocus placeholder="e.g. iPhone 14 screen guard" aria-invalid={Boolean(errors.name)} /></Field>
        <div className="sm:col-span-2">{picker(true)}</div>
        <Field label="Selling price" htmlFor="price" required error={errors.price}><MoneyInput {...field("price")} aria-invalid={Boolean(errors.price)} /></Field>
        {values.serialized ? <p className="self-center text-sm text-muted-foreground">Serial tracking is on. Add individual units after saving.</p> : <Field label="Quantity in stock" htmlFor="stockQty" error={errors.stockQty}><Input {...field("stockQty")} type="number" min="0" step="1" inputMode="numeric" placeholder="0" aria-invalid={Boolean(errors.stockQty)} /></Field>}
        <p className="text-sm text-muted-foreground sm:col-span-2">A product code is generated automatically. Extra details can be added now or later.</p>
      </CardContent></Card> : null}
      <details ref={extraDetails} open={!quick} className={quick ? "rounded-lg border border-border p-4" : "contents"}>
        <summary className={quick ? "flex min-h-12 cursor-pointer items-center text-sm font-semibold" : "hidden"}>More details · photo, cost, barcode, supplier</summary>
        <div className="flex flex-col gap-5 pt-3">
      <Card>
        <CardHeader><CardTitle>Product photo</CardTitle></CardHeader>
        <CardContent>
          {photoBox}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {!quick ? (
          <>
          <Field
            label="Name"
            htmlFor="name"
            required
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              {...field("name")}
              ref={nameRef}
              autoFocus={!isEdit}
              placeholder="iPhone 14 Screen Assembly"
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <div className="sm:col-span-2">{picker(true)}</div>
          </>
          ) : null}

          <CategoryField api={api} />
          <SkuField api={api} customSku={customSku} onCustomSku={setCustomSku} />
          <UpcField api={api} />
          <DescriptionField api={api} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {!quick ? (
          <Field label="Price" htmlFor="price" required error={errors.price}>
            <MoneyInput {...field("price")} aria-invalid={Boolean(errors.price)} />
          </Field>
          ) : null}

          {canSeeCost ? <CostField api={api} margin={margin} /> : null}

          <WarrantyField api={api} className="sm:col-span-2" />

          <TaxableRow api={api} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchasing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <VendorFields api={api} vendors={vendors} />
          <ReorderQtyField api={api} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {isEdit ? (
            <div className="flex items-start gap-2.5 rounded-md border border-border bg-surface-hover/60 px-4 py-3 text-[13px] text-muted-foreground sm:col-span-2">
              <Info className="mt-0.5 size-4 shrink-0 text-faint-foreground" />
              <span>
                Stock on hand is currently{" "}
                <strong className="font-semibold text-foreground tabular-nums">
                  {product?.stockQty ?? 0}
                </strong>
                . Change it from the product page so the adjustment is recorded
                with a reason.
              </span>
            </div>
          ) : null}

          <ReorderPointField api={api} className={isEdit || values.serialized ? "sm:col-span-2" : undefined} />

          {serialSwitch}

          <ActiveRow api={api} className="sm:col-span-2" />
        </CardContent>
      </Card>

        </div>
      </details>
      <div className="flex items-center justify-end gap-3">
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton
          disabled={needsSerialConfirm && !confirmed}
          pendingLabel="Saving…"
        >
          {isEdit ? "Save changes" : "Create product"}
        </SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// The fields. Module-level components (never defined inside the form, or every
// keystroke would remount them and drop the cursor). Easy and Full both use them.
// ---------------------------------------------------------------------------

function CategoryField({ api, className }: { api: Api; className?: string }) {
  return (
    <Field
      label="Category"
      htmlFor="category"
      error={api.errors.category}
      hint="Free text — reuse an existing one to keep the filter tidy."
      easy={api.easy}
      className={className}
    >
      <Input {...api.field("category")} className={inputClass(api)} placeholder="Parts / Displays" />
    </Field>
  );
}

function SkuField({ api, customSku, onCustomSku, className }: { api: Api; customSku: boolean; onCustomSku: (next: boolean) => void; className?: string }) {
  const { values, isEdit, product, errors } = api;
  const link = cn("text-sm text-primary underline underline-offset-4", api.easy && "inline-flex min-h-12 items-center");
  return (
    <Field
      label="SKU"
      htmlFor="sku"
      error={errors.sku}
      hint="Used automatically on barcode labels and at checkout."
      easy={api.easy}
      className={className}
    >
      {!customSku ? (
        <div className="space-y-2">
          <input type="hidden" name="sku" value={isEdit ? values.sku : ""} />
          <div id="sku" className={cn("rounded-md border bg-muted/40 px-3 py-2 text-sm", api.easy && "flex min-h-12 items-center rounded-xl")}>
            {isEdit && values.sku ? <span className="font-mono">{values.sku}</span> : "Generated automatically when you save"}
          </div>
          <button type="button" className={link} onClick={() => onCustomSku(true)}>
            {isEdit ? "Change SKU" : "Use my own SKU"}
          </button>
        </div>
      ) : <div className="space-y-2">
        <div className="flex items-center gap-2">
        <Input
          {...api.field("sku")}
          className={cn("flex-1 font-mono uppercase", inputClass(api))}
          placeholder="Your existing product code"
          maxLength={60}
          aria-invalid={Boolean(errors.sku)}
        />
        <ScanButton
          label="Scan a SKU"
          title="Scan into SKU"
          description="Point at the part's own barcode."
          onScan={(hit) => {
            api.set("sku", hit.value);
            return `SKU set to ${hit.value}`;
          }}
        />
        </div>
        <button type="button" className={link} onClick={() => { api.set("sku", product?.sku ?? ""); onCustomSku(false); }}>
          {isEdit ? "Keep current SKU" : "Generate automatically instead"}
        </button>
      </div>}
    </Field>
  );
}

function UpcField({ api, className }: { api: Api; className?: string }) {
  return (
    <Field
      label={api.easy ? "Barcode (UPC)" : "UPC"}
      htmlFor="upc"
      error={api.errors.upc}
      hint="The manufacturer's barcode, if the part carries one."
      easy={api.easy}
      className={className}
    >
      <div className="flex items-center gap-2">
        <Input
          {...api.field("upc")}
          className={cn("flex-1 font-mono", inputClass(api))}
          inputMode="numeric"
          placeholder="0810001100011"
          aria-invalid={Boolean(api.errors.upc)}
        />
        <ScanButton
          label="Scan a UPC"
          title="Scan into UPC"
          description="Point at the manufacturer's barcode on the box."
          onScan={(hit) => {
            api.set("upc", hit.value);
            return `UPC set to ${hit.value}`;
          }}
        />
      </div>
    </Field>
  );
}

function DescriptionField({ api, className }: { api: Api; className?: string }) {
  return (
    <Field label="Description" htmlFor="description" error={api.errors.description} easy={api.easy} className={className}>
      <Textarea
        {...api.field("description")}
        rows={3}
        className={api.easy ? "rounded-xl text-base" : undefined}
        placeholder="OEM-pull OLED display with frame, tested."
      />
    </Field>
  );
}

function CostField({ api, margin, className }: { api: Api; margin: number | null; className?: string }) {
  return (
    <Field
      label="Cost"
      htmlFor="cost"
      error={api.errors.cost}
      hint={
        margin == null
          ? "What you pay your supplier. Owners only."
          : `${margin}% gross margin at this price.`
      }
      easy={api.easy}
      className={className}
    >
      <MoneyInput {...api.field("cost")} className={inputClass(api)} aria-invalid={Boolean(api.errors.cost)} />
    </Field>
  );
}

function WarrantyField({ api, className }: { api: Api; className?: string }) {
  const { values, errors, set } = api;
  return (
    <Field
      label="Warranty"
      htmlFor="warrantyDays"
      error={errors.warrantyDays}
      hint="How long this is covered after it's sold. Snapshotted onto the invoice, so changing it later won't alter cover already sold."
      easy={api.easy}
      className={className}
    >
      <div className="flex flex-col gap-2">
        <div className="relative sm:max-w-[12rem]">
          <Input
            {...api.field("warrantyDays")}
            type="number"
            step={1}
            min={0}
            inputMode="numeric"
            placeholder="0"
            className={cn("pr-14 tabular-nums", inputClass(api))}
            aria-invalid={Boolean(errors.warrantyDays)}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-faint-foreground">
            days
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {WARRANTY_PRESETS.map((preset) => {
            const current =
              (values.warrantyDays === "" ? 0 : Number(values.warrantyDays)) ===
              preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                aria-pressed={current}
                onClick={() =>
                  set(
                    "warrantyDays",
                    preset.value === 0 ? "" : String(preset.value),
                  )
                }
                className={cn(
                  "inline-flex items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                  api.easy ? "h-12 text-sm" : "h-9",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  current
                    ? "border-transparent bg-accent text-accent-foreground shadow-sm"
                    : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </Field>
  );
}

function TaxableRow({ api, className }: { api: Api; className?: string }) {
  return (
    <SwitchRow
      id="taxable"
      name="taxable"
      label="Taxable"
      hint={
        api.easy
          ? "Adds the shop's sales tax when this is sold. Turn off for labour in tax-exempt places."
          : "Apply the shop’s sales tax when this is sold. Turn off for labour in tax-exempt jurisdictions."
      }
      checked={api.values.taxable}
      onChange={(next) => api.set("taxable", next)}
      easy={api.easy}
      className={className}
    />
  );
}

/** The vendor box (Radix Select posts nothing, so the chosen id rides along in a hidden input) and the vendor's own code. */
function VendorFields({ api, vendors }: { api: Api; vendors: VendorOption[] }) {
  const { values, errors, set } = api;
  return (
    <>
      {/* Radix Select isn't a form control, so the chosen id rides along in
          a hidden input. "None" posts blank and clears the link. */}
      <input
        type="hidden"
        name="vendorId"
        value={values.vendorId === NO_VENDOR ? "" : values.vendorId}
      />
      <Field
        label={api.easy ? "Supplier" : "Vendor"}
        htmlFor="vendorId"
        error={errors.vendorId}
        hint={
          vendors.length === 0
            ? api.easy
              ? "No suppliers yet. Add one under Stock, Suppliers."
              : "No vendors yet — add one under Inventory ▸ Vendors."
            : "Who you buy this from. Purchase orders start from here."
        }
        easy={api.easy}
      >
        <Select
          value={values.vendorId}
          onValueChange={(next) => set("vendorId", next)}
        >
          <SelectTrigger id="vendorId" className={inputClass(api)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value={NO_VENDOR}>{api.easy ? "No supplier" : "No vendor"}</SelectItem>
            {vendors.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label={api.easy ? "Their part number" : "Vendor SKU"}
        htmlFor="vendorSku"
        error={errors.vendorSku}
        hint={api.easy ? "The supplier's own code for it, printed on the order they read." : "Their part number — printed on the purchase order they read."}
        easy={api.easy}
      >
        <div className="flex items-center gap-2">
          <Input
            {...api.field("vendorSku")}
            className={cn("font-mono", inputClass(api))}
            placeholder="MS-IP14-OLED"
          />
          <ScanButton
            label={api.easy ? "Scan the supplier's code" : "Scan the vendor's code"}
            title={api.easy ? "Scan their part number" : "Scan into vendor SKU"}
            description="Point at the code on the supplier's packaging."
            onScan={(hit) => {
              set("vendorSku", hit.value);
              return `${api.easy ? "Part number" : "Vendor SKU"} set to ${hit.value}`;
            }}
          />
        </div>
      </Field>
    </>
  );
}

function ReorderQtyField({ api, className }: { api: Api; className?: string }) {
  return (
    <Field
      label="Reorder quantity"
      htmlFor="reorderQty"
      error={api.errors.reorderQty}
      hint="How many to buy when this runs low. Blank orders back up to twice the reorder point."
      easy={api.easy}
      className={className}
    >
      <Input
        {...api.field("reorderQty")}
        type="number"
        step={1}
        min={1}
        inputMode="numeric"
        placeholder="Auto"
        className={cn("tabular-nums", inputClass(api))}
        aria-invalid={Boolean(api.errors.reorderQty)}
      />
    </Field>
  );
}

function ReorderPointField({ api, className }: { api: Api; className?: string }) {
  return (
    <Field
      label={api.easy ? "Low-stock level" : "Reorder point"}
      htmlFor="lowStockAt"
      error={api.errors.lowStockAt}
      hint="Warn when stock reaches this level. Leave blank for items you don't stock."
      easy={api.easy}
      className={className}
    >
      <Input
        {...api.field("lowStockAt")}
        type="number"
        step={1}
        min={0}
        inputMode="numeric"
        placeholder="None"
        className={cn("tabular-nums", inputClass(api))}
        aria-invalid={Boolean(api.errors.lowStockAt)}
      />
    </Field>
  );
}

/** Serial tracking, with the confirmation that turning it on for stocked items needs. */
function SerializedRow({
  api,
  needsSerialConfirm,
  confirmed,
  onConfirm,
}: {
  api: Api;
  needsSerialConfirm: boolean;
  confirmed: boolean;
  onConfirm: (next: boolean) => void;
}) {
  const { product } = api;
  return (
    <div className={cn("flex flex-col gap-3 border border-border sm:col-span-2", api.easy ? "rounded-xl px-4 py-3" : "rounded-md bg-surface-hover/60 p-4")}>
      <SwitchRow
        bare
        id="serialized"
        name="serialized"
        label="Track serial numbers"
        hint="Every unit gets its own record, so you can tell which handset went to which customer. On-hand becomes the count of units in stock rather than a number you type."
        checked={api.values.serialized}
        onChange={(next) => api.set("serialized", next)}
        easy={api.easy}
      />

      {needsSerialConfirm ? (
        <label className="flex items-start gap-2.5 rounded-md border border-status-in-progress/30 bg-status-in-progress-bg px-3.5 py-3 text-[13px] text-status-in-progress-fg">
          <input
            type="checkbox"
            name="serializedConfirm"
            checked={confirmed}
            onChange={(event) => onConfirm(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-current"
          />
          <span className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-bold">
                This resets on-hand from {product?.stockQty ?? 0} to 0.
              </strong>{" "}
              There are no serial numbers for the units already on the
              shelf, so they have to be entered by serial afterwards. The
              reset is recorded as an adjustment.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function ActiveRow({ api, className }: { api: Api; className?: string }) {
  return (
    <SwitchRow
      id="active"
      name="active"
      label="Active"
      hint="Inactive products stay on old invoices but stop showing up when staff search for something to sell."
      checked={api.values.active}
      onChange={(next) => api.set("active", next)}
      easy={api.easy}
      className={className}
    />
  );
}

/**
 * A label, its explanation and a switch. In Easy mode the whole row is the tap target (the label wraps
 * the switch), as on the customer form; in Full mode it is the dense row the form always had.
 */
function SwitchRow({
  id,
  name,
  label,
  hint,
  checked,
  onChange,
  easy,
  bare = false,
  className,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  easy: boolean;
  /** No border or padding of its own: it sits inside a box that has them. */
  bare?: boolean;
  className?: string;
}) {
  if (easy) {
    return (
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-16 cursor-pointer items-center justify-between gap-4",
          bare ? "min-h-12" : "rounded-xl border border-border px-4 py-3 active:bg-surface-hover",
          className,
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-semibold">{label}</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
        <Switch id={id} name={name} checked={checked} onCheckedChange={onChange} className="shrink-0 scale-125" />
      </label>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        bare ? "" : "rounded-md border border-border bg-surface-hover/60 p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} name={name} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** One titled group inside Easy mode's "More details". */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="text-lg font-semibold">{title}</h3>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------

/** A money box with the currency symbol built into the field, not the label. */
function MoneyInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-faint-foreground">
        $
      </span>
      <Input
        {...props}
        inputMode="decimal"
        placeholder="0.00"
        className={cn("pl-7 tabular-nums", className)}
      />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  easy = false,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Easy mode: a bigger label and message. */
  easy?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className={easy ? "text-base" : undefined}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className={cn("font-medium text-destructive", easy ? "text-sm" : "text-[13px]")}>{error}</p>
      ) : hint ? (
        <p className={cn("text-muted-foreground", easy ? "text-sm" : "text-[13px]")}>{hint}</p>
      ) : null}
    </div>
  );
}
