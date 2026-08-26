"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";

import {
  createContactAction,
  deleteContactAction,
  updateContactAction,
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
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-1.5">
          <UserRound className="size-3.5 text-muted-foreground" />
          Contacts
          {contacts.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              {contacts.length}
            </span>
          ) : null}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {contacts.length === 0 ? (
          <p className="px-4 py-5 text-center text-xs text-muted-foreground">
            No additional contacts yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="group flex items-start justify-between gap-3 px-4 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-foreground">
                      {contact.name}
                    </span>
                    {contact.label ? (
                      <Badge variant="secondary">{contact.label}</Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {contact.email ? (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1.5 truncate hover:text-accent hover:underline"
                      >
                        <Mail className="size-3 shrink-0" />
                        {contact.email}
                      </a>
                    ) : null}
                    {contact.phone ? (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1.5 hover:text-accent hover:underline"
                      >
                        <Phone className="size-3 shrink-0" />
                        {contact.phone}
                      </a>
                    ) : null}
                    {!contact.email && !contact.phone ? <span>{EM_DASH}</span> : null}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${contact.name}`}
                    onClick={() => setEditing(contact)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${contact.name}`}
                    onClick={() => setRemoving(contact)}
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
            <DialogTitle>{editing ? "Edit contact" : "Add contact"}</DialogTitle>
            <DialogDescription>
              Someone else at this account the shop may need to reach.
            </DialogDescription>
          </DialogHeader>

          {/* key resets the uncontrolled inputs between records */}
          <form
            key={editing?.id ?? "new-contact"}
            onSubmit={submit}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-label">Role</Label>
              <Input
                id="contact-label"
                name="label"
                defaultValue={editing?.label ?? ""}
                placeholder="Office Manager"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  name="email"
                  type="email"
                  defaultValue={editing?.email ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
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
              {busy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
