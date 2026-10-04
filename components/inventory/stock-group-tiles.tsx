import { Check } from "lucide-react";

import { PictureTile } from "@/components/counter/picture-tile";
import { catalogEntryByKey } from "@/lib/catalog/match";
import { groupPhoto, type StockGroup } from "@/lib/inventory/groups";
import { productImageSource } from "@/lib/inventory/product-images";
import { groupDetail } from "./easy-lists";

export type GroupTile = {
  key: string;
  title: string;
  detail: string;
  photo: string;
  href: string;
};

/**
 * The shelves as picture boxes: "All products" first, then each group, each with
 * a picture and its stock count. `hrefFor` turns a group key into the Stock URL
 * that opens it, so the page keeps owning how a view is spelled in the address bar.
 *
 * A shelf with no picture of its own wears the picture someone chose for one of
 * its products (a key lookup, no matching), before the guess from its name.
 */
export function groupTiles(
  groups: StockGroup[],
  everything: { quantity: number; productIds: string[] },
  hrefFor: (groupKey: string) => string,
): GroupTile[] {
  const picture = (label: string) => productImageSource({ name: label, category: label }).src ?? null;
  const all: StockGroup = { key: "all", label: "All products", ...everything };
  return [all, ...groups].map((item) => ({
    key: item.key,
    title: item.label,
    detail: groupDetail(item.quantity, item.productIds.length),
    photo: groupPhoto(item.key, item.label, (label) => catalogEntryByKey(item.chosenImage)?.image ?? picture(label)),
    href: hrefFor(item.key),
  }));
}

/**
 * Same grid as the Home screen's boxes, so choosing a shelf feels like choosing a Home box.
 *
 * `current` is the key of the shelf being looked at. Its box is outlined, tinted and wears
 * the word "Current" (never colour alone), and the cell says `aria-current` for screen
 * readers, because PictureTile itself has no notion of a selected state.
 */
export function StockGroupTiles({ tiles, current = null }: { tiles: GroupTile[]; current?: string | null }) {
  return (
    <section aria-label="Inventory groups">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {tiles.map((tile) => {
          const isCurrent = tile.key === current;
          return (
            <li key={tile.key} className="relative" aria-current={isCurrent ? "true" : undefined}>
              <PictureTile
                href={tile.href}
                title={tile.title}
                detail={tile.detail}
                photo={tile.photo}
                className={isCurrent ? "border-accent bg-accent-soft" : undefined}
              />
              {isCurrent ? (
                <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-sm font-semibold text-accent-foreground shadow-sm">
                  <Check className="size-4" aria-hidden />
                  Current
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
