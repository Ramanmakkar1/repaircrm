"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  deleteChecklistTemplateAction,
  saveChecklistTemplateAction,
} from "@/app/(app)/settings/checklist-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_CHECKLIST_ITEMS, MAX_CHECKLIST_LABEL } from "@/lib/checklist";

/** A saved checklist as the settings screen sees it. */
export type ChecklistTemplateItem = {
  id: string;
  name: string;
  /** null = never auto-attached; a tech picks it by hand. */
  problemType: string | null;
  items: string[];
};

/** Radix Select cannot hold an empty string, so this is the "no type" value. */
const NONE = "none";

/**
 * The step-by-step lists a tech works through on a job — water-damage triage,
 * a pre-return QC pass, whatever the shop insists on.
 *
 * A template with a problem type is attached automatically when a ticket of
 * that type is created; one without is offered in a picker instead. Attaching
 * COPIES the steps, so editing a template here never rewrites a job already in
 * progress.
 */
export function ChecklistsCard({
  templates,
  problemTypes,
}: {
  templates: ChecklistTemplateItem[];
  problemTypes: string[];
}) {
  const [editing, setEditing] = React.useState<ChecklistTemplateItem | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Checklists</CardTitle>
          <CardDescription>
            Steps a tech ticks off on the ticket. Give one a problem type and it
            attaches itself to every new ticket of that type.
          </CardDescription>
        </div>
        <Button variant="soft" onClick={() => setCreating(true)}>
          <Plus /> New checklist
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {templates.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border-strong px-4 py-5">
            <span className="flex items-center gap-2 text-[14px] font-semibold text-foreground">
              <ListChecks className="size-4 text-muted-foreground" />
              No checklists yet
            </span>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              Write down the steps your techs should never skip, and every ticket
              of that problem type gets them automatically.
            </p>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> Create the first checklist
            </Button>
          </div>
        ) : (
          templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              onEdit={() => setEditing(template)}
            />
          ))
        )}
      </CardContent>

      <TemplateDialog
        open={creating}
        template={null}
        problemTypes={problemTypes}
        onClose={() => setCreating(false)}
      />
      <TemplateDialog
        open={editing !== null}
        template={editing}
        problemTypes={problemTypes}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: ChecklistTemplateItem;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function remove() {
    setBusy(true);
    const result = await deleteChecklistTemplateAction(template.id);
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${template.name}" deleted.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-hover/50 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[14.5px] font-bold text-foreground">
          {template.name}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">
          {template.items.length} step{template.items.length === 1 ? "" : "s"}
          {template.problemType
            ? ` · auto-attaches to ${template.problemType}`
            : " · picked by hand"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
        {confirming ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete ${template.name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TemplateDialog({
  open,
  template,
  problemTypes,
  onClose,
}: {
  open: boolean;
  /** null = create. */
  template: ChecklistTemplateItem | null;
  problemTypes: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [problemType, setProblemType] = React.useState(NONE);
  const [items, setItems] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Re-seed when a different template opens the dialog — during render, not in
  // an effect, so the previous checklist's steps are never briefly painted.
  const seedKey = `${open}:${template?.id ?? "new"}`;
  const [seed, setSeed] = React.useState(seedKey);
  if (seed !== seedKey) {
    setSeed(seedKey);
    setName(template?.name ?? "");
    setProblemType(template?.problemType ?? NONE);
    setItems(template?.items ?? []);
    setDraft("");
  }

  function addItem() {
    const value = draft.trim();
    if (!value || items.length >= MAX_CHECKLIST_ITEMS) return;
    setItems((prev) => [...prev, value.slice(0, MAX_CHECKLIST_LABEL)]);
    setDraft("");
  }

  function move(index: number, delta: number) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveChecklistTemplateAction({
      id: template?.id ?? null,
      name,
      problemType: problemType === NONE ? null : problemType,
      items,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(template ? "Checklist saved." : `"${name}" created.`);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? "Edit checklist" : "New checklist"}</DialogTitle>
          <DialogDescription>
            The steps appear on the ticket in this order, each with a box to tick.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="checklist-name">Name</Label>
            <Input
              id="checklist-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Water damage intake"
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="checklist-problem">Attach automatically to</Label>
            <Select value={problemType} onValueChange={setProblemType}>
              <SelectTrigger id="checklist-problem">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={NONE}>Nothing — pick it by hand</SelectItem>
                {problemTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Steps</Label>
            <div className="flex flex-col gap-1.5">
              {items.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="flex items-center gap-2 rounded-md bg-surface-hover px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-[12.5px] font-bold tabular-nums text-faint-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                    {item}
                  </span>
                  <IconButton
                    label={`Move "${item}" up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Move "${item}" down`}
                    disabled={index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Remove "${item}"`}
                    onClick={() =>
                      setItems((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <X className="size-3.5" />
                  </IconButton>
                </div>
              ))}
              {items.length === 0 ? (
                <p className="px-1 text-[13.5px] text-muted-foreground">
                  No steps yet — add the first one below.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addItem();
                  }
                }}
                placeholder="Photograph the device on all sides"
                maxLength={MAX_CHECKLIST_LABEL}
                aria-label="Add a step"
              />
              <Button
                type="button"
                variant="soft"
                onClick={addItem}
                disabled={!draft.trim() || items.length >= MAX_CHECKLIST_ITEMS}
              >
                <Plus /> Add
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || name.trim() === "" || items.length === 0}
            >
              {busy ? "Saving…" : template ? "Save checklist" : "Create checklist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-faint-foreground transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
