"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronRight, ImageIcon, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { scrollLeftToReveal } from "@/components/ui/tab-row-scroll";
import type { CatalogEntry } from "@/lib/catalog/types";
import {
  ALL_PICTURES,
  changeButtonLabel,
  groupOfKey,
  pictureSuggestions,
  picturePage,
  resolvePicture,
  type PictureChoice,
} from "./picture-picker-logic";
import { PictureTile } from "./picture-tile";

/**
 * The product picture picker.
 *
 * It shows the picture the product will use, in one plain sentence ("Picture: Screen protector (found from
 * the name)"), follows the item name as it is typed, offers "Is it one of these?" for a one-tap fix, and opens
 * a "Change picture" window with a search box and group tabs. Its value is the key of a picture chosen on
 * purpose, or "" for "pick it from the name". The key rides along in a hidden input called "catalogImage"
 * (the server checks it again; the browser is never trusted).
 *
 * An uploaded photo always wins, so with one the picker says so and still lets the person choose the picture
 * that is used when there is no photo.
 */
export type ProductPicturePickerProps = {
  /** The item name as it is typed. The picture follows it. */
  name: string;
  category?: string | null;
  /** The chosen picture's key, or "" for automatic. */
  value: string;
  onChange: (key: string) => void;
  /** The product's own photo (a /files/... path or a browser preview), if it has one. */
  uploadedPhotoUrl?: string | null;
  /** A thumbnail row instead of the big preview: for the quick add window and the dense form. */
  compact?: boolean;
  /** Name of the hidden input. The server reads "catalogImage". */
  fieldName?: string;
  className?: string;
};

