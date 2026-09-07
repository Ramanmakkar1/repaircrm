"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createAssetAction,
  deleteAssetAction,
  updateAssetAction,
} from "@/app/(app)/customers/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
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
import { Textarea } from "@/components/ui/textarea";
import { toastWithUndo } from "@/components/ui/undo-toast";
import { assetLabel } from "./format";

export type AssetRow = {
  id: string;
  type: string;
  make: string | null;
  model: string | null;
  serial: string | null;
  password: string | null;
  notes: string | null;
};

/** Devices on file for this customer — what actually comes through the door. */
export function AssetsCard({
  customerId,
  assets,
}: {
  customerId: string;
  assets: AssetRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<AssetRow | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const open = adding || editing !== null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    const result = editing
      ? await updateAssetAction(editing.id, formData)
      : await createAssetAction(customerId, formData);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? "Device updated." : "Device added.");
    setAdding(false);
    setEditing(null);
    router.refresh();
  }

  /**
   * Remove, then offer it back — no confirm.
   *
   * A device IS referenced by id: `Ticket.assetId` points at it. What makes
   * the undo honest anyway is that `deleteAssetAction` refuses outright when
   * any ticket is attached ("This device is attached to 2 tickets and can't be
   * deleted") — so the only rows that ever reach this path are ones nothing
   * points at, and re-creating through `createAssetAction` restores everything
   * that was on screen. The passcode rides along: it is on the row this card
   * already renders from, and losing it to a mis-click would mean phoning the
   * customer back for it.
   */
  async function remove(asset: AssetRow) {
    setBusy(true);
    const result = await deleteAssetAction(asset.id);
    setBusy(false);

    if (!result.ok) {
      // The "attached to N tickets" refusal lands here — a message, not a
      // dialog, because the operator has done nothing wrong yet.
      toast.error(result.error);
      return;
    }
    router.refresh();

    toastWithUndo({
      message: `${assetLabel(asset)} removed.`,
      description: asset.serial ?? undefined,
      undo: async () => {
        const form = new FormData();
        form.set("type", asset.type);
        if (asset.make) form.set("make", asset.make);
        if (asset.model) form.set("model", asset.model);
        if (asset.serial) form.set("serial", asset.serial);
        if (asset.password) form.set("password", asset.password);
        if (asset.notes) form.set("notes", asset.notes);

        const restored = await createAssetAction(customerId, form);
        if (!restored.ok) throw new Error(restored.error);
        router.refresh();
      },
      onUndoError: "Could not put that device back.",
    });
  }

  return (
    <Card>
      <CardHeader
        icon={ICONS.device}
        title="Devices"
        action={
          <>
            {assets.length > 0 ? <Chip>{assets.length}</Chip> : null}
            <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
              <ACTIONS.add />
              Add
            </Button>
          </>
        }
      />

      <CardContent className="p-0">
        {assets.length === 0 ? (
          <EmptyState
            className="px-5 py-10"
            icon={ICONS.device}
            title="No devices on file"
            hint="Devices saved here become one-tap choices when you write the next ticket."
            action={
              <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
                <ACTIONS.add />
                Add a device
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="group flex items-start justify-between gap-3 px-5 py-4"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {assetLabel(asset)}
                    </span>
                    <Badge variant="secondary">{asset.type}</Badge>
                  </div>
                  {asset.serial ? (
                    <span className="font-mono text-[13px] text-muted-foreground">
                      {asset.serial}
                    </span>
                  ) : null}
                  {asset.notes ? (
                    <span className="text-[13.5px] text-muted-foreground">
                      {asset.notes}
                    </span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    aria-label={`Edit ${assetLabel(asset)}`}
                    onClick={() => setEditing(asset)}
                  >
                    <ACTIONS.edit />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Remove ${assetLabel(asset)}`}
                    onClick={() => remove(asset)}
                    className="size-9 text-muted-foreground hover:text-destructive"
                  >
                    <ACTIONS.delete />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Add / edit ------------------------------------------------------- */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next || busy) return;
          setAdding(false);
          setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit device" : "Add device"}</DialogTitle>
            <DialogDescription>
              Captured at intake so the next ticket starts with the device already
              on file.
            </DialogDescription>
          </DialogHeader>

          <form
            key={editing?.id ?? "new-asset"}
            onSubmit={submit}
            className="flex flex-col gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-type">
                  Type<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="asset-type"
                  name="type"
                  defaultValue={editing?.type ?? ""}
                  placeholder="Laptop"
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-make">Make</Label>
                <Input
                  id="asset-make"
                  name="make"
                  defaultValue={editing?.make ?? ""}
                  placeholder="Apple"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-model">Model</Label>
                <Input
                  id="asset-model"
                  name="model"
                  defaultValue={editing?.model ?? ""}
                  placeholder="MacBook Pro 14"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="asset-serial">Serial</Label>
                  {/*
                    Reserved for the camera scanner (components/scan/, landing
                    separately): a `<Button variant="soft" size="sm">` with
                    `ACTIONS.scan` goes here and writes the decoded code into
                    #asset-serial. It sits ON the label row, at full tap size,
                    because these shops have no laser gun — the phone camera is
                    the only scanner, and typing a 17-character serial off the
                    back of a laptop is where this form actually loses people.
                  */}
                </div>
                <Input
                  id="asset-serial"
                  name="serial"
                  defaultValue={editing?.serial ?? ""}
                  className="font-mono"
                  inputMode="text"
                  autoCapitalize="characters"
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-password">Passcode</Label>
                <Input
                  id="asset-password"
                  name="password"
                  defaultValue={editing?.password ?? ""}
                  placeholder="Unlock code"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="asset-notes">Notes</Label>
              <Textarea
                id="asset-notes"
                name="notes"
                rows={3}
                defaultValue={editing?.notes ?? ""}
                placeholder="Condition at intake, accessories left with the device…"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {editing ? <ACTIONS.save /> : <ACTIONS.add />}
                {busy ? "Saving…" : editing ? "Save device" : "Add device"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </Card>
  );
}
