"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { attentionTotal, type AttentionItem } from "@/components/counter/attention";

/**
 * Keeps the "Needs you" counts fresh for the bell and the phone tab bar while
 * the person works anywhere in the app: on arrival, after each screen change
 * (at most every 15 seconds), every minute while the tab is visible, and when
 * the tab comes back to the front.
 *
 * The layout does not render these on the server on purpose: a layout is not
 * re-rendered between screens, so a server count would go stale on the very
 * next tap. One small GET keeps every page's first byte as fast as before.
 */

export type AttentionState = {
  items: AttentionItem[];
  total: number;
  /** False until the first answer arrives: no badge flashes "0" first. */
  loaded: boolean;
  refresh: () => void;
};

const AttentionContext = React.createContext<AttentionState | null>(null);

/** Null outside the shell (a test rendering one component on its own): callers show no badge. */
export function useAttention(): AttentionState | null {
  return React.useContext(AttentionContext);
}

const POLL_MS = 60_000;
const MIN_GAP_MS = 15_000;

export function AttentionProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [items, setItems] = React.useState<AttentionItem[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const last = React.useRef(0);
  const inFlight = React.useRef<AbortController | null>(null);

  const load = React.useCallback((force: boolean) => {
    const now = Date.now();
    if (!force && now - last.current < MIN_GAP_MS) return;
    last.current = now;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    fetch("/api/app-search/attention", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ items: AttentionItem[] }>) : Promise.reject(res.status)))
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setLoaded(true);
      })
      // Offline or signed out: keep the last numbers rather than flashing zero.
      .catch(() => undefined);
  }, []);

  // On arrival and after every screen change.
  React.useEffect(() => {
    load(false);
  }, [path, load]);

  // Every minute while visible, and at once when the tab comes back.
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      inFlight.current?.abort();
    };
  }, [load]);

  const refresh = React.useCallback(() => load(true), [load]);
  const value = React.useMemo<AttentionState>(
    () => ({ items, total: attentionTotal(items), loaded, refresh }),
    [items, loaded, refresh],
  );

  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}
