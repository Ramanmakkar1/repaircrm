"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, ChevronRight, Loader2, Plus, X } from "lucide-react";

import { ScanButton } from "@/components/scan/scan-button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { ICONS } from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { SEARCH_INPUT_PROPS } from "@/components/ui/auto-focus";
import { resolveScanAction } from "@/app/(app)/scan/actions";
import type { ScanResult } from "@/lib/scan/types";
import { OPEN_SEARCH } from "./open-search-button";
import { arrangeResults, TYPE_LABEL, type SearchGroup, type SearchItem, type SearchResponse } from "./types";
import { HOME, LIST_FOR, localMatches, PLACES, START_TILES, type Row } from "./places";

/* -------------------------------------------------------------------------- */
/* What the sheet offers before anything is typed                              */
/* -------------------------------------------------------------------------- */

interface Section {
  key: string;
  label: string;
  rows: Row[];
  /** "See all 'marquez' in Repairs": the full list with the same search. */
  more?: { label: string; href: string };
  /** Start tiles are drawn as picture boxes, not rows. */
  tiles?: boolean;
}

/** What the sheet last heard back, tagged with the words it answers. */
interface Answer {
  query: string;
  groups: SearchGroup[];
  failed: boolean;
}

interface Selection {
  rows: Row[];
  index: number;
}

const NO_GROUPS: SearchGroup[] = [];
const NO_SELECTION: Selection = { rows: [], index: 0 };
const SearchIcon = ICONS.search;
const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;
const RECENT_KEY = "rf_search_recent";
const RECENT_MAX = 5;

function itemRow(item: SearchItem): Row {
  return {
    id: `${item.type}-${item.id}`,
    title: item.title,
    subtitle: item.subtitle,
    badge: item.badge,
    price: item.price,
    href: item.href,
    picture: item.picture,
    initials: item.initials,
    icon: item.type === "invoice" ? ICONS.invoice : item.type === "estimate" ? ICONS.estimate : undefined,
  };
}

