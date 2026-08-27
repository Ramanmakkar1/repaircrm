import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Barcode } from "@/components/billing/barcode";
import { barcodeValue, clampLabelCount } from "@/components/inventory/format";
import { LabelToolbar } from "@/components/inventory/label-toolbar";
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
 * common 1"×2⅝" address-label stock most shops have in the drawer.
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
      <LabelToolbar productId={product.id} count={count} />

      <div className="label-sheet mx-auto w-full max-w-[8.5in] bg-white px-6 pb-10 print:px-0 print:pb-0">
        <div className="label-grid">
          {Array.from({ length: count }, (_, index) => (
            <div key={index} className="label">
              <span className="label-name">{product.name}</span>
              <span className="label-price">{formatCents(product.priceCents)}</span>
              <Barcode value={value} height={30} width={1.3} className="label-code" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Scoped to this route rather than added to the shared print layout, so the
 * invoice/estimate sheets are untouched by it.
 */
const LABEL_CSS = `
.label-sheet {
  color-scheme: light;
  color: #000;
}
.label-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.25in;
}
@media (min-width: 640px) {
  .label-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.06in;
  height: 1.1in;
  padding: 0.08in 0.1in;
  border: 1px dashed #c9c9c9;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
  text-align: center;
}
.label-name {
  width: 100%;
  font-size: 8.5pt;
  font-weight: 600;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.label-price {
  font-size: 12pt;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.label-code {
  max-width: 100%;
  height: auto;
}
@media print {
  @page { size: letter; margin: 0.4in; }
  .label-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.12in; }
  /* Cut guides only help on screen; on paper they waste toner. */
  .label { border-color: #e5e5e5; }
}
`;
