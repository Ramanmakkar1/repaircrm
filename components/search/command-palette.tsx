"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowRight,
  Boxes,
  CornerDownLeft,
  CreditCard,
  FileText,
  Hash,
  Loader2,
  Receipt,
  Search,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { ScanButton } from "@/components/scan/scan-button";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { resolveScanAction } from "@/app/(app)/scan/actions";
import type { ScanResult } from "@/lib/scan/types";
import type { SearchGroup, SearchResponse, SearchType } from "./types";

/* -------------------------------------------------------------------------- */
/* Static rows                                                                 */
/* -------------------------------------------------------------------------- */

interface Row {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
  href: string;
  icon: LucideIcon;
}

interface Section {
  key: string;
  label: string;
  rows: Row[];
}

/**
 * The four things a front-counter user starts most often, plus POS. These sit
 * at the very top whenever the box is empty, so ⌘K doubles as the app's "start
 * something" menu and not only as a finder.
 */
const QUICK_ACTIONS: Row[] = [
  { id: "qa-ticket", title: "New ticket", subtitle: "Check a device in", href: "/tickets/new", icon: Wrench },
  { id: "qa-customer", title: "New customer", subtitle: "Add someone to the book", href: "/customers/new", icon: UserPlus },
  { id: "qa-invoice", title: "New invoice", subtitle: "Bill for work done", href: "/invoices/new", icon: Receipt },
  { id: "qa-estimate", title: "New estimate", subtitle: "Quote a job first", href: "/estimates/new", icon: FileText },
  { id: "qa-pos", title: "Take payment", subtitle: "Open the register", href: "/pos", icon: CreditCard },
];

const NAV_ROWS: Row[] = NAV_ITEMS.map((item) => ({
  id: `nav-${item.href}`,
  title: item.label,
  href: item.href,
  icon: item.icon,
}));

const TYPE_ICON: Record<SearchType, LucideIcon> = {
  customer: Users,
  ticket: Wrench,
  invoice: Receipt,
  estimate: FileText,
  product: Boxes,
  serial: Hash,
  lead: UserPlus,
};

