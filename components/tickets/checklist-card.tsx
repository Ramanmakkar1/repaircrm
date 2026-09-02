"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";

import {
  attachChecklistAction,
  removeChecklistAction,
  toggleChecklistItemAction,
} from "@/app/(app)/tickets/checklist-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { checklistProgress, progressLabel, type ChecklistItem } from "@/lib/checklist";

export type ChecklistOption = { id: string; name: string };

/**
 * The steps this job must not skip.
 *
 * Each box writes straight through to the server — there is no Save button,
 * because a checklist someone forgot to save is worse than no checklist. The
 * row is ticked optimistically and rolled back if the write is refused, so the
 * bench never waits on a round trip to see its own tick.
 */
export function ChecklistCard({
  ticketId,
  items,
  templates,
}: {
  ticketId: string;
  items: ChecklistItem[];
  /** Saved checklists, offered when this ticket has none. */
  templates: ChecklistOption[];
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState(items);
  const [busy, setBusy] = React.useState(false);
  const [picked, setPicked] = React.useState("");
  const [confirmingRemove, setConfirmingRemove] = React.useState(false);

  // Follow the server when the page re-renders with a different checklist.
  // Adjusted during render rather than in an effect — React re-renders this
  // component before touching the DOM, so the stale list is never painted.
  const [seed, setSeed] = React.useState(items);
  if (seed !== items) {
    setSeed(items);
    setRows(items);
  }

  const progress = checklistProgress(rows);
  const complete = progress.total > 0 && progress.done === progress.total;

  async function toggle(index: number, next: boolean) {
    const item = rows[index];
    if (!item) return;

    const previous = rows;
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, done: next } : row)),
    );
    setBusy(true);
    const result = await toggleChecklistItemAction(
      ticketId,
      index,
      item.label,
      next,
    );
    setBusy(false);

    if (result.error) {
      setRows(previous);
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function attach() {
    if (!picked) return;
    setBusy(true);
    const result = await attachChecklistAction(ticketId, picked);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Checklist added.");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const result = await removeChecklistAction(ticketId);
    setBusy(false);
    setConfirmingRemove(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Checklist removed.");
    router.refresh();
  }

  // Nothing attached and nothing to attach — the card would be an empty box
  // asking a question with no answers, so it is simply not rendered.
  if (rows.length === 0 && templates.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Checklist</CardTitle>
        {rows.length > 0 ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold tabular-nums",
              complete
                ? "bg-status-resolved-bg text-status-resolved-fg"
                : "bg-surface-hover text-muted-foreground",
            )}
          >
            {progressLabel(progress)}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              No checklist on this ticket. Add one so nothing gets skipped
              before the device goes back.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={picked} onValueChange={setPicked}>
                <SelectTrigger
                  aria-label="Checklist to add"
                  className="w-full sm:max-w-xs"
                >
                  <SelectValue placeholder="Choose a checklist…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={attach} disabled={busy || !picked}>
                <ListChecks className="size-4" />
                Add checklist
              </Button>
            </div>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {rows.map((row, index) => (
                <li key={`${row.label}-${index}`}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover">
                    <Checkbox
                      className="mt-0.5"
                      checked={row.done}
                      disabled={busy}
                      onCheckedChange={(value) => toggle(index, value === true)}
                      aria-label={row.label}
                    />
                    <span
                      className={cn(
                        "text-[14.5px] leading-snug",
                        row.done
                          ? "text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                    >
                      {row.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              {confirmingRemove ? (
                <>
                  <span className="mr-auto text-[13px] text-muted-foreground">
                    Remove this checklist and its ticks?
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Keep it
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={remove}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingRemove(true)}
                  disabled={busy}
                >
                  Remove
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
