"use client";

import * as React from "react";

import { StatusBadge } from "@/components/ui/badge";
import { StatusProgress } from "./status-progress";

/**
 * The ticket's status, shown in three places and changed from two.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * A status move is the most-repeated write on the workroom screen, and until
 * now it was also the slowest-LOOKING one: the composer posts, the server
 * writes, `revalidatePath` rebuilds the page, and only then do the header
 * badge and the pipeline tracker catch up. The operator gets a second of a
 * screen that still says "In Progress" after they have already told it the job
 * is ready — so they wait, or worse, they press it again.
 *
 * The badge and the tracker are rendered by the page (a Server Component); the
 * controls that move the status are two separate client islands somewhere else
 * in the tree. Nothing but a context can carry a guess from one to the other.
 *
 * ---------------------------------------------------------------------------
 * HOW IT RECONCILES
 * ---------------------------------------------------------------------------
 * `useOptimistic`, scoped to the transition that does the write. React drops
 * the guess exactly when the transition settles — which, because the server
 * action calls `revalidatePath`, is when the real status has already arrived
 * in `status`. Success and failure both land correctly: a refused write simply
 * never changes `status`, the transition ends, and the guess evaporates back
 * to the truth on screen.
 *
 * The alternative — mirroring `status` into `useState` and re-syncing it from
 * an effect — is both a frame late and the exact thing React 19's
 * `set-state-in-effect` rule exists to stop.
 */

type TicketStatusValue = {
  /** The status to PAINT: the guess while a move is in flight, else the truth. */
  status: string;
  /**
   * Call inside a transition or an action, immediately before awaiting the
   * write. Outside a scope it is a no-op, so a control can be used on a page
   * that has no tracker to move.
   */
  setOptimisticStatus: (next: string) => void;
};

const TicketStatusContext = React.createContext<TicketStatusValue | null>(null);

/**
 * Wraps the whole ticket page. `status` is the server's truth; everything
 * inside reads the guess when there is one.
 */
export function TicketStatusScope({
  status,
  children,
}: {
  status: string;
  children: React.ReactNode;
}) {
  const [optimistic, setOptimistic] = React.useOptimistic(status);

  const value = React.useMemo<TicketStatusValue>(
    () => ({ status: optimistic, setOptimisticStatus: setOptimistic }),
    [optimistic, setOptimistic],
  );

  return (
    <TicketStatusContext.Provider value={value}>
      {children}
    </TicketStatusContext.Provider>
  );
}

/**
 * The status to display. `fallback` is the server-rendered value, used as-is
 * when this component is not inside a scope — the portal's read-only ticket
 * page renders the same tracker with nothing to move it.
 */
export function useTicketStatus(fallback: string): string {
  return React.useContext(TicketStatusContext)?.status ?? fallback;
}

/** The setter, or a no-op outside a scope. See `setOptimisticStatus` above. */
export function useSetOptimisticStatus(): (next: string) => void {
  const context = React.useContext(TicketStatusContext);
  return context?.setOptimisticStatus ?? noop;
}

function noop(): void {}

// ---------------------------------------------------------------------------
// The two readers
// ---------------------------------------------------------------------------

/*
 * Thin client wrappers rather than context reads inside `StatusBadge` and
 * `StatusProgress` themselves: both are shared primitives used on screens with
 * no scope at all (the tickets table, the customer hub, the customer portal),
 * and a shared component that quietly prefers a context over its own prop is a
 * component you can no longer reason about from its call site.
 */

export function LiveStatusBadge({ status }: { status: string }) {
  const live = useTicketStatus(status);
  return <StatusBadge status={live} />;
}

export function LiveStatusProgress({
  statuses,
  current,
}: {
  statuses: string[];
  current: string;
}) {
  const live = useTicketStatus(current);
  return <StatusProgress statuses={statuses} current={live} />;
}
