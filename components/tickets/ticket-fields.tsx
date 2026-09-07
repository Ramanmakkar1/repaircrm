"use client";

import * as React from "react";
import { format } from "date-fns";

import { setTicketFieldAction } from "@/app/(app)/tickets/field-actions";
import { PriorityBadge } from "@/components/tickets/priority-badge";
import {
  PRIORITIES,
  PRIORITY_META,
  parseDateInput,
} from "@/components/tickets/ticket-meta";
import { cn } from "@/components/ui/cn";
import { InlineEdit } from "@/components/ui/inline-edit";
import { DUE_TONE_CLASS, dueChip } from "@/lib/sla";

/**
 * The four ticket facts a header cell may change in place: due date, assignee,
 * priority, problem type. Status keeps its own control (the update composer,
 * which pairs a status change with the note that explains it) and is not here.
 *
 * These are thin: `InlineEdit` owns the interaction and `setTicketFieldAction`
 * owns the rules. What lives here is the bit neither can hold — the READ
 * rendering. `InlineEdit.format` is a function, and a function cannot cross
 * from a Server Component into a client one, so the knowledge that a priority
 * reads as a `PriorityBadge` and an overdue date reads as a red chip has to sit
 * on this side of the boundary.
 */

type Option = { value: string; label: string };

/**
 * The refusal round-trip.
 *
 * The action returns its message instead of throwing it, because React strips
 * a thrown error's message to a digest when it crosses a Server Action
 * boundary in production — the operator would get "An error occurred in the
 * Server Components render" where they needed "That person is not on this
 * shop's team". Rethrowing it here is what `InlineEdit` catches: it rolls the
 * optimistic value back and prints the message under the field.
 */
async function save(
  ticketId: string,
  field: "dueDate" | "assignedToId" | "priority" | "problemType",
  next: string,
): Promise<void> {
  const result = await setTicketFieldAction(ticketId, field, next);
  if (result.error) throw new Error(result.error);
}


// ---------------------------------------------------------------------------

export function TicketDueDate({
  ticketId,
  value,
  resolved,
  nowMs,
}: {
  ticketId: string;
  /** yyyy-mm-dd, or "" when the ticket has no promised date. */
  value: string;
  /** A finished job gets no chip — see `dueChip`. */
  resolved: boolean;
  /**
   * The page's single request-time clock. Passed in rather than read here so
   * the server render and the hydration agree on "overdue"; a `Date.now()` in
   * this component would disagree with the one the page already used and
   * produce a mismatch on every ticket.
   */
  nowMs: number;
}) {
  return (
    <InlineEdit
      label="Due date"
      type="date"
      value={value}
      onSave={(next) => save(ticketId, "dueDate", next)}
      format={(raw) => {
        const due = parseDateInput(raw);
        if (!due) return raw;

        const chip = dueChip(due, resolved, nowMs);
        // Same chip, same words as the tickets table — a due date must not
        // read one way in the list and another way here.
        return chip && chip.tone !== "later" ? (
          <span
            className={cn(
              "inline-block rounded-sm px-1.5 py-0.5 text-[12.5px] leading-none",
              DUE_TONE_CLASS[chip.tone],
            )}
          >
            {chip.label}
          </span>
        ) : (
          format(due, "MMM d, yyyy")
        );
      }}
    />
  );
}

export function TicketAssignee({
  ticketId,
  value,
  currentLabel,
  techs,
}: {
  ticketId: string;
  /** A User id, or "" for unassigned. */
  value: string;
  /** The current assignee's name, which may not be in `techs` — see below. */
  currentLabel: string | null;
  /** Active staff, in the order the shop lists them. */
  techs: Option[];
}) {
  const options = React.useMemo(() => {
    const list: Option[] = [{ value: "", label: "Unassigned" }, ...techs];
    // A ticket can be assigned to somebody since deactivated. They are not in
    // the pick list, and a <select> whose value matches no option shows the
    // FIRST one — so the field would quietly claim the job was unassigned.
    // Carrying the current holder as an option keeps the read state honest;
    // picking anyone else still moves it off them for good.
    if (value && !list.some((option) => option.value === value)) {
      list.push({ value, label: currentLabel ?? "Current assignee" });
    }
    return list;
  }, [techs, value, currentLabel]);

  return (
    <InlineEdit
      label="Assigned technician"
      type="select"
      value={value}
      placeholder="Unassigned"
      options={options}
      onSave={(next) => save(ticketId, "assignedToId", next)}
      format={(raw) =>
        options.find((option) => option.value === raw)?.label ?? raw
      }
    />
  );
}

export function TicketPriority({
  ticketId,
  value,
}: {
  ticketId: string;
  value: string;
}) {
  return (
    <InlineEdit
      label="Priority"
      type="select"
      value={value}
      options={PRIORITIES.map((priority) => ({
        value: priority,
        label: PRIORITY_META[priority].label,
      }))}
      // Reads as exactly the chip that was there before it became editable —
      // it sits beside the status pill and has to stay the same shape of thing.
      format={(raw) => <PriorityBadge priority={raw} />}
      onSave={(next) => save(ticketId, "priority", next)}
    />
  );
}

export function TicketProblemType({
  ticketId,
  value,
  problemTypes,
}: {
  ticketId: string;
  value: string;
  /** This shop's configured list, from `Shop.settings.problemTypes`. */
  problemTypes: string[];
}) {
  const options = React.useMemo(() => {
    const list = problemTypes.map((type) => ({ value: type, label: type }));
    // A shop can edit its list after a ticket was raised. Same reasoning as
    // the assignee: show what the ticket actually says, even when the shop no
    // longer offers it.
    if (value && !list.some((option) => option.value === value)) {
      list.unshift({ value, label: value });
    }
    return list;
  }, [problemTypes, value]);

  return (
    <InlineEdit
      label="Problem type"
      type="select"
      value={value}
      options={options}
      onSave={(next) => save(ticketId, "problemType", next)}
    />
  );
}