function readRecent(): Row[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((row): row is Row => typeof row?.href === "string" && row.href.startsWith("/") && typeof row?.title === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function rememberRecent(row: Row) {
  try {
    const next = [
      { id: `recent-${row.href}`, title: row.title, subtitle: row.subtitle, href: row.href, picture: row.picture, initials: row.initials },
      ...readRecent().filter((entry) => entry.href !== row.href),
    ].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not remembered on this device; search still works.
  }
}

/* -------------------------------------------------------------------------- */
/* The sheet                                                                   */
/* -------------------------------------------------------------------------- */

export function CommandPalette({
  open,
  onOpenChange,
  showMoney = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False for technicians: no invoice or estimate shortcuts. */
  showMoney?: boolean;
}) {
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  // The answer is tagged with the words it answers, so "loading" and "failed"
  // are read off it and a keystroke needs no state reset.
  const [answer, setAnswer] = React.useState<Answer | null>(null);
  const [selection, setSelection] = React.useState<Selection>(NO_SELECTION);
  const [recent, setRecent] = React.useState<Row[]>([]);

  const listRef = React.useRef<HTMLDivElement>(null);

  const q = query.trim();
  const searchable = open && q.length >= MIN_QUERY;
  const answered = answer !== null && answer.query === q ? answer : null;
  const loading = searchable && answered === null;
  const failed = searchable && answered !== null && answered.failed;
  // The previous words' rows stay on screen while the next ones load, so the
  // list never blinks empty between keystrokes.
  const groups = searchable && answer !== null && !answer.failed ? answer.groups : NO_GROUPS;

  // Every way out (Close, Esc, Ctrl-K again, picking a row) comes through here.
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setAnswer(null);
        setSelection(NO_SELECTION);
      } else {
        setRecent(readRecent());
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  // Ctrl-K / Cmd-K from anywhere in the app.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setOpen(!open);
    }
    // Any screen can open the sheet (a not-found page's "Search the shop").
    const onOpenRequest = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_SEARCH, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_SEARCH, onOpenRequest);
    };
  }, [open, setOpen]);

  // Opened by the Search button (not through setOpen): read the recent list then.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a browser-only list when the sheet opens
    if (open) setRecent(readRecent());
  }, [open]);

  // Debounced fetch.
  React.useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/app-search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : Promise.reject(res.status)))
        .then((data) => {
          if (!cancelled) setAnswer({ query: q, groups: data.groups, failed: false });
        })
        .catch(() => {
          if (!cancelled) setAnswer({ query: q, groups: [], failed: true });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, searchable]);

  const sections = React.useMemo<Section[]>(() => {
    if (q.length === 0) {
      const out: Section[] = [{ key: "start", label: "Start", rows: START_TILES, tiles: true }];
      if (recent.length > 0) out.push({ key: "recent", label: "Opened lately", rows: recent });
      return out;
    }
    const out: Section[] = [];
    const { exact, groups: arranged } = arrangeResults(groups);
    if (exact.length > 0) out.push({ key: "exact", label: "Top match", rows: exact.map(itemRow) });
    for (const group of arranged) {
      const list = LIST_FOR[group.type];
      out.push({
        key: group.type,
        label: TYPE_LABEL[group.type] ?? group.label,
        rows: group.items.map(itemRow),
        more: list ? { label: `See all in ${TYPE_LABEL[group.type]}`, href: `${list}?q=${encodeURIComponent(q)}` } : undefined,
      });
    }
    const local = localMatches(q, showMoney);
    if (local.starts.length > 0) out.push({ key: "start", label: "Start", rows: local.starts });
    if (local.places.length > 0) out.push({ key: "places", label: "Go to", rows: local.places });
    return out;
  }, [q, groups, recent, showMoney]);

  /** Flat, in render order: what the arrow keys walk. */
  const rows = React.useMemo(() => sections.flatMap((section) => section.rows), [sections]);
  const active = selection.rows === rows ? selection.index : -1;
  const select = (index: number) => setSelection({ rows, index });

  React.useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = React.useCallback(
    (row: Row | { href: string }) => {
      if ("title" in row && q.length > 0 && !row.id.startsWith("go-") && !row.id.startsWith("start-")) rememberRecent(row);
      setOpen(false);
      router.push(row.href);
    },
    [setOpen, router, q],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      select((active + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      select(active <= 0 ? rows.length - 1 : active - 1);
    } else if (event.key === "Enter") {
      // Enter with nothing picked opens the first answer: what was typed is what was meant.
      const row = rows[active >= 0 ? active : 0];
      if (row && (active >= 0 || q.length >= MIN_QUERY)) {
        event.preventDefault();
        go(row);
      }
    }
  }

  let cursor = -1; // running index across sections, matching `rows`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className={cn(
            // A full-screen sheet on a phone; a tall panel from the top of a tablet,
            // so the on-screen keyboard leaves the answers visible.
            "rf-search-sheet fixed inset-0 z-50 flex flex-col bg-background outline-none",
            "sm:inset-auto sm:left-1/2 sm:top-[3dvh] sm:max-h-[min(90dvh,860px)] sm:w-[94vw] sm:max-w-3xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-xl",
            "rf-overlay",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Search the shop</DialogPrimitive.Title>

          {/* ---------------------------------------------------- the field */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:rounded-t-2xl sm:px-4 sm:pt-3">
            <label className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border-strong bg-background px-4 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              {loading ? (
                <Loader2 aria-hidden className="size-6 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <SearchIcon aria-hidden className="size-6 shrink-0 text-muted-foreground" />
              )}
              <input
                {...SEARCH_INPUT_PROPS}
                // The person opened Search to type, so the keyboard is wanted here.
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, phone or repair #"
                aria-label="Search the shop: name, phone or number"
                role="combobox"
                aria-expanded
                aria-controls="rf-command-list"
                aria-activedescendant={active >= 0 && rows[active] ? `rf-cmd-${active}` : undefined}
                className="h-12 min-w-0 flex-1 bg-transparent text-[18px] text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear what you typed"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden className="size-5" />
                </button>
              ) : null}
            </label>
            {/* Scanning a serial, a shelf label or a printed work order opens that record. */}
            <ScanButton
              variant="outline"
              size="icon"
              className="size-14 rounded-xl"
              label="Scan a barcode"
              title="Scan to open a record"
              description="A serial, a shelf label, or a printed work order."
              onScan={async (hit) => {
                const result = await resolveScanAction(hit.value);
                if (result.kind === "none") {
                  setQuery(result.value);
                  return `No exact match — searching for ${result.value}`;
                }
                go({ href: result.href });
                return openedLabel(result);
              }}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-14 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-5" />
              <span className="hidden min-[400px]:inline">Close</span>
              <span className="sr-only min-[400px]:hidden">Close search</span>
            </button>
          </div>

          {/* -------------------------------------------------- the answers */}
          <div
            id="rf-command-list"
            ref={listRef}
            role="listbox"
            aria-label="Search results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-4"
          >
            {q.length > 0 && rows.length === 0 ? (
              <NothingFound query={q} loading={loading} failed={failed} />
            ) : (
              sections.map((section) => (
                <section key={section.key} aria-label={section.label} className="mb-4 last:mb-0">
                  <h3 className="px-1 pb-2 text-[14px] font-semibold text-muted-foreground">{section.label}</h3>
                  <div className={section.tiles ? "grid grid-cols-2 gap-2.5 sm:grid-cols-4" : "flex flex-col gap-2"}>
                    {section.rows.map((row) => {
                      cursor += 1;
                      const index = cursor;
                      const props = {
                        id: `rf-cmd-${index}`,
                        "data-index": index,
                        role: "option" as const,
                        "aria-selected": index === active,
                        onMouseMove: () => {
                          if (index !== active) select(index);
                        },
                        onClick: () => go(row),
                      };
                      return section.tiles ? (
                        <StartTile key={row.id} {...props} row={row} active={index === active} />
                      ) : (
                        <ResultRow key={row.id} {...props} row={row} active={index === active} />
                      );
                    })}
                  </div>
                  {section.more ? (
                    <button
                      type="button"
                      onClick={() => go({ href: section.more!.href })}
                      className="mt-1.5 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {section.more.label}
                      <ArrowRight aria-hidden className="size-4" />
                    </button>
                  ) : null}
                </section>
              ))
            )}
            {q.length === 0 ? <Places showMoney={showMoney} onGo={(href) => go({ href })} /> : null}
          </div>

          {/* Keyboard hints only where there is a keyboard and a mouse. */}
          <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-border px-4 text-[12.5px] text-muted-foreground pointer-fine:flex">
            <span>↑ ↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
            <span className="ml-auto">Try #1012, INV-1012 or a phone number</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

