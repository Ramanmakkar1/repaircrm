"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Laptop, Monitor, Smartphone, Tablet, Wrench } from "lucide-react";
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
import { cn } from "@/components/ui/cn";
import { deviceImageSource } from "@/lib/inventory/product-images";
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

/** The stand-in picture when no device photo matches: an icon for the family, never a made-up model. */
function DeviceIcon({ text, className }: { text: string; className?: string }) {
  const kind = text.toLowerCase();
  const props = { className, strokeWidth: 1.3, "aria-hidden": true } as const;
  if (/ipad|tablet/.test(kind)) return <Tablet {...props} />;
  if (/iphone|galaxy|pixel|phone|smartphone|mobile/.test(kind)) return <Smartphone {...props} />;
  if (/macbook|laptop|notebook/.test(kind)) return <Laptop {...props} />;
  if (/desktop|imac|monitor|computer|pc\b/.test(kind)) return <Monitor {...props} />;
  return <Wrench {...props} />;
}

/**
 * One saved device as a picture tile, like the boxes on Home: the picture on its
 * white canvas, the name, then the type and serial. The whole tile edits it.
 */
function DeviceTile({ asset, onOpen }: { asset: AssetRow; onOpen: () => void }) {
  const label = assetLabel(asset);
  const photo = deviceImageSource(`${asset.type} ${label}`);
  const detail = [asset.type !== label ? asset.type : null, asset.serial].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Edit ${label}`}
      className={cn(
        // No min height: the 4:3 picture and the name already make every tile taller than any floor would.
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left",
        "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className={cn("relative block aspect-[4/3] w-full", photo ? "bg-white" : "bg-surface-hover")}>
        {photo ? (
          <Image src={photo.src} alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 220px" className="object-contain p-3" />
        ) : (
          <span aria-hidden className="flex size-full items-center justify-center text-foreground">
            <DeviceIcon text={`${asset.type} ${label}`} className="size-14" />
          </span>
        )}
        <span aria-hidden className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm">
          <ACTIONS.edit className="size-4" />
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3">
        <span className="text-base font-semibold leading-tight sm:text-lg">{label}</span>
        {detail ? <span className="truncate text-[13px] leading-snug text-muted-foreground sm:text-sm">{detail}</span> : null}
        {asset.notes ? <span className="line-clamp-1 text-[13px] leading-snug text-muted-foreground sm:text-sm">{asset.notes}</span> : null}
      </span>
    </button>
  );
}

/**
 * Devices on file for this customer — what actually comes through the door.
 *
 * `easy` is the Devices section of the POS-style customer screen: the same
 * saved devices as picture tiles (tap one to edit it or remove it), with an
 * "Add a device" tile last. The add / edit / remove behaviour is the same
 * code as the Full card below, only the surface differs.
 */
export function AssetsCard({
  customerId,
  assets,
  easy = false,
}: {
  customerId: string;
  assets: AssetRow[];
  easy?: boolean;
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
   * any repair is attached ("This device is attached to 2 repairs and can't be
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
      // The "attached to N repairs" refusal lands here — a message, not a
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

  // Add / edit: one dialog, shared by the Full card and the Easy tiles.
  const dialog = (
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
            {easy
              ? "Saved here, the device is one tap away when you start the next repair."
              : "Captured at intake so the next repair starts with the device already on file."}
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
            {easy && editing ? (
              // Removing keeps its undo toast and the "attached to N repairs" refusal;
              // the dialog just closes first so that message is not hidden behind it.
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="mr-auto text-destructive"
                onClick={() => {
                  const target = editing;
                  setEditing(null);
                  void remove(target);
                }}
              >
                <ACTIONS.delete />
                Remove
              </Button>
            ) : null}
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
  );

  if (easy) {
    return (
      <section aria-label="Devices" className="flex flex-col gap-3">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
            <ICONS.device className="size-10 text-faint-foreground" strokeWidth={1.4} aria-hidden />
            <div className="flex max-w-sm flex-col gap-1">
              <p className="text-lg font-semibold">No devices on file</p>
              <p className="text-base text-muted-foreground">Devices saved here become one-tap choices when you start the next repair.</p>
            </div>
            <Button size="lg" className="h-14 px-8 text-base" onClick={() => setAdding(true)}>
              <ACTIONS.add className="size-5" />
              Add a device
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <li key={asset.id}>
                <DeviceTile asset={asset} onOpen={() => setEditing(asset)} />
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setAdding(true)}
                // Beside device tiles it stretches to their height (h-full); alone on a row it keeps the photo's 4:3 shape.
                className={cn(
                  "flex aspect-[4/3] h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong bg-surface px-3 text-center",
                  "transition-[border-color,transform] duration-150 hover:border-ring active:scale-[0.98]",
                  "motion-reduce:transition-none motion-reduce:active:scale-100",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <ACTIONS.add className="size-6" />
                </span>
                <span className="text-base font-semibold sm:text-lg">Add a device</span>
              </button>
            </li>
          </ul>
        )}
        {dialog}
      </section>
    );
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
            hint="Devices saved here become one-tap choices when you book in the next repair."
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

      {dialog}

    </Card>
  );
}
