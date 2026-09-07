"use client";

import * as React from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "./cn";

/**
 * A field you change where it sits.
 *
 * ---------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------
 * Changing a ticket's due date currently costs: click Edit, wait for a form
 * page, find the field among fifteen others, change it, submit, wait, land
 * back on the record. Six interactions and two navigations to move a date by a
 * day — and the Edit page is a wholesale rewrite of the record, so two people
 * editing different fields at the same time overwrite each other.
 *
 * Inline edit is one interaction on one field, and it writes only that field,
 * which makes the concurrent case correct rather than merely faster.
 *
 * ---------------------------------------------------------------------------
 * BEHAVIOUR
 * ---------------------------------------------------------------------------
 * Reading is the default state — a quiet value with a pencil that appears on
 * hover, so a page of these does not read as a form. Enter commits, Escape
 * cancels and restores, blur commits (people click away expecting a save; a
 * silent discard there is the single most annoying thing a field like this can
 * do). The value updates optimistically and rolls back if the server refuses.
 *
 * Not for money. Amounts belong to documents that recalculate totals, snapshot
 * tax and get sent to customers — those go through their proper forms and
 * their proper server actions, where the whole document is validated at once.
 */
export function InlineEdit({
  value,
  onSave,
  type = "text",
  options,
  label,
  placeholder = "—",
  format,
  className,
  disabled = false,
}: {
  /** Current value. For `date`, a yyyy-mm-dd string. */
  value: string;
  /** Persist it. Throw (or reject) to refuse — the field rolls back and says why. */
  onSave: (next: string) => Promise<void>;
  type?: "text" | "date" | "select";
  /** Required for `type="select"`. */
  options?: { value: string; label: string }[];
  /** What this field is, for screen readers and the error toast. */
  label: string;
  /** Shown when the value is empty. */
  placeholder?: string;
  /** Render the read state — dates as "Sep 4, 2026" rather than "2026-09-04". */
  format?: (value: string) => React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, startSaving] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement | HTMLSelectElement>(null);

  /*
   * `useOptimistic`, not a piece of state we reset in an effect.
   *
   * The optimistic value has to disappear the moment the real one catches up —
   * whether that is our own save revalidating, or somebody else's edit
   * arriving. React ties that to the transition for us: the guess lives
   * exactly as long as the pending transition and is dropped when it settles,
   * success or failure. Doing it by hand means a `setState` inside an effect
   * keyed on `value`, which is both a frame late and the thing React 19's
   * `set-state-in-effect` rule exists to stop.
   */
  const [shown, showOptimistically] = React.useOptimistic(value);

  function open() {
    if (disabled) return;
    setDraft(shown);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === shown) return;

    startSaving(async () => {
      // Inside the transition: that is what scopes the optimistic value to it.
      showOptimistically(next);
      try {
        await onSave(next);
      } catch (caught) {
        // The guess falls away with the transition; all that is left to do is
        // say why, in place — a toast for a field the operator is still
        // looking at is a longer trip than the message they need.
        setError(
          caught instanceof Error && caught.message
            ? caught.message
            : `Could not save ${label.toLowerCase()}.`,
        );
      }
    });
  }

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <span
        data-inline-edit=""
        className={cn("inline-flex items-center gap-1", className)}
      >
        {type === "select" ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancel();
              if (event.key === "Enter") commit();
            }}
            aria-label={label}
            className="h-7 rounded-md border border-accent bg-surface px-1.5 text-[13.5px] text-foreground outline-none ring-[3px] ring-ring/20"
          >
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancel();
              if (event.key === "Enter") commit();
            }}
            aria-label={label}
            className="h-7 w-full min-w-0 rounded-md border border-accent bg-surface px-1.5 text-[13.5px] text-foreground outline-none ring-[3px] ring-ring/20"
          />
        )}
        {/* Mouse users get the two buttons; keyboard users already have Enter
            and Escape and never need to reach them. `onMouseDown` beats the
            input's own blur, which would otherwise commit before the click. */}
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            commit();
          }}
          aria-label={`Save ${label.toLowerCase()}`}
          className="rounded-sm p-0.5 text-muted-foreground hover:text-status-resolved"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            cancel();
          }}
          aria-label={`Cancel editing ${label.toLowerCase()}`}
          className="rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span
      /* A container that clips or nowraps its children would swallow the
         error line below — see the note in components/ui/object-header.tsx. */
      data-inline-edit=""
      className={cn("inline-flex min-w-0 flex-col gap-0.5", className)}
    >
      <button
        type="button"
        onClick={open}
        disabled={disabled}
        aria-label={`Edit ${label.toLowerCase()}`}
        className={cn(
          "group -mx-1 inline-flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          disabled
            ? "cursor-default"
            : "hover:bg-surface-hover",
        )}
      >
        <span className={cn("min-w-0 truncate", !shown && "text-faint-foreground")}>
          {shown ? (format ? format(shown) : shown) : placeholder}
        </span>
        {saving ? (
          <Loader2 aria-hidden className="size-3 shrink-0 animate-spin text-faint-foreground" />
        ) : disabled ? null : (
          <Pencil
            aria-hidden
            className="size-3 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </button>
      {error ? (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
