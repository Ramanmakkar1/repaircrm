"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookmarkPlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSavedViewAction,
  deleteSavedViewAction,
} from "@/app/(app)/saved-views-actions";
import { Button } from "@/components/ui/button";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { cn } from "@/components/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SAVED_VIEW_LIMIT,
  SAVED_VIEW_NAME_MAX,
  normalizeViewQuery,
  type SavedViewItem,
} from "@/lib/saved-views";

/**
 * The "save this filter" control that sits at the end of a list's tab strip.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SAVED VIEWS THEMSELVES ARE NOT IN HERE
 * ---------------------------------------------------------------------------
 * They render as ordinary `FilterTabs` entries, built on the server by the
 * page. That is deliberate: a saved view IS a view, and if it looked different
 * from "Open jobs" it would read as a different kind of thing. This component
 * is only the verb — save, and manage what you have saved.
 *
 * The management list lives in the same dialog as the save form rather than
 * behind an × on every tab. An × on a tab has to be small enough not to fight
 * the tab's own click target, at which point it is too small to hit — and
 * deleting a view is rare enough that it does not deserve permanent pixels on
 * a strip you look at all day.
 */
export function SavedViewsControl({
  path,
  views,
  builtIn = [],
}: {
  path: string;
  views: SavedViewItem[];
  /**
   * The screen's own tabs, as `{ label, query }`, already normalised.
   *
   * Without these you can save "Waiting for Parts" as "Parts queue" and end up
   * with two tabs highlighted for one URL — which reads as a bug even though
   * both are telling the truth. Refusing the duplicate stops the state from
   * arising at all, which is better than rendering around it afterwards.
   */
  builtIn?: { label: string; query: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, startBusy] = React.useTransition();

  const currentQuery = normalizeViewQuery(searchParams.toString());

  /**
   * Nothing is filtered, so there is nothing to name. Saving the bare list
   * would create a view identical to the first built-in tab.
   */
  const nothingToSave = currentQuery === "";

  /** This exact filter already has a name — offer that instead of a duplicate. */
  const alreadySaved = views.find((view) => view.query === currentQuery);

  /** …or it is one of the tabs this screen ships with. */
  const alreadyBuiltIn = builtIn.find((tab) => tab.query === currentQuery);

  const atLimit = views.length >= SAVED_VIEW_LIMIT;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;

    startBusy(async () => {
      const result = await createSavedViewAction({
        path,
        name: trimmed,
        query: currentQuery,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setName("");
      setOpen(false);
      toast.success(`Saved "${trimmed}".`);
      router.refresh();
    });
  }

  /**
   * Remove, and offer it straight back.
   *
   * A `SavedView` is a leaf — nothing in the schema references one — and this
   * component is holding its name and its query, so re-creating is a genuine
   * restore rather than a button that looks like one. The row returns with a
   * new id, which nothing can observe.
   */
  function remove(view: SavedViewItem) {
    startBusy(async () => {
      const result = await deleteSavedViewAction(view.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // If the view being deleted is the one on screen, go back to the plain
      // list rather than leaving the page on a filter with no tab.
      if (view.query === currentQuery) router.push(pathname);
      else router.refresh();

      toastWithUndo({
        message: `"${view.name}" removed.`,
        undo: async () => {
          const restored = await createSavedViewAction({
            path,
            name: view.name,
            query: view.query,
          });
          if (!restored.ok) throw new Error(restored.error);
          router.refresh();
        },
        onUndoError: "Could not put that view back.",
      });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium transition-colors",
          "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        aria-label="Save or manage views"
      >
        <BookmarkPlus aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">Save view</span>
      </button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Saved views</DialogTitle>
            <DialogDescription>
              Name the filter you are looking at and it becomes a tab on this
              screen — for you, not the whole shop.
            </DialogDescription>
          </DialogHeader>

          {nothingToSave ? (
            <p className="rounded-md border border-border bg-surface-hover px-3 py-2 text-[13px] text-muted-foreground">
              Nothing is filtered right now. Pick a view, a status or a search
              first, then save it.
            </p>
          ) : alreadyBuiltIn ? (
            <p className="rounded-md border border-border bg-surface-hover px-3 py-2 text-[13px] text-muted-foreground">
              That is the{" "}
              <span className="font-semibold text-foreground">
                {alreadyBuiltIn.label}
              </span>{" "}
              tab already. Narrow it further — a search, a tech, a due date —
              and the result is worth a name.
            </p>
          ) : alreadySaved ? (
            <p className="rounded-md border border-border bg-surface-hover px-3 py-2 text-[13px] text-muted-foreground">
              This filter is already saved as{" "}
              <span className="font-semibold text-foreground">
                {alreadySaved.name}
              </span>
              .
            </p>
          ) : atLimit ? (
            <p className="rounded-md border border-border bg-surface-hover px-3 py-2 text-[13px] text-muted-foreground">
              You have {SAVED_VIEW_LIMIT} views on this screen, which is the
              most a tab strip can carry. Remove one to save another.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="saved-view-name">Name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="saved-view-name"
                  value={name}
                  autoFocus
                  maxLength={SAVED_VIEW_NAME_MAX}
                  placeholder="Waiting on parts"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      save();
                    }
                  }}
                />
                <Button size="sm" disabled={busy || !name.trim()} onClick={save}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          )}

          {views.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-border pt-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-faint-foreground">
                Your views
              </p>
              <ul className="flex flex-col">
                {views.map((view) => (
                  <li
                    key={view.id}
                    className="flex items-center justify-between gap-3 rounded-md px-1 py-1.5 hover:bg-surface-hover"
                  >
                    <span className="min-w-0 truncate text-[13.5px] text-foreground">
                      {view.name}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(view)}
                      aria-label={`Remove ${view.name}`}
                      className="shrink-0 rounded-sm p-1 text-faint-foreground transition-colors hover:bg-destructive-soft hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
