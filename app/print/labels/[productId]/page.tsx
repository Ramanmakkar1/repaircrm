import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/billing/barcode";
import { PrintLabelCount } from "@/components/billing/print-label-count";
import { PrintToolbar } from "@/components/billing/print-toolbar";
import { barcodeValue, clampLabelCount } from "@/components/inventory/format";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Shelf labels · RepairFlow" };

/**
 * A sheet of shelf/bin labels for one product.
 *
 * Lives under /print (outside the (app) route group) for the same reason the
 * invoice and estimate print views do: paper wants a bare page, not the app
 * shell hidden behind print CSS. The shared print layout still runs
 * `requireUser()`, so this is exactly as protected as the rest of the app.
 *
 * The grid is sized in inches, not rems — a label is a physical object, and
 * `@page` is already in inches. Three across on letter paper lands close to the
 * common 1"×2⅝" address-label stock most shops have in the drawer, and stays
 * inside the narrower A4 column too.
 *
 * The type follows the house print family (same sans, same tabular mono, same
 * ink), just compressed: a label has one job, and at this size hierarchy is the
 * only thing keeping the name, the price and the code apart.
 */
export default async function ProductLabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ count?: string }>;
}) {
  const { shopId } = await requireUser();
  const { productId } = await params;
  const { count: rawCount } = await searchParams;

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
    },
  });
  if (!product) notFound();

  const count = clampLabelCount(rawCount);
  const value = barcodeValue(product);

  return (
    <>
      <style>{LABEL_CSS}</style>
      <PrintToolbar
        backHref={`/inventory/${product.id}`}
        backLabel="Back to product"
        title={product.name}
      >
        <PrintLabelCount productId={product.id} count={count} />
      </PrintToolbar>

      <div className="label-sheet">
        <div className="label-grid">
          {Array.from({ length: count }, (_, index) => (
            <div key={index} className="label">
              <div className="label-head">
                <span className="label-name">{product.name}</span>
                {product.category ? (
                  <span className="label-cat">{product.category}</span>
                ) : null}
              </div>
              <span className="label-price">{formatCents(product.priceCents)}</span>
              <Barcode value={value} height={26} width={1.2} className="label-code" />
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
 * reads come from `.print-root` in the shared stylesheet.
 */
const LABEL_CSS = `
.label-sheet {
  width: 100%;
  max-width: 8.5in;
  margin: 28px auto 56px;
  padding: 0.4in 0.4in 0.5in;
  background: var(--rf-paper, #fff);
  color: var(--rf-ink, #101418);
  font-family: var(--rf-sans);
  box-shadow:
    0 0 0 1px rgb(16 20 24 / 0.07),
    0 1px 2px rgb(16 20 24 / 0.1),
    0 20px 44px -14px rgb(16 20 24 / 0.28);
}
.label-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.18in;
}
@media (min-width: 640px) {
  .label-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.05in;
  height: 1.15in;
  padding: 0.08in 0.1in;
  border: 1px dashed #cfd5dc;
  border-radius: 3px;
  background: #fff;
  overflow: hidden;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}
.label-head { width: 100%; }
.label-name {
  display: -webkit-box;
  width: 100%;
  font-size: 8pt;
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -0.005em;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.label-cat {
  display: block;
  margin-top: 0.015in;
  font-size: 5.5pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rf-ink-faint, #868e99);
}
.label-price {
  font-family: var(--rf-mono);
  font-size: 13pt;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.label-code { max-width: 100%; height: auto; }

@media print {
  @page { margin: 0.4in; }
  .label-sheet {
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .label-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.12in; }
  /* Cut guides only help on screen; on paper they waste toner. */
  .label { border-color: #e8ebef; }
}
`;
