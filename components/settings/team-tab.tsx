"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  inviteUserAction,
  setUserActiveAction,
  updateUserRoleAction,
} from "@/app/(app)/settings/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ROLE_BLURB, ROLE_OPTIONS, type TeamMember } from "./types";

/**
 * Who can sign in, and as what.
 *
 * There is no delete: a departed technician's name is on tickets, payments and
 * time entries, and a shop's history should not develop holes. Deactivating
 * closes the door (`login()` refuses an inactive account) while leaving the
 * record intact.
 */
export function TeamTab({
  members,
  currentUserId,
}: {
  members: TeamMember[];
  currentUserId: string;
}) {
  const [inviting, setInviting] = React.useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button onClick={() => setInviting(true)}>
          <UserPlus /> Add team member
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th className="w-[190px]">Role</Th>
                  <Th className="w-[130px] text-right">Active</Th>
                </Tr>
              </THead>
              <TBody>
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelf={member.id === currentUserId}
                  />
                ))}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What each role can do</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ROLE_OPTIONS.map((role) => (
            <div key={role.value} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <span className="w-28 shrink-0 text-sm font-bold text-foreground">
                {role.label}
              </span>
              <span className="text-[14px] leading-relaxed text-muted-foreground">
                {ROLE_BLURB[role.value]}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: TeamMember; isSelf: boolean }) {
  const router = useRouter();
  const [role, setRole] = React.useState(member.role);
  const [active, setActive] = React.useState(member.active);
  const [busy, setBusy] = React.useState(false);

  // Follow the server when the page re-renders with new values.
  React.useEffect(() => setRole(member.role), [member.role]);
  React.useEffect(() => setActive(member.active), [member.active]);

  async function changeRole(next: string) {
    const previous = role;
    setRole(next);
    setBusy(true);
    const result = await updateUserRoleAction(member.id, next);
    setBusy(false);

    if (!result.ok) {
      setRole(previous);
      toast.error(result.error);
      return;
    }
    toast.success(`${member.name} is now ${next === "FRONT_DESK" ? "front desk" : next.toLowerCase()}.`);
    router.refresh();
  }

  async function changeActive(next: boolean) {
    setActive(next);
    setBusy(true);
    const result = await setUserActiveAction(member.id, next);
    setBusy(false);

    if (!result.ok) {
      setActive(!next);
      toast.error(result.error);
      return;
    }
    toast.success(`${member.name} ${next ? "reactivated" : "deactivated"}.`);
    router.refresh();
  }

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-semibold text-foreground",
              !active && "text-muted-foreground",
            )}
          >
            {member.name}
          </span>
          {isSelf ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-accent-soft-foreground">
              You
            </span>
          ) : null}
        </div>
      </Td>
      <Td className="text-muted-foreground">{member.email}</Td>
      <Td>
        <Select value={role} onValueChange={changeRole} disabled={busy}>
          <SelectTrigger aria-label={`Role for ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
      <Td className="text-right">
        <div className="flex justify-end">
          <Switch
            checked={active}
            disabled={busy || isSelf}
            onCheckedChange={changeActive}
            aria-label={`${active ? "Deactivate" : "Activate"} ${member.name}`}
          />
        </div>
      </Td>
    </Tr>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState("TECH");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("TECH");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await inviteUserAction({ name, email, password, role });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name} can now sign in.`);
    reset();
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>
            They sign in with this email and the temporary password you set —
            pass it on in person and have them change it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jordan Alvarez"
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jordan@example.com"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-password">Temporary password</Label>
            <Input
              id="invite-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {ROLE_BLURB[role]}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
