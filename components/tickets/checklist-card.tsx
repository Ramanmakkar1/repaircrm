"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  attachChecklistAction,
  removeChecklistAction,
  restoreChecklistAction,
  toggleChecklistItemAction,
} from "@/app/(app)/tickets/checklist-actions";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/badge";
import { ICONS } from "@/components/ui/icons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/components/ui/cn";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { checklistProgress, progressLabel, type ChecklistItem } from "@/lib/checklist";

export type ChecklistOption = { id: string; name: string };

/**
 * The steps this job must not skip.
 *
 * Each box writes straight through to the server — there is no Save button,
 * because a checklist someone forgot to save is worse than no checklist.
 *
 * ---------------------------------------------------------------------------
 * THE TICK LANDS FIRST
 * ---------------------------------------------------------------------------
 * A tech works down this list with a device in one hand. Waiting a round trip
 * per box — and being locked out of the next box while it flies — is the
 * difference between ticking a checklist and giving up on it. So the tick is
 * optimistic: `useOptimistic` scoped to the transition that does the write.
 * React holds the guess exactly as long as the write is in flight and drops it
 * when the transition settles, at which point `revalidatePath` has already
 * sent the real row down. A refused tick therefore rolls itself back with
 * nothing here to remember to undo, and — unlike the mirror-into-state version
 * this replaced — someone else's edit arriving mid-flight wins on its own.
 *
 * ---------------------------------------------------------------------------
 * REMOVE IS UNDO, NOT A CONFIRM
 * ---------------------------------------------------------------------------
 * Removing used to ask "Remove this checklist and its ticks?" in place. It now
 * just removes, and offers the checklist back for eight seconds. The undo is
 * real: `restoreChecklistAction` writes back the rows this component was
 * already holding — the ticks and their timestamps included — which is why it
 * exists at all. Re-attaching the template would have given the steps back
 * unticked, and an "Undo" that silently unticks eleven boxes is worse than the
 * removal it claimed to fix.
 */
export function ChecklistCard({
  ticketId,
  items,
  templateId,
  templates,
}: {
  ticketId: string;
  items: ChecklistItem[];
  /** Which saved checklist these steps were copied from, for a faithful undo. */
  templateId: string | null;
  /** Saved checklists, offered when this ticket has none. */
  templates: ChecklistOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [picked, setPicked] = React.useState("");

  const [ticking, startTicking] = React.useTransition();
  const [rows, tickOptimistically] = React.useOptimistic(
    items,
    (current: ChecklistItem[], patch: { index: number; done: boolean }) =>
      current.map((row, i) =>
        i === patch.index ? { ...row, done: patch.done } : row,
      ),
  );

  const progress = checklistProgress(rows);
  const complete = progress.total > 0 && progress.done === progress.total;

  function toggle(index: number, next: boolean) {
    const item = rows[index];
    if (!item) return;

    startTicking(async () => {
      // Inside the transition: that is what scopes the guess to it.
      tickOptimistically({ index, done: next });

      const result = await toggleChecklistItemAction(
        ticketId,
        index,
        item.label,
        next,
      );
      if (result.error) {
        // The guess falls away with the transition — the box un-ticks itself.
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
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
    // The SERVER's rows, not the optimistic view: an undo has to put back what
    // was actually stored. Ticking is blocked while this runs, so the two
    // cannot disagree.
    const snapshot = items;
    const previousTemplateId = templateId;

    setBusy(true);
    const result = await removeChecklistAction(ticketId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.refresh();

    const removed = checklistProgress(snapshot);
    toastWithUndo({
      message: "Checklist removed.",
      description: `${removed.total} step${removed.total === 1 ? "" : "s"}, ${
        removed.done
      } ticked.`,
      undo: async () => {
        const restored = await restoreChecklistAction(
          ticketId,
          snapshot,
          previousTemplateId,
        );
        if (restored.error) throw new Error(restored.error);
        router.refresh();
      },
      onUndoError: "Could not put that checklist back.",
    });
  }

  // Nothing attached and nothing to attach — the card would be an empty box
  // asking a question with no answers, so it is simply not rendered.
  if (rows.length === 0 && templates.length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon={ICONS.checklist}
        title="Checklist"
        action={
          rows.length > 0 ? (
            <StatusPill
              size="sm"
              dot={false}
              tone={complete ? "success" : "neutral"}
              label={progressLabel(progress)}
              className="tabular-nums"
            />
          ) : null
        }
      />

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
                <ICONS.checklist className="size-4" />
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
                    {/* Not disabled while a tick is in flight. The whole point
                        of the optimistic tick is that the next box is ready
                        before the last one has landed. */}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={remove}
                /* Held while a tick is still flying, so the snapshot the undo
                   restores is the same list the operator was looking at. */
                disabled={busy || ticking}
              >
                Remove
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
