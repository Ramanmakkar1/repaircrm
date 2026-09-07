"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/components/ui/cn";
import { Td, Th } from "@/components/ui/table";

/**
 * Selecting rows, and doing one thing to all of them.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The app has ten list screens and, until this file, not one checkbox. A shop
 * with forty open tickets could not assign five to a tech, or mark three ready
 * for pickup, without opening five pages and making five round trips. Every
 * tool people actually live in has this; its absence is the largest functional
 * hole left in the tables.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE
 * ---------------------------------------------------------------------------
 * `useSelection` owns the ids. `<SelectAllCell>` and `<SelectRowCell>` are the
 * two table cells. `<BulkActionBar>` is the bar that rises when anything is
 * selected. A screen wires the three together and supplies its own actions —
 * this file has no opinion about what "bulk" means for a ticket versus an
 * invoice, only about how choosing rows looks and behaves.
 *
 * Selection is deliberately NOT in the URL. It is a transient gesture, not a
 * view: nobody wants to share "these nine tickets I had highlighted", and a
 * back button that restores a stale selection over a changed list is a way to
 * act on the wrong records.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A CONTEXT AS WELL AS A HOOK
 * ---------------------------------------------------------------------------
 * Every list screen in this app is a SERVER component: it queries Prisma and
 * renders the whole table. A server component cannot call a hook, and cannot
 * hold the `Selection` object that `<SelectAllCell selection={…}>` wants as a
 * prop. Prop-drilling it would mean moving ~150 lines of row markup per screen
 * across the client boundary — putting every row of the tickets list in the
 * browser bundle to win three checkboxes.
 *
 * So `<SelectionScope>` is a client component that owns the hook and publishes
 * the selection on a context, while its `children` stay server-rendered and
 * pass through untouched. `<SelectAll>`, `<SelectRow>` and `<BulkBar>` read it
 * from there. The prop-taking versions below them still exist and are still
 * the real implementation — a list that genuinely is one client component can
 * use them directly.
 */

export interface Selection {
  selected: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** Shift-click support: select the range between the last click and this one. */
  toggleRange: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
  someSelected: boolean;
}

