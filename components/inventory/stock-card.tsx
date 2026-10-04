import Link from "next/link";
import { Minus, Plus, ShoppingCart } from "lucide-react";

import { StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordCard } from "@/components/ui/record-card";
import { isServiceName } from "@/lib/catalog/match";
import { formatCents } from "@/lib/money";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { stockCount, stockSubtitle } from "./easy-lists";
import { ProductImage } from "./product-image";
import { stockStatus } from "./format";
import { FOOTER_ACTION, RecordWithActions } from "./record-with-actions";
import { StockFlag } from "./stock-badge";

export type StockCardProduct = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  priceCents: number;
  stockQty: number;
  lowStockAt: number | null;
  active: boolean;
  serialized: boolean;
  /** `/files/<id>` of the product's own photo, if it has one. */
  imageUrl: string | null;
  /** Key of a catalog picture chosen on purpose; null or missing = pick it from the name. */
  catalogImage?: string | null;
};

/**
 * One product in the Easy-mode stock list, in the same card the other lists use.
 *
 *   [ photo ]  Product name                       36
 *              SKU · $price                      left
 *                                               [Low]
 *   [   -   ]  |  [   +   ]
 *
 * The card opens the product. How many are on the shelf is the big number on the
 * right, with the word Low or Out under it for anything that needs ordering. The
 * strip underneath is the shop's most-used action: one tap to take one out or put
 * one in (it opens the usual adjust dialog with the change filled in). Those
 * buttons sit BESIDE the card link, not inside it. A serialized product has no
 * +/-, because a count cannot say which handset left, so it gets "Manage units"
 * (which opens the product at its units). A service that is not counted (labour,
 * a bench fee) has nothing to add or take off, so it gets no strip at all.
 *
 * `orderHref` (owners, low or out items) adds "Order more": a new order with this
 * item already on it.
 */
export function StockCard({ product, orderHref }: { product: StockCardProduct; orderHref?: string }) {
  const count = stockCount(product);
  const service = stockStatus(product) === "untracked" && isServiceName({ name: product.name, category: product.category });
  const card = {
    href: `/inventory/${product.id}`,
    visual: (
        // ProductImage rather than PhotoVisual: it also loads a photo from /files (which
        // next/image's optimiser cannot, it has no cookie) and fills in a reference photo.
        <ProductImage
          productId={product.id}
          name={product.name}
          category={product.category}
          catalogImage={product.catalogImage}
          imageUrl={product.imageUrl}
          className="size-20 rounded-xl border border-border sm:size-24"
          sizes="96px"
        />
    ),
    title: <span className="block line-clamp-2 whitespace-normal break-words">{product.name}</span>,
    subtitle: stockSubtitle({ sku: product.sku, priceLabel: formatCents(product.priceCents) }),
    status: product.active ? null : <StatusPill tone="neutral" label="Inactive" />,
    trailing: (
        <span className="flex h-full min-w-14 flex-col items-end justify-center gap-1.5">
          <span className="flex flex-col items-end leading-none">
            <span className="rf-num text-[28px] font-semibold tabular-nums">{count.value}</span>
            <span className="mt-1 max-w-[4.5rem] text-right text-sm leading-tight text-muted-foreground">{count.unit}</span>
          </span>
          {product.active ? <StockFlag product={product} size="md" /> : null}
        </span>
    ),
  };

  if (service && !orderHref) {
    return (
      <li className="flex">
        <RecordCard className="min-w-0 flex-1" {...card} />
      </li>
    );
  }

  const order = orderHref ? (
    <Button variant="ghost" asChild className={`${FOOTER_ACTION} gap-1.5 font-semibold text-foreground`}>
      <Link href={orderHref} aria-label={`Order more ${product.name}`}>
        <ShoppingCart className="size-5" aria-hidden />
        Order more
      </Link>
    </Button>
  ) : null;

  return (
    <RecordWithActions
      {...card}
      actions={
        product.serialized ? (
          <>
            <Button variant="ghost" asChild className={FOOTER_ACTION}>
              <Link href={`/inventory/${product.id}#units`}>Manage units</Link>
            </Button>
            {order}
          </>
        ) : (
          <>
            <AdjustStockDialog
              productId={product.id}
              productName={product.name}
              stockQty={product.stockQty}
              initialDelta={-1}
              trigger={
                <Button type="button" variant="ghost" className={`${FOOTER_ACTION} text-foreground`} aria-label={`Decrease stock for ${product.name}`}>
                  <Minus className="size-5" aria-hidden />
                </Button>
              }
            />
            <AdjustStockDialog
              productId={product.id}
              productName={product.name}
              stockQty={product.stockQty}
              initialDelta={1}
              trigger={
                <Button type="button" variant="ghost" className={`${FOOTER_ACTION} text-foreground`} aria-label={`Increase stock for ${product.name}`}>
                  <Plus className="size-5" aria-hidden />
                </Button>
              }
            />
            {order}
          </>
        )
      }
    />
  );
}
