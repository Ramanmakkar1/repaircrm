import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/billing/barcode";
import { barcodeValue, clampLabelCount } from "@/components/inventory/format";
import { LabelOptions } from "@/components/inventory/label-options";
import { BARCODE_SIZE, asLabelSize } from "@/components/inventory/label-sizes";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

/** The tab says which product, not the raw address, while the sheet is open. */
export async function generateMetadata({ params }: { params: Promise<{ productId: string }> }): Promise<Metadata> {
  const { shopId } = await requireUser();
  const { productId } = await params;
  const product = await db.product.findFirst({ where: { id: productId, shopId }, select: { name: true } });
  return { title: product ? `Labels: ${product.name} · Repairs helper` : "Shelf labels · Repairs helper" };
}

/**
 * Shelf / bin labels for one product.
 *
 * Lives under /print (outside the (app) route group) for the same reason the
 * invoice and estimate print views do: paper wants a bare page, not the app
 * shell hidden behind print CSS. The shared print layout still runs
 * `requireUser()`, so this is exactly as protected as the rest of the app.
 *
 * Above the sheet (never on paper) sit the choices in the app's own look: how
 * many, which size (a sheet of 3-across stock, a roll printer one at a time, or
 * small 4-across tags) and, for a serialized product, one label per unit with
 * its own serial barcode. Price and barcode are drawn big enough to read across
 * a counter and to scan with a phone camera.
 *
 * The grid is sized in inches, not rems: a label is a physical object.
 */
export default async function ProductLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ count?: string; size?: string; units?: string }>;
}) {
  const { shopId } = await requireUser();
  const { productId } = await params;
  const { count: rawCount, size: rawSize, units: rawUnits } = await searchParams;

  // Scoped by shopId — a guessed id from another tenant 404s rather than
  // printing somebody else's pricing.
  const product = await db.product.findFirst({
    where: { id: productId, shopId },
    select: {
      id: true,
      name: true,
      sku: true,
      upc: true,
      category: true,
      priceCents: true,
      serialized: true,
    },
  });
  if (!product) notFound();

  const units = product.serialized
    ? await db.productSerial.findMany({
        where: { shopId, productId: product.id, status: "IN_STOCK" },
        orderBy: { serial: "asc" },
        take: 200,
        select: { id: true, serial: true },
      })
    : [];

  const count = clampLabelCount(rawCount);
  const size = asLabelSize(rawSize);
  const perUnit = rawUnits === "1" && units.length > 0;
  const code = barcodeValue(product);
  const bars = BARCODE_SIZE[size];
  const labels = perUnit
    ? units.map((unit) => ({ key: unit.id, code: unit.serial, serial: unit.serial }))
    : Array.from({ length: count }, (_, index) => ({ key: String(index), code, serial: null as string | null }));

  return (
    <>
      <style>{LABEL_CSS}</style>
      <LabelOptions
        productName={product.name}
        backHref={`/inventory/${product.id}`}
        count={count}
        size={size}
        units={perUnit}
        unitCount={units.length}
      />

      <div className={`label-sheet label-${size}`}>
        <div className="label-grid">
          {labels.map((label) => (
            <div key={label.key} className="label">
              {size === "small" ? null : (
                <div className="label-head">
                  <span className="label-name">{product.name}</span>
                  {label.serial ? <span className="label-cat">Serial {label.serial}</span> : product.category ? <span className="label-cat">{product.category}</span> : null}
                </div>
              )}
              <span className="label-price">{formatCents(product.priceCents)}</span>
              <Barcode value={label.code} height={bars.height} width={bars.width} className="label-code" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Scoped to this route rather than added to the shared stylesheet, so the
 * invoice/estimate/statement sheets are untouched by it. The `--rf-*` tokens it
 * reads come from `.print-root` in the shared stylesheet (paper is white and ink
 * is black in every theme, because it is paper).
 */
const LABEL_CSS = `
.label-sheet {
  width: 100%;
  max-width: 8.5in;
  margin: 0 auto 56px;
  padding: 0.4in 0.4in 0.5in;
  background: var(--rf-paper);
  color: var(--rf-ink);
  font-family: var(--rf-sans);
  box-shadow: 0 0 0 1px rgb(16 20 24 / 0.07), 0 20px 44px -14px rgb(16 20 24 / 0.28);
}
.label-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.18in;
}
@media (min-width: 640px) {
  .label-sheet .label-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .label-small .label-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.label-roll .label-grid { grid-template-columns: repeat(auto-fill, 2.25in); justify-content: center; }
.label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.04in;
  height: 1.2in;
  padding: 0.08in 0.1in;
  border: 1px dashed var(--rf-rule-mid);
  border-radius: 3px;
  background: var(--rf-paper);
  overflow: hidden;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}
.label-roll .label { width: 2.25in; height: 1.25in; }
.label-small .label { height: 0.8in; padding: 0.05in; }
.label-head { width: 100%; }
.label-name {
  display: -webkit-box;
  width: 100%;
  font-size: 9pt;
  font-weight: 600;
  line-height: 1.15;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.label-cat {
  display: block;
  margin-top: 0.015in;
  font-size: 6.5pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--rf-ink-soft);
}
.label-price {
  font-family: var(--rf-sans);
  font-size: 16pt;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.label-roll .label-price { font-size: 18pt; }
.label-small .label-price { font-size: 12pt; }
.label-code { max-width: 100%; height: auto; }

@media print {
  @page { margin: 0.4in; }
  .label-sheet {
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .label-sheet .label-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.12in; }
  .label-small .label-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.1in; }
  /* A roll printer feeds one label per page: no gaps, a page break after each. */
  .label-roll .label-grid { display: block; }
  .label-roll .label { border: 0; break-after: page; page-break-after: always; margin: 0 auto; }
  /* Cut guides only help on screen; on paper they waste toner. */
  .label { border-color: var(--rf-rule); }
}
`;
