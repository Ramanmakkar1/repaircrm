"use client";

import { Minus, Pencil, Plus, Tag, Trash2 } from "lucide-react";

import { ProductImage } from "@/components/inventory/product-image";
import { cn } from "@/components/ui/cn";
import { formatCents } from "@/lib/money";
import type { ProductOption } from "../types";
import type { BillLine } from "./flow";

function Step({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors",
        "hover:bg-surface-hover active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}

/**
 * One line of "This invoice": the picture on the left, then the name with what
 * it comes to, and under them the big minus and plus with Edit and the bin on
 * the same row. Stepping to zero takes the line off. A line that is one specific
 * unit (a serialized product on an invoice) has nothing to step, so it shows
 * its serial number instead.
 *
 * Built to stay short, because the panel on a counter tablet has room for only
 * a few of them: the picture does not get a row of its own, and the price of
 * one ("$89.00 each") sits under the name only when there is more than one, so
 * a plain line is the name row plus one 48px row of buttons (about 90px).
 */
export function LineRow({
  line,
  product,
  unit,
  onQuantity,
  onEdit,
  onRemove,
}: {
  line: BillLine;
  product?: ProductOption;
  /** One specific unit: no steppers. */
  unit: boolean;
  onQuantity: (quantity: number) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const serial = line.serial.trim();
  const each = !unit && line.quantity > 1;
  return (
    <li className="flex gap-3 py-2">
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
          <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
            {line.description}
          </span>
          <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground">
            {formatCents(line.quantity * line.unitPriceCents)}
          </span>
        </div>
        {each || serial || !line.taxable ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
            {each ? <span className="tabular-nums">{formatCents(line.unitPriceCents)} each</span> : null}
            {serial ? <span className="font-mono font-semibold text-accent-soft-foreground [overflow-wrap:anywhere]">Serial {serial}</span> : null}
            {line.taxable ? null : <span className="font-semibold">No tax</span>}
          </span>
        ) : null}
        <div data-line-controls="" className="flex items-center gap-1">
          {unit ? (
            <span className="min-w-0 flex-1 truncate text-[13px] tabular-nums text-muted-foreground">One unit · {formatCents(line.unitPriceCents)}</span>
          ) : (
            <>
              <Step label={`Fewer ${line.description}`} icon={Minus} onClick={() => onQuantity(line.quantity - 1)} />
              <span className="w-8 text-center text-[17px] font-bold tabular-nums text-foreground" aria-live="polite">{line.quantity}</span>
              <Step label={`More ${line.description}`} icon={Plus} onClick={() => onQuantity(line.quantity + 1)} />
              <span className="min-w-0 flex-1" />
            </>
          )}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${line.description}`}
            title="Edit this item"
            className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Pencil className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${line.description}`}
            className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}