export function useSelection(ids: readonly string[]): Selection {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const lastClicked = React.useRef<string | null>(null);

  /*
   * Rows the list no longer contains must not stay selected — a filter change
   * or a refresh that drops a row would otherwise leave an invisible id in the
   * set, and the action bar would act on something the operator cannot see.
   *
   * Pruned DURING RENDER against the previous id list, not in an effect.
   * React supports exactly this shape for adjusting state when a prop changes,
   * and it re-renders before committing, so the bar's count is never briefly
   * wrong. An effect would paint the stale count for a frame first — and would
   * trip React 19's `set-state-in-effect` rule, which exists to say so.
   */
  const idKey = ids.join(",");
  const [seenKey, setSeenKey] = React.useState(idKey);
  if (seenKey !== idKey) {
    setSeenKey(idKey);
    if (selected.size > 0) {
      const live = new Set(ids);
      const pruned = new Set([...selected].filter((id) => live.has(id)));
      if (pruned.size !== selected.size) setSelected(pruned);
    }
  }

  const toggle = React.useCallback((id: string) => {
    lastClicked.current = id;
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const toggleRange = React.useCallback(
    (id: string) => {
      const anchor = lastClicked.current;
      lastClicked.current = id;
      if (!anchor || anchor === id) {
        setSelected((current) => {
          const next = new Set(current);
          if (!next.delete(id)) next.add(id);
          return next;
        });
        return;
      }
      const from = ids.indexOf(anchor);
      const to = ids.indexOf(id);
      if (from < 0 || to < 0) return;
      const [start, end] = from < to ? [from, to] : [to, from];
      setSelected((current) => {
        const next = new Set(current);
        for (const rangeId of ids.slice(start, end + 1)) next.add(rangeId);
        return next;
      });
    },
    [ids],
  );

  const toggleAll = React.useCallback(() => {
    setSelected((current) =>
      current.size === ids.length ? new Set() : new Set(ids),
    );
  }, [ids]);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    count: selected.size,
    isSelected: (id) => selected.has(id),
    toggle,
    toggleRange,
    toggleAll,
    clear,
    allSelected: ids.length > 0 && selected.size === ids.length,
    someSelected: selected.size > 0 && selected.size < ids.length,
  };
}

/** The header checkbox. Indeterminate when only some rows are chosen. */
export function SelectAllCell({ selection }: { selection: Selection }) {
  return (
    <Th className="w-9 pr-0">
      <Checkbox
        checked={
          selection.allSelected
            ? true
            : selection.someSelected
              ? "indeterminate"
              : false
        }
        onCheckedChange={selection.toggleAll}
        aria-label={selection.allSelected ? "Clear selection" : "Select all"}
      />
    </Th>
  );
}

/**
 * A row checkbox.
 *
 * `stopPropagation` matters: these tables use `RowLink`, where clicking the row
 * navigates. Without it, ticking a box would tick the box AND open the record —
 * so selecting five things would open five pages.
 */
export function SelectRowCell({
  selection,
  id,
  label,
}: {
  selection: Selection;
  id: string;
  /** What is being selected, for screen readers — "ticket #1043". */
  label: string;
}) {
  return (
    <Td
      className="w-9 pr-0"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <Checkbox
        checked={selection.isSelected(id)}
        onClick={(event) => {
          if ((event as React.MouseEvent).shiftKey) {
            event.preventDefault();
            selection.toggleRange(id);
          }
        }}
        onCheckedChange={() => selection.toggle(id)}
        aria-label={`Select ${label}`}
      />
    </Td>
  );
}

/**
 * A bare selection checkbox, for a CARD rather than a table row.
 *
 * `SelectRowCell` renders a `<Td>` and only makes sense inside a `<Tr>`. A card
 * grid needs the same behaviour with no cell around it — positioned by the
 * caller, usually pinned to the card's top-left and revealed on hover so a
 * quiet grid stays quiet until you start choosing.
 *
 * `stopPropagation` matters even more here than in a table: the whole card is
 * wrapped in a `<Link>`, so without it ticking a box would also navigate, and
 * selecting five tickets would open five pages.
 */
export function SelectBox({
  selection,
  id,
  label,
  className,
}: {
  selection: Selection;
  id: string;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex", className)}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <Checkbox
        checked={selection.isSelected(id)}
        onClick={(event) => {
          if ((event as React.MouseEvent).shiftKey) {
            event.preventDefault();
            selection.toggleRange(id);
          }
        }}
        onCheckedChange={() => selection.toggle(id)}
        aria-label={`Select ${label}`}
      />
    </span>
  );
}

/**
 * The bar that rises when rows are chosen.
 *
 * Fixed to the bottom of the viewport rather than inserted above the table, so
 * the list does not jump down by 56px the moment you tick the first box — the
 * row under your cursor has to stay under your cursor.
 */
export function BulkActionBar({
  selection,
  noun,
  children,
}: {
  selection: Selection;
  /** Singular noun: "ticket", "invoice". Pluralised with a naive "s". */
  noun: string;
  /** The actions. Buttons at `size="sm"`. */
  children: React.ReactNode;
}) {
  const { count, clear } = selection;

  // Escape clears, the way it closes everything else in the app.
  React.useEffect(() => {
    if (count === 0) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") clear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, clear]);

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5",
        "transition-[opacity,transform] duration-150 ease-out",
        count > 0
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-3 overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 shadow-lg",
          count === 0 && "invisible",
        )}
      >
        <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-foreground">
          <span className="rf-num">{count}</span> {noun}
          {count === 1 ? "" : "s"} selected
        </span>
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <div className="flex shrink-0 items-center gap-2">{children}</div>
        <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
        <button
          type="button"
          onClick={clear}
          className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * The server-component bridge
 * ---------------------------------------------------------------------- */

const SelectionContext = React.createContext<Selection | null>(null);

/**
 * Wraps a table and its action bar.
 *
 * `ids` must be the ids of the rows CURRENTLY RENDERED, in render order — the
 * hook prunes anything that leaves the list, and shift-click reads the range
 * out of this array, so an order that disagrees with the screen selects the
 * wrong span.
 */
export function SelectionScope({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const selection = useSelection(ids);
  return (
    <SelectionContext.Provider value={selection}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useRowSelection(): Selection {
  const selection = React.useContext(SelectionContext);
  if (!selection) {
    throw new Error("useRowSelection must be used inside a <SelectionScope>.");
  }
  return selection;
}

/** The header checkbox cell. Drop it in as the first `<Th>` of the head row. */
export function SelectAll() {
  return <SelectAllCell selection={useRowSelection()} />;
}

/** A row checkbox cell. Drop it in as the first `<Td>` of each row. */
export function SelectRow({ id, label }: { id: string; label: string }) {
  return <SelectRowCell selection={useRowSelection()} id={id} label={label} />;
}

/**
 * The bar that rises when rows are chosen. Render it as the last child of the
 * scope; the actions inside it read the ids with `useRowSelection()`.
 */
export function BulkBar({
  noun,
  children,
}: {
  noun: string;
  children: React.ReactNode;
}) {
  return (
    <BulkActionBar selection={useRowSelection()} noun={noun}>
      {children}
    </BulkActionBar>
  );
}

/** A card checkbox, reading the selection from `<SelectionScope>`. */
export function SelectCard({
  id,
  label,
  className,
}: {
  id: string;
  label: string;
  className?: string;
}) {
  return (
    <SelectBox
      selection={useRowSelection()}
      id={id}
      label={label}
      className={className}
    />
  );
}