export function ProductPicturePicker({
  name,
  category = null,
  value,
  onChange,
  uploadedPhotoUrl = null,
  compact = false,
  fieldName = "catalogImage",
  className,
}: ProductPicturePickerProps) {
  // The matcher is fast; deferring just keeps typing smooth while the picture catches up.
  const typed = React.useDeferredValue(name);
  const choice = React.useMemo(
    () => resolvePicture({ name: typed, category, value, uploadedPhotoUrl }),
    [typed, category, value, uploadedPhotoUrl],
  );
  const suggestions = React.useMemo(
    () => pictureSuggestions({ name: typed, category, value, uploadedPhotoUrl }, compact ? 3 : 4),
    [typed, category, value, uploadedPhotoUrl, compact],
  );
  // The quick add window stays short: it only offers guesses when nothing matched.
  const offered = compact && choice.entrySource !== "none" ? [] : suggestions;

  const [open, setOpen] = React.useState(false);
  const opener = React.useRef<HTMLElement | null>(null);
  const openFrom = (event: React.MouseEvent<HTMLElement>) => {
    opener.current = event.currentTarget;
    setOpen(true);
  };
  const ids = React.useId();

  const dialog = (
    <PictureWindow
      open={open}
      onOpenChange={setOpen}
      choice={choice}
      opener={opener}
      onPick={(entry) => {
        onChange(entry.key);
        setOpen(false);
      }}
      onAutomatic={() => {
        onChange("");
        setOpen(false);
      }}
    />
  );

  if (compact) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <input type="hidden" name={fieldName} value={choice.chosenKey} />
        <button
          type="button"
          onClick={openFrom}
          aria-label={`${choice.sentence}. ${changeButtonLabel(choice)}`}
          className="flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl border border-border bg-surface p-2 text-left transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Preview choice={choice} className="size-16 shrink-0 rounded-lg" sizes="64px" iconOnly />
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{choice.sentence}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 pr-1 text-sm font-semibold text-muted-foreground">
            {changeButtonLabel(choice) === "Pick a picture" ? "Pick" : "Change"}
            <ChevronRight aria-hidden className="size-4" />
          </span>
        </button>
        {offered.length > 0 ? (
          <div role="group" aria-labelledby={`${ids}-ideas`} className="flex flex-col gap-1.5">
            <p id={`${ids}-ideas`} className="text-[13px] font-semibold text-muted-foreground">
              Is it one of these?
            </p>
            <div className="flex flex-wrap gap-2">
              {offered.map((entry) => (
                <SuggestionChip key={entry.key} entry={entry} onPick={() => onChange(entry.key)} />
              ))}
            </div>
          </div>
        ) : null}
        {dialog}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <input type="hidden" name={fieldName} value={choice.chosenKey} />
      {/* Phone and tablet standing up: the picture beside its words. Tablet lying down: stacked in a narrow column. */}
      <div className="flex items-center gap-4 lg:flex-col lg:items-stretch">
        <Preview
          choice={choice}
          // With nothing to show, the box shrinks on the tablet so the guesses below it stay on screen.
          className={cn("size-36 shrink-0 sm:size-40 lg:size-auto lg:w-full", choice.source === "none" ? "lg:aspect-[16/7]" : "lg:aspect-[4/3]")}
          sizes="(max-width: 1023px) 160px, 320px"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-none">
          <p role="status" aria-live="polite" className="text-[15px] font-medium leading-snug">
            {choice.sentence}
          </p>
          {choice.fallbackSentence ? <p className="text-[13px] leading-snug text-muted-foreground">{choice.fallbackSentence}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col">
            <Button type="button" variant="outline" onClick={openFrom} className="h-12 flex-1 px-4 text-[15px] sm:flex-none lg:flex-none">
              {changeButtonLabel(choice)}
            </Button>
            {choice.chosenKey ? (
              <Button type="button" variant="ghost" onClick={() => onChange("")} className="h-12 px-4 text-[15px]">
                Use automatic
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      {offered.length > 0 ? (
        <div role="group" aria-labelledby={`${ids}-ideas`} className="flex flex-col gap-2">
          <p id={`${ids}-ideas`} className="text-sm font-semibold text-muted-foreground">
            Is it one of these?
          </p>
          {/* A phone slides sideways (the next one peeks out); a tablet shows them all. */}
          <div
            style={{ scrollbarWidth: "none" }}
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-2 [&::-webkit-scrollbar]:hidden"
          >
            {offered.map((entry) => (
              <PictureTile key={entry.key} entry={entry} size="small" className="w-[6.75rem] shrink-0 sm:w-auto" onPick={() => onChange(entry.key)} />
            ))}
          </div>
        </div>
      ) : null}
      {dialog}
    </div>
  );
}

/** A small picture that follows the same rules as the picker (for a summary bar), with no buttons. */
export function PictureThumb({
  name,
  category = null,
  value,
  uploadedPhotoUrl = null,
  className,
}: Pick<ProductPicturePickerProps, "name" | "category" | "value" | "uploadedPhotoUrl" | "className">) {
  const choice = React.useMemo(() => resolvePicture({ name, category, value, uploadedPhotoUrl }), [name, category, value, uploadedPhotoUrl]);
  return <Preview choice={choice} className={cn("size-12 shrink-0 rounded-lg", className)} sizes="48px" iconOnly />;
}

/** The picture that will be used, on a white canvas (the pictures are shot on white in every theme). */
function Preview({ choice, className, sizes, iconOnly = false }: { choice: PictureChoice; className?: string; sizes: string; iconOnly?: boolean }) {
  const src = choice.photoUrl ?? choice.entry?.image ?? null;
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-2xl border border-border", src ? "bg-white" : "bg-surface-hover", className)}>
      {src ? (
        // The sentence beside it says what the picture is, so the picture itself is decoration.
        // A photo comes from /files (needs the cookie) or from this browser, so neither goes through the optimiser.
        <Image src={src} alt="" fill sizes={sizes} unoptimized={Boolean(choice.photoUrl)} className="object-contain p-2" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-muted-foreground" data-empty-picture="">
          <ImageIcon aria-hidden className={iconOnly ? "size-6" : "size-8"} strokeWidth={1.4} />
          {iconOnly ? null : <span className="text-xs leading-tight">No picture yet</span>}
        </div>
      )}
    </div>
  );
}

function SuggestionChip({ entry, onPick }: { entry: CatalogEntry; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Use ${entry.label}`}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface py-1 pl-1.5 pr-3 text-sm font-semibold transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative size-9 shrink-0 overflow-hidden rounded-md bg-white">
        <Image src={entry.image} alt="" fill sizes="36px" className="object-contain p-0.5" />
      </span>
      {entry.label}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// The "Change picture" window
// ---------------------------------------------------------------------------------------------

function PictureWindow({
  open,
  onOpenChange,
  choice,
  opener,
  onPick,
  onAutomatic,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  choice: PictureChoice;
  /** The button that opened the window: focus goes back to it when it closes. */
  opener: React.RefObject<HTMLElement | null>;
  onPick: (entry: CatalogEntry) => void;
  onAutomatic: () => void;
}) {
  const search = React.useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Phone: a tall sheet from the bottom (the app's own dialog rule). Tablet and up: a roomy centred window.
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-3 overflow-hidden rounded-none p-4 sm:h-[min(46rem,90dvh)] sm:max-w-[min(56rem,calc(100vw-2rem))] sm:rounded-2xl sm:p-5"
        onOpenAutoFocus={(event) => {
          // A finger should see the pictures, not a keyboard covering them; a keyboard user can start typing.
          event.preventDefault();
          if (window.matchMedia("(pointer: fine)").matches) search.current?.focus();
          else (event.currentTarget as HTMLElement).focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <PictureBrowser choice={choice} searchRef={search} onPick={onPick} onAutomatic={onAutomatic} />
      </DialogContent>
    </Dialog>
  );
}

function PictureBrowser({
  choice,
  searchRef,
  onPick,
  onAutomatic,
}: {
  choice: PictureChoice;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onPick: (entry: CatalogEntry) => void;
  onAutomatic: () => void;
}) {
  const [query, setQuery] = React.useState("");
  // Opens on the group of the picture in use, so it is right there; otherwise on everything.
  const [group, setGroup] = React.useState(() => groupOfKey(choice.entry?.key));
  const word = React.useDeferredValue(query);
  const page = React.useMemo(() => picturePage(word, group), [word, group]);
  const tabs = React.useRef<HTMLDivElement>(null);

  // The tab that is on is scrolled into view, like the tabs on the lists.
  React.useLayoutEffect(() => {
    const row = tabs.current;
    const tab = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !tab) return;
    const rowBox = row.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const next = scrollLeftToReveal({
      rowLeft: rowBox.left,
      rowWidth: rowBox.width,
      scrollLeft: row.scrollLeft,
      scrollWidth: row.scrollWidth,
      tabLeft: tabBox.left,
      tabWidth: tabBox.width,
    });
    if (next !== null) row.scrollLeft = next;
  }, [page.group]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl">Pick a picture</DialogTitle>
        <DialogDescription className="sr-only sm:not-sr-only">Search by name or choose a group. Tap a picture to use it.</DialogDescription>
      </DialogHeader>

      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search pictures"
          placeholder="Search, for example charger"
          value={query}
          enterKeyHint="search"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            // A new search looks everywhere; the tabs then narrow it down.
            setGroup(ALL_PICTURES);
          }}
          onKeyDown={(event) => {
            // Enter means "I am done typing": close the keyboard so the pictures are in view.
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="h-14 rounded-xl pl-12 text-[17px] pointer-coarse:min-h-14 pointer-coarse:text-[17px]"
        />
      </div>

      <div
        ref={tabs}
        role="group"
        aria-label="Picture groups"
        // The app's global thin scrollbar rule is not in a layer, so only an inline style can switch it off here.
        style={{ scrollbarWidth: "none" }}
        className="-mx-1 flex shrink-0 items-center gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden"
      >
        {page.tabs.map((tab) => {
          const active = tab.name === page.group;
          return (
            <button
              key={tab.name}
              type="button"
              aria-pressed={active}
              onClick={() => setGroup(tab.name)}
              className={cn(
                "inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-[15px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
              )}
            >
              {tab.name}
              <span
                className={cn(
                  "rf-num min-w-6 rounded-full px-1.5 py-0.5 text-center text-[13px] font-semibold tabular-nums",
                  active ? "bg-accent-foreground/15 text-accent-foreground" : "bg-surface-hover text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <p role="status" className="sr-only">
        {page.entries.length === 1 ? "1 picture" : `${page.entries.length} pictures`}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {page.entries.length === 0 ? (
          <p className="px-1 py-8 text-center text-base text-muted-foreground">
            No pictures found for &ldquo;{word.trim()}&rdquo;. Try another word, like case or charger.
          </p>
        ) : (
          <ul role="list" className="grid grid-cols-2 gap-3 p-1 pb-3 sm:grid-cols-3 lg:grid-cols-4">
            {page.entries.map((entry) => (
              <li key={entry.key} className="flex">
                <PictureTile entry={entry} selected={entry.key === choice.entry?.key} onPick={onPick} className="w-full" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {choice.chosenKey ? (
        <DialogFooter className="shrink-0 flex-col items-stretch gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Or let the picture follow the item name again.</p>
          <Button type="button" variant="outline" onClick={onAutomatic} className="h-12 px-5 text-[15px]">
            Use automatic
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}
