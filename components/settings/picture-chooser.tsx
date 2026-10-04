"use client";

import * as React from "react";
import Image from "next/image";
import { Check, ImageOff, Search } from "lucide-react";

import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { CATALOG } from "@/lib/catalog/entries";
import { CATALOG_GROUPS, catalogEntryByKey, catalogSearch } from "@/lib/catalog/match";
import type { CatalogEntry } from "@/lib/catalog/types";

/**
 * A small picture chooser over the on-server picture library (lib/catalog): a search box, a row of
 * group tabs and a grid of pictures. The chosen one is marked with a tick AND the word "Selected".
 * Built for the devices-and-problems editor; it knows nothing about products.
 */

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** One picture to tap. A real button with aria-pressed; the photo sits on its white canvas in every theme. */
export function PictureChoice({
  entry,
  selected,
  onClick,
  hint,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onClick: () => void;
  /** A small word under the name, e.g. "Best match". */
  hint?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex min-h-12 min-w-0 flex-col overflow-hidden rounded-xl border bg-surface text-left transition-[border-color,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        FOCUS,
        selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
      )}
    >
      <span className="relative block aspect-square w-full bg-white">
        <Image src={entry.image} alt="" fill sizes="(max-width: 640px) 30vw, 120px" className="object-contain p-1.5" />
      </span>
      <span className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5">
        <span className="text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">{entry.label}</span>
        {selected ? <span className="text-[12px] font-semibold text-muted-foreground">Selected</span> : hint ? <span className="text-[12px] text-muted-foreground">{hint}</span> : null}
      </span>
      {selected ? (
        <span aria-hidden className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

/** The "no picture" box: a neutral icon in a soft square. */
export function NoPictureChoice({ selected, onClick, detail }: { selected: boolean; onClick: () => void; detail?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex min-h-12 min-w-0 flex-col overflow-hidden rounded-xl border bg-surface text-left transition-[border-color,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        FOCUS,
        selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
      )}
    >
      <span className="flex aspect-square w-full items-center justify-center bg-surface-hover text-foreground">
        <ImageOff aria-hidden className="size-8" strokeWidth={1.5} />
      </span>
      <span className="flex flex-col gap-0.5 px-2 pb-2 pt-1.5">
        <span className="text-[13px] font-semibold leading-tight">No picture</span>
        {selected ? <span className="text-[12px] font-semibold text-muted-foreground">Selected</span> : detail ? <span className="text-[12px] text-muted-foreground">{detail}</span> : null}
      </span>
      {selected ? (
        <span aria-hidden className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

const GRID = "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5";

export function PictureChooser({
  value,
  onChoose,
  searchId = "picture-search",
}: {
  /** The chosen picture key, or "" for none. */
  value: string;
  onChoose: (key: string) => void;
  searchId?: string;
}) {
  const [query, setQuery] = React.useState("");
  const chosenGroup = catalogEntryByKey(value)?.group;
  const [group, setGroup] = React.useState(chosenGroup ?? CATALOG_GROUPS[0]?.name ?? "");
  const deferred = React.useDeferredValue(query);
  const searching = deferred.trim().length > 0;

  const entries = React.useMemo(
    () => (searching ? catalogSearch(deferred, 40) : CATALOG.filter((entry) => entry.group === group)),
    [searching, deferred, group],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">Search pictures</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pictures, like drone or battery"
          autoComplete="off"
          enterKeyHint="search"
          onKeyDown={(event) => {
            // Enter in this box searches; it must not save the sheet it sits in.
            if (event.key === "Enter") event.preventDefault();
          }}
          className="h-12 pl-9 text-base"
        />
      </div>

      {/*
        While a search is typed no group is chosen (the search covers them all),
        so no tab is filled in; they stay at full strength, because faded text
        is text people cannot read (it failed contrast at 60%).
      */}
      <div
        role="group"
        aria-label="Picture groups"
        className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {CATALOG_GROUPS.map((item) => {
          const active = !searching && item.name === group;
          return (
            <button
              key={item.name}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setQuery("");
                setGroup(item.name);
              }}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl border px-4 text-[15px] font-semibold transition-colors",
                FOCUS,
                active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-muted-foreground hover:border-ring hover:text-foreground",
              )}
            >
              {item.name}
            </button>
          );
        })}
      </div>

      {searching ? (
        <p className="text-[14px] text-muted-foreground" aria-live="polite">
          Pictures from every group that match &ldquo;{deferred.trim()}&rdquo;. Tap a group to browse instead.
        </p>
      ) : null}

      {entries.length > 0 ? (
        <div role="group" aria-label={searching ? "Pictures that match" : group} className={GRID}>
          {entries.map((entry) => (
            <PictureChoice key={entry.key} entry={entry} selected={entry.key === value} onClick={() => onChoose(entry.key)} />
          ))}
        </div>
      ) : (
        <p role="status" className="rounded-xl bg-surface-hover px-4 py-3 text-[14px] text-muted-foreground">
          No pictures match “{deferred.trim()}”. Try another word, or leave it without a picture.
        </p>
      )}
    </div>
  );
}
