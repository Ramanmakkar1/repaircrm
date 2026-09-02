"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Plus, Star, Users } from "lucide-react";
import { toast } from "sonner";

import {
  saveLocationAction,
  setDefaultLocationAction,
  setLocationActiveAction,
  setLocationStaffAction,
} from "@/app/(app)/settings/location-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/components/ui/cn";

/**
 * One branch as the settings screen sees it. Declared here rather than in
 * ./types so this feature's shapes travel with the feature.
 */
export type LocationItem = {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  isDefault: boolean;
  active: boolean;
};

/** A team member, plus where they are based today. */
export type LocationStaffMember = {
  id: string;
  name: string;
  email: string;
  defaultLocationId: string | null;
  defaultLocationName: string | null;
};

/**
 * The shop's branches, one card each.
 *
 * Two rules the UI never lets you break (and the actions refuse anyway):
 * the default location cannot be deactivated, and neither can the last active
 * one — every ticket and invoice is stamped with a branch, so a shop with none
 * would have nowhere to file new work.
 *
 * "Staff based here" writes `User.defaultLocationId`, which is what decides
 * which branch a person sees when they sign in and have not picked one.
 */
export function LocationsTab({
  locations,
  members,
}: {
  locations: LocationItem[];
  members: LocationStaffMember[];
}) {
  const [editing, setEditing] = React.useState<LocationItem | null>(null);
  const [creating, setCreating] = React.useState(false);

  const activeCount = locations.filter((location) => location.active).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Every ticket and invoice is filed against a location. With two or more
          open, a switcher appears in the top bar to filter the whole app down to
          one of them.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Add location
        </Button>
      </div>

      {locations.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            hint="Add the shop's address so new tickets and invoices have somewhere to belong."
            action={<Button onClick={() => setCreating(true)}>Add location</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              members={members}
              canDeactivate={!location.isDefault && activeCount > 1}
              onEdit={() => setEditing(location)}
            />
          ))}
        </div>
      )}

      <LocationDialog
        open={creating}
        location={null}
        onClose={() => setCreating(false)}
      />
      <LocationDialog
        open={editing !== null}
        location={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function LocationCard({
  location,
  members,
  canDeactivate,
  onEdit,
}: {
  location: LocationItem;
  members: LocationStaffMember[];
  canDeactivate: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [staffOpen, setStaffOpen] = React.useState(false);

  const based = members.filter((member) => member.defaultLocationId === location.id);

  const address = [
    location.address1,
    location.address2,
    [location.city, location.state].filter(Boolean).join(", "),
    location.postalCode,
  ]
    .filter((part) => part && part.trim() !== "")
    .join(" · ");

  async function toggleActive(next: boolean) {
    setBusy(true);
    const result = await setLocationActiveAction(location.id, next);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${location.name} ${next ? "reopened" : "closed"}.`);
    router.refresh();
  }

  async function makeDefault() {
    setBusy(true);
    const result = await setDefaultLocationAction(location.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${location.name} is now the default.`);
    router.refresh();
  }

  return (
    <Card className={cn(!location.active && "opacity-70")}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="truncate">{location.name}</CardTitle>
            {location.isDefault ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-accent-soft-foreground">
                <Star className="size-3" />
                Default
              </span>
            ) : null}
            {!location.active ? (
              <span className="rounded-full bg-surface-hover px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
                Closed
              </span>
            ) : null}
          </div>
          <CardDescription>
            {address || "No address on file"}
            {location.phone ? ` · ${location.phone}` : ""}
          </CardDescription>
        </div>

        <Switch
          checked={location.active}
          disabled={busy || (location.active && !canDeactivate)}
          onCheckedChange={toggleActive}
          aria-label={`${location.active ? "Close" : "Reopen"} ${location.name}`}
        />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground">
            <Users className="size-3.5" />
            {based.length === 0
              ? "Nobody based here"
              : `${based.length} based here · ${based
                  .map((member) => member.name)
                  .join(", ")}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
            Edit details
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStaffOpen(true)}
            disabled={busy || !location.active}
          >
            Staff based here
          </Button>
          {!location.isDefault && location.active ? (
            <Button variant="ghost" size="sm" onClick={makeDefault} disabled={busy}>
              Make default
            </Button>
          ) : null}
        </div>

        {location.active && !canDeactivate && location.isDefault ? (
          <p className="text-[13px] text-muted-foreground">
            The default location stays open. Make another one the default first.
          </p>
        ) : null}
      </CardContent>

      <StaffDialog
        open={staffOpen}
        location={location}
        members={members}
        onClose={() => setStaffOpen(false)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

const BLANK = {
  name: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
};

function LocationDialog({
  open,
  location,
  onClose,
}: {
  open: boolean;
  /** null = create. */
  location: LocationItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = React.useState(BLANK);
  const [busy, setBusy] = React.useState(false);

  // Re-seed whenever a different location opens the dialog. Adjusted during
  // render rather than in an effect, so the form never paints the last
  // location's details for a frame.
  const seedKey = `${open}:${location?.id ?? "new"}`;
  const [seed, setSeed] = React.useState(seedKey);
  if (seed !== seedKey) {
    setSeed(seedKey);
    setValues(
      location
        ? {
            name: location.name,
            address1: location.address1 ?? "",
            address2: location.address2 ?? "",
            city: location.city ?? "",
            state: location.state ?? "",
            postalCode: location.postalCode ?? "",
            phone: location.phone ?? "",
          }
        : BLANK,
    );
  }

  const set = (key: keyof typeof BLANK, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveLocationAction({ id: location?.id ?? null, ...values });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(location ? "Location saved." : `${values.name} added.`);
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
          <DialogTitle>{location ? "Edit location" : "Add a location"}</DialogTitle>
          <DialogDescription>
            The name is what staff pick from; the address prints on documents
            raised here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="location-name">Name</Label>
            <Input
              id="location-name"
              value={values.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Northside Kiosk"
              maxLength={80}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="location-address1">Street</Label>
            <Input
              id="location-address1"
              value={values.address1}
              onChange={(event) => set("address1", event.target.value)}
              placeholder="118 Jasper Ave NW"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="location-address2">Suite / unit</Label>
            <Input
              id="location-address2"
              value={values.address2}
              onChange={(event) => set("address2", event.target.value)}
              placeholder="Unit 4"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="location-city">City</Label>
              <Input
                id="location-city"
                value={values.city}
                onChange={(event) => set("city", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="location-state">State</Label>
              <Input
                id="location-state"
                value={values.state}
                onChange={(event) => set("state", event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="location-postal">Postal code</Label>
              <Input
                id="location-postal"
                value={values.postalCode}
                onChange={(event) => set("postalCode", event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="location-phone">Phone</Label>
            <Input
              id="location-phone"
              value={values.phone}
              onChange={(event) => set("phone", event.target.value)}
              placeholder="(780) 555-0134"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || values.name.trim() === ""}>
              {busy ? "Saving…" : location ? "Save location" : "Add location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function StaffDialog({
  open,
  location,
  members,
  onClose,
}: {
  open: boolean;
  location: LocationItem;
  members: LocationStaffMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  // Same render-time adjustment as the details dialog above.
  const seedKey = `${open}:${location.id}`;
  const [seed, setSeed] = React.useState(seedKey);
  if (seed !== seedKey) {
    setSeed(seedKey);
    setPicked(
      members
        .filter((member) => member.defaultLocationId === location.id)
        .map((member) => member.id),
    );
  }

  function toggle(id: string, next: boolean) {
    setPicked((prev) =>
      next ? [...new Set([...prev, id])] : prev.filter((value) => value !== id),
    );
  }

  async function save() {
    setBusy(true);
    const result = await setLocationStaffAction(location.id, picked);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Staff updated.");
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Staff based at {location.name}</DialogTitle>
          <DialogDescription>
            This is the branch they see first when they sign in. Someone can only
            be based at one location.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {members.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">
              Nobody on the team yet — add people on the Team tab.
            </p>
          ) : (
            members.map((member) => {
              const checked = picked.includes(member.id);
              const elsewhere =
                member.defaultLocationId !== null &&
                member.defaultLocationId !== location.id;

              return (
                <label
                  key={member.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => toggle(member.id, value === true)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {member.name}
                    </span>
                    <span className="truncate text-[12.5px] text-muted-foreground">
                      {elsewhere && !checked
                        ? `Currently at ${member.defaultLocationName ?? "another location"}`
                        : member.email}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
