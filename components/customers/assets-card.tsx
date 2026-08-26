"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Laptop, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createAssetAction,
  deleteAssetAction,
  updateAssetAction,
} from "@/app/(app)/customers/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [removing, setRemoving] = React.useState<AssetRow | null>(null);
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

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const result = await deleteAssetAction(removing.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Device removed.");
    setRemoving(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5">
          <Laptop className="size-3.5 text-muted-foreground" />
          Devices
          {assets.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {assets.length}
            </span>
          ) : null}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {assets.length === 0 ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">
            No devices on file yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="group flex items-start justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-foreground">
                      {assetLabel(asset)}
                    </span>
                    <Badge variant="secondary">{asset.type}</Badge>
                  </div>
                  {asset.serial ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {asset.serial}
                    </span>
                  ) : null}
                  {asset.notes ? (
                    <span className="text-xs text-muted-foreground">{asset.notes}</span>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${assetLabel(asset)}`}
                    onClick={() => setEditing(asset)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${assetLabel(asset)}`}
                    onClick={() => setRemoving(asset)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
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
            className="flex flex-col gap-3"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-make">Make</Label>
                <Input
                  id="asset-make"
                  name="make"
                  defaultValue={editing?.make ?? ""}
                  placeholder="Apple"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-model">Model</Label>
                <Input
                  id="asset-model"
                  name="model"
                  defaultValue={editing?.model ?? ""}
                  placeholder="MacBook Pro 14"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-serial">Serial</Label>
                <Input
                  id="asset-serial"
                  name="serial"
                  defaultValue={editing?.serial ?? ""}
                  className="font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asset-password">Passcode</Label>
                <Input
                  id="asset-password"
                  name="password"
                  defaultValue={editing?.password ?? ""}
                  placeholder="Unlock code"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
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
                {busy ? "Saving…" : editing ? "Save device" : "Add device"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm --------------------------------------------------- */}
      <Dialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setRemoving(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove device?</DialogTitle>
            <DialogDescription>
              {removing ? assetLabel(removing) : ""} will be removed from this
              customer. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              {busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
