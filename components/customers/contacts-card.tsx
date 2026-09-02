"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
// Mail / Phone / UserRound are contact details; the verbs come from ACTIONS.
import { Mail, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";

import {
  createContactAction,
  deleteContactAction,
  updateContactAction,
} from "@/app/(app)/customers/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/components/ui/icons";
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
import { EM_DASH } from "./format";

export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  label: string | null;
};

/** Additional people to reach at a business account. */
export function ContactsCard({
  customerId,
  contacts,
}: {
  customerId: string;
  contacts: ContactRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<ContactRow | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<ContactRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const open = adding || editing !== null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    const result = editing
      ? await updateContactAction(editing.id, formData)
      : await createContactAction(customerId, formData);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(editing ? "Contact updated." : "Contact added.");
    setAdding(false);
    setEditing(null);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    const result = await deleteContactAction(removing.id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Contact removed.");
    setRemoving(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        icon={UserRound}
        title="Contacts"
        action={
          <>
            {contacts.length > 0 ? <Chip>{contacts.length}</Chip> : null}
            <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
              <ACTIONS.add />
              Add
            </Button>
          </>
        }
      />

      <CardContent className="p-0">
        {contacts.length === 0 ? (
          <EmptyState
            className="px-5 py-10"
            icon={UserRound}
            title="No extra contacts"
            hint="Add the office manager, a spouse, whoever else the shop actually rings."
            action={
              <Button size="sm" variant="soft" onClick={() => setAdding(true)}>
                <ACTIONS.add />
                Add a contact
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="group flex items-start justify-between gap-3 px-5 py-4"
              >
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {contact.name}
                    </span>
                    {contact.label ? (
                      <Badge variant="secondary">{contact.label}</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1 text-[13.5px] text-muted-foreground">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-2 truncate hover:text-accent hover:underline"
                      >
                        <Mail className="size-4 shrink-0 text-faint-foreground" />
                        {contact.email}
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-2 hover:text-accent hover:underline"
                      >
                        <Phone className="size-4 shrink-0 text-faint-foreground" />
                        {contact.phone}
                      </a>
                    ) : null}
                    {!contact.email && !contact.phone ? <span>{EM_DASH}</span> : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9"
                    aria-label={`Edit ${contact.name}`}
                    onClick={() => setEditing(contact)}
                  >
                    <ACTIONS.edit />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${contact.name}`}
                    onClick={() => setRemoving(contact)}
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
            <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>
              Someone else at this account the shop may need to reach.
            </DialogDescription>
          </DialogHeader>

          {/* key resets the uncontrolled inputs between records */}
          <form
            key={editing?.id ?? "new-contact"}
            onSubmit={submit}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-name">
                Name<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id="contact-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-label">Role</Label>
              <Input
                id="contact-label"
                name="label"
                defaultValue={editing?.label ?? ""}
                placeholder="Office Manager"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  defaultValue={editing?.email ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  name="phone"
                  type="tel"
                  defaultValue={editing?.phone ?? ""}
                />
              </div>
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
                {busy ? "Saving…" : editing ? "Save contact" : "Add contact"}
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
            <DialogTitle>Remove contact?</DialogTitle>
            <DialogDescription>
              {removing?.name} will be removed from this customer. This can&apos;t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              <ACTIONS.delete />
              {busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