type OptionProps = {
  id: string;
  "data-index": number;
  role: "option";
  "aria-selected": boolean;
  onMouseMove: () => void;
  onClick: () => void;
};

/** A start box: a picture you recognise and a plain name, like the Home tiles. */
function StartTile({ row, active, ...props }: OptionProps & { row: Row; active: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "group flex min-h-36 flex-col overflow-hidden rounded-2xl border bg-surface text-left transition-[border-color,transform] duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-ring" : "border-border hover:border-ring",
      )}
    >
      <span className="relative block aspect-[16/10] w-full bg-white">
        {row.picture ? <Image src={row.picture} alt="" fill sizes="(max-width: 640px) 45vw, 180px" className="object-contain p-2" /> : null}
        {row.add ? (
          <span className="absolute bottom-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
            <Plus aria-hidden className="size-4" />
          </span>
        ) : null}
      </span>
      <span className="flex flex-col px-3 pb-3 pt-2">
        <span className="text-[16px] font-semibold leading-tight text-foreground">{row.title}</span>
        {row.subtitle ? <span className="text-[13px] leading-snug text-muted-foreground">{row.subtitle}</span> : null}
      </span>
    </button>
  );
}

/** One answer: a picture (a device, a product, initials for a person), a title, one line, and its status. */
function ResultRow({ row, active, ...props }: OptionProps & { row: Row; active: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-2xl border bg-surface p-2.5 pr-3 text-left transition-colors sm:gap-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-ring bg-surface-hover" : "border-border hover:border-ring",
      )}
    >
      <ResultPicture row={row} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[17px] font-semibold leading-tight text-foreground">{row.title}</span>
        {row.subtitle ? <span className="truncate text-[14px] leading-snug text-muted-foreground">{row.subtitle}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {row.price ? <span className="text-[16px] font-semibold tabular-nums text-foreground">{row.price}</span> : null}
        {row.badge ? <StatusPill size="sm" dot={false} tone="neutral" label={row.badge} /> : null}
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ResultPicture({ row }: { row: Row }) {
  const box = "relative flex size-14 shrink-0 items-center justify-center overflow-hidden";
  if (row.initials) {
    return (
      <span aria-hidden className={cn(box, "rounded-full bg-accent-soft text-[18px] font-semibold text-foreground")}>
        {row.initials}
      </span>
    );
  }
  if (row.picture?.startsWith("/files/")) {
    // A shop's own photo needs the signed-in session, so it cannot use the image optimiser.
    // eslint-disable-next-line @next/next/no-img-element
    return <span className={cn(box, "rounded-xl bg-white")}><img src={row.picture} alt="" loading="lazy" className="size-full object-cover" /></span>;
  }
  if (row.picture) {
    return (
      <span className={cn(box, "rounded-xl bg-white")}>
        <Image src={row.picture} alt="" fill sizes="56px" className="object-contain p-1.5" />
      </span>
    );
  }
  const Icon = row.icon ?? ICONS.search;
  return (
    <span aria-hidden className={cn(box, "rounded-xl bg-surface-hover text-foreground")}>
      <Icon className="size-6" strokeWidth={1.75} />
    </span>
  );
}

/** Every other place in the app, as big plain-word buttons. */
function Places({ showMoney, onGo }: { showMoney: boolean; onGo: (href: string) => void }) {
  return (
    <section aria-label="Go to" className="mt-4">
      <h3 className="px-1 pb-2 text-[14px] font-semibold text-muted-foreground">Go to</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PLACES.filter((place) => (showMoney || !place.money) && !place.id.startsWith("go-new") && place.id !== "go-home").map((place) => {
          const Icon = place.icon ?? ICONS.search;
          return (
            <button
              key={place.id}
              type="button"
              onClick={() => onGo(place.href)}
              className="flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 text-left text-[15px] font-semibold text-foreground transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <span className="truncate">{place.title}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** "Opening iPhone 14 Case" — what the scanner shows before it steps aside. */
function openedLabel(result: Exclude<ScanResult, { kind: "none" }>): string {
  if (result.kind === "product") return `Opening ${result.product.name}`;
  if (result.kind === "serial") return `Opening ${result.serial.productName} · ${result.serial.serial}`;
  return `Opening ${result.label}`;
}

function NothingFound({ query, loading, failed }: { query: string; loading: boolean; failed: boolean }) {
  const title = failed
    ? "Search isn't working right now"
    : loading
      ? "Looking…"
      : query.length < MIN_QUERY
        ? "Keep typing…"
        : `Nothing called “${query}”`;
  const hint = failed
    ? "Check the connection and try again in a moment."
    : loading || query.length < MIN_QUERY
      ? null
      : "Try a last name, the last 4 digits of a phone, or a number like #1012.";
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="relative size-24 overflow-hidden rounded-2xl bg-white">
        <Image src={`${HOME}/customers-cards.webp`} alt="" fill sizes="96px" className="object-contain p-2" />
      </span>
      <p className="text-[18px] font-semibold text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-[15px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