const DEBOUNCE_MS = 200;
const MIN_QUERY = 2;

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [groups, setGroups] = React.useState<SearchGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [entered, setEntered] = React.useState(false);

  const listRef = React.useRef<HTMLDivElement>(null);

  // ---- ⌘K / Ctrl+K, from anywhere in the app -------------------------------
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // ---- reset on close, animate in on open ----------------------------------
  React.useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(frame);
    }
    setEntered(false);
    setQuery("");
    setGroups([]);
    setLoading(false);
    setFailed(false);
    setActive(0);
  }, [open]);

  // ---- debounced fetch -----------------------------------------------------
  React.useEffect(() => {
    const q = query.trim();
    if (!open || q.length < MIN_QUERY) {
      setGroups([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      fetch(`/api/app-search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((res) =>
          res.ok ? (res.json() as Promise<SearchResponse>) : Promise.reject(res.status),
        )
        .then((data) => {
          if (cancelled) return;
          setGroups(data.groups);
          setFailed(false);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setGroups([]);
          setFailed(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  // ---- what the list shows -------------------------------------------------
  const q = query.trim();
  const lower = q.toLowerCase();

  const sections = React.useMemo<Section[]>(() => {
    const out: Section[] = [];

    if (q.length === 0) {
      out.push({ key: "actions", label: "Quick actions", rows: QUICK_ACTIONS });
      out.push({ key: "nav", label: "Go to", rows: NAV_ROWS });
      return out;
    }

    // Local matches answer the first keystroke instantly, before the network
    // has anything to say — "inv" already offers Invoices and New invoice.
    const actions = QUICK_ACTIONS.filter((row) =>
      row.title.toLowerCase().includes(lower),
    );
    const nav = NAV_ROWS.filter((row) => row.title.toLowerCase().includes(lower));

    if (actions.length > 0) out.push({ key: "actions", label: "Actions", rows: actions });
    if (nav.length > 0) out.push({ key: "nav", label: "Go to", rows: nav });

    for (const group of groups) {
      out.push({
        key: group.type,
        label: group.label,
        rows: group.items.map((item) => ({
          id: `${item.type}-${item.id}`,
          title: item.title,
          subtitle: item.subtitle,
          badge: item.badge,
          href: item.href,
          icon: TYPE_ICON[item.type],
        })),
      });
    }

    return out;
  }, [q, lower, groups]);

  /** Flat, in render order — this is what the arrow keys walk. */
  const rows = React.useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );

  React.useEffect(() => {
    setActive(0);
  }, [q, groups]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (rows.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(rows.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) go(row.href);
    }
  }

  let cursor = -1; // running index across sections, so it matches `rows`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className={cn(
            // full-screen sheet on a phone, floating panel from sm up
            "fixed inset-0 z-50 flex flex-col bg-surface outline-none",
            "sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:h-auto sm:max-h-[70vh] sm:w-[92vw] sm:max-w-xl sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-border sm:shadow-xl",
            "transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
            entered ? "scale-100 opacity-100" : "scale-[0.99] opacity-0",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Search the shop
          </DialogPrimitive.Title>

          {/* ------------------------------------------------------- input */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
            {loading ? (
              <Loader2 className="size-[18px] shrink-0 animate-spin text-accent" />
            ) : (
              <Search className="size-[18px] shrink-0 text-faint-foreground" />
            )}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // Kept short enough to survive a 390px phone without clipping —
              // the full list of what's searched lives in the empty state.
              placeholder="Search customers, tickets, invoices…"
              aria-label="Search the shop"
              role="combobox"
              aria-expanded
              aria-controls="rf-command-list"
              aria-activedescendant={rows[active] ? `rf-cmd-${active}` : undefined}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-faint-foreground outline-none"
            />
            {/* Scanning anything the shop has printed or stocked — a serial on
                a handset, a shelf label, the work order stapled to a device —
                opens that record directly. A code with no exact match falls
                into the box as a search, which is what ⌘K is for anyway. */}
            <ScanButton
              variant="ghost"
              size="icon"
              className="size-9"
              label="Scan a barcode"
              title="Scan to open a record"
              description="A serial, a shelf label, or a printed work order."
              onScan={async (hit) => {
                const result = await resolveScanAction(hit.value);
                if (result.kind === "none") {
                  setQuery(result.value);
                  return `No exact match — searching for ${result.value}`;
                }
                go(result.href);
                return openedLabel(result);
              }}
            />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-semibold text-faint-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              Esc
            </button>
          </div>

          {/* ------------------------------------------------------ results */}
          <div
            id="rf-command-list"
            ref={listRef}
            role="listbox"
            aria-label="Search results"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-none"
          >
            {rows.length === 0 ? (
              <EmptyState query={q} loading={loading} failed={failed} />
            ) : (
              sections.map((section) => (
                <div key={section.key} className="mb-1 last:mb-0">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint-foreground">
                    {section.label}
                  </p>
                  {section.rows.map((row) => {
                    cursor += 1;
                    const index = cursor;
                    const isActive = index === active;
                    const Icon = row.icon;
                    return (
                      <button
                        key={row.id}
                        id={`rf-cmd-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={isActive}
                        type="button"
                        onMouseMove={() => setActive(index)}
                        onClick={() => go(row.href)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                          isActive ? "bg-accent-soft" : "hover:bg-surface-hover",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-[18px] shrink-0",
                            isActive ? "text-accent" : "text-faint-foreground",
                          )}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              "truncate text-[14.5px] font-semibold",
                              isActive
                                ? "text-accent-soft-foreground"
                                : "text-foreground",
                            )}
                          >
                            {row.title}
                          </span>
                          {row.subtitle ? (
                            <span className="truncate text-[12.5px] text-muted-foreground">
                              {row.subtitle}
                            </span>
                          ) : null}
                        </span>
                        {row.badge ? (
                          <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
                            {row.badge}
                          </span>
                        ) : null}
                        {isActive ? (
                          <ArrowRight className="size-4 shrink-0 text-accent" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* ------------------------------------------------------- footer */}
          <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border px-4 text-[11.5px] text-faint-foreground">
            <Hint keys={["↑", "↓"]}>Navigate</Hint>
            <Hint icon={CornerDownLeft}>Open</Hint>
            <Hint keys={["Esc"]}>Close</Hint>
            <span className="ml-auto hidden font-medium sm:inline">
              Tip: type a ticket or invoice number
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

/** "Opening iPhone 14 Case" — what the scanner shows before it steps aside. */
function openedLabel(result: Exclude<ScanResult, { kind: "none" }>): string {
  if (result.kind === "product") return `Opening ${result.product.name}`;
  if (result.kind === "serial") {
    return `Opening ${result.serial.productName} · ${result.serial.serial}`;
  }
  return `Opening ${result.label}`;
}

function EmptyState({
  query,
  loading,
  failed,
}: {
  query: string;
  loading: boolean;
  failed: boolean;
}) {
  const message = failed
    ? "Search is unavailable right now. Try again in a moment."
    : loading
      ? "Searching…"
      : query.length < MIN_QUERY
        ? "Keep typing…"
        : "No matches — try a ticket number or a customer name.";

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <Search className="size-6 text-faint-foreground" />
      <p className="text-[14px] font-medium text-muted-foreground">{message}</p>
      {!loading && !failed && query.length >= MIN_QUERY ? (
        <p className="text-[12.5px] text-faint-foreground">
          Customers, tickets, invoices, estimates, parts and leads are all searched.
        </p>
      ) : null}
    </div>
  );
}

function Hint({
  keys,
  icon: Icon,
  children,
}: {
  keys?: string[];
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {Icon ? (
        <kbd className="flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-border bg-surface-hover px-1 font-sans">
          <Icon className="size-3" />
        </kbd>
      ) : (
        keys?.map((key) => (
          <kbd
            key={key}
            className="flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-border bg-surface-hover px-1 font-sans text-[10.5px] font-semibold"
          >
            {key}
          </kbd>
        ))
      )}
      <span className="font-medium">{children}</span>
    </span>
  );
}
