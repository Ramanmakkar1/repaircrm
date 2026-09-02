"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  inviteUserAction,
  resendInviteAction,
  resetUserTotpAction,
  setUserActiveAction,
  updateUserRoleAction,
} from "@/app/(app)/settings/actions";
import { formatDateTime } from "@/components/billing/format";
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
import { ACTIONS } from "@/components/ui/icons";
import { Badge, StatusPill } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { GoogleMark } from "@/components/auth/google-button";
import { ROLE_BLURB, ROLE_OPTIONS, type TeamMember } from "./types";

/**
 * Who can sign in, and as what.
 *
 * There is no delete: a departed technician's name is on tickets, payments and
 * time entries, and a shop's history should not develop holes. Deactivating
 * closes the door (`login()` refuses an inactive account) while leaving the
 * record intact.
 */
const AddIcon = ACTIONS.add;
const SendIcon = ACTIONS.send;
const DeactivateIcon = ACTIONS.void;
const CopyIcon = ACTIONS.copy;

export function TeamTab({
  members,
  currentUserId,
}: {
  members: TeamMember[];
  currentUserId: string;
}) {
  const [inviting, setInviting] = React.useState(false);
  // Only ever set when the email driver is "log" — see inviteUserAction.
  const [inviteLink, setInviteLink] = React.useState<{
    name: string;
    url: string;
  } | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button onClick={() => setInviting(true)}>
          <AddIcon aria-hidden /> Add team member
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
                  <Th className="w-[110px] text-right">Active</Th>
                  <Th className="w-[190px] text-right">Access</Th>
                </Tr>
              </THead>
              <TBody>
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isSelf={member.id === currentUserId}
                    onLink={setInviteLink}
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

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onLink={setInviteLink}
      />

      <InviteLinkDialog link={inviteLink} onClose={() => setInviteLink(null)} />
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  onLink,
}: {
  member: TeamMember;
  isSelf: boolean;
  onLink: (link: { name: string; url: string }) => void;
}) {
  const router = useRouter();
  const [role, setRole] = React.useState(member.role);
  const [active, setActive] = React.useState(member.active);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<"invite" | "totp" | null>(null);
  const [deactivating, setDeactivating] = React.useState(false);

  // Follow the server when the page re-renders with new values. Adjusted
  // during render rather than from an effect: React re-runs the row before it
  // touches the DOM, so it never paints the stale role for a frame.
  const [fromServer, setFromServer] = React.useState(member);
  if (fromServer.role !== member.role || fromServer.active !== member.active) {
    setFromServer(member);
    setRole(member.role);
    setActive(member.active);
  }

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

  async function resendInvite() {
    setBusy(true);
    setPending("invite");
    const result = await resendInviteAction(member.id);
    setBusy(false);
    setPending(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.inviteUrl) {
      onLink({ name: member.name, url: result.inviteUrl });
    } else {
      toast.success(`Invite re-sent to ${member.email}.`);
    }
    router.refresh();
  }

  async function resetTotp() {
    setBusy(true);
    setPending("totp");
    const result = await resetUserTotpAction(member.id);
    setBusy(false);
    setPending(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Two-step verification cleared for ${member.name}.`);
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
    setDeactivating(false);
    toast.success(
      next
        ? `${member.name} can sign in again.`
        : `${member.name} deactivated — they can no longer sign in.`,
    );
    router.refresh();
  }

  return (
    <Tr>
      <Td>
        <div className="flex flex-col gap-0.5">
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
            {member.twoFactorOn ? (
              // No dot: the row is dense and the word is already the signal.
              <StatusPill
                size="sm"
                dot={false}
                tone="success"
                label="2FA on"
                title="Two-step verification is on"
              />
            ) : null}
            {active ? null : (
              <StatusPill size="sm" dot={false} tone="neutral" label="Deactivated" />
            )}
            {/* So an owner can see at a glance who signs in with Google. This
                is provenance, not a status, so it wears the plain Badge rather
                than a toned StatusPill. */}
            {member.googleLinked ? (
              <Badge
                variant="outline"
                title="Signs in with Google"
                className="gap-1 px-2 py-0.5 text-[11.5px] uppercase tracking-wide text-muted-foreground"
              >
                <GoogleMark className="size-3" /> Google
              </Badge>
            ) : null}
          </div>
          <span className="text-[12.5px] text-muted-foreground">
            {member.lastLoginAt
              ? `Last sign-in ${formatDateTime(member.lastLoginAt)}`
              : "Never signed in"}
          </span>
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
          {/*
            Reactivating is harmless; deactivating locks a colleague out mid-
            shift, so it asks first. Neither is ever offered for yourself.
          */}
          <Switch
            checked={active}
            disabled={busy || isSelf}
            onCheckedChange={(next) =>
              next ? changeActive(true) : setDeactivating(true)
            }
            aria-label={`${active ? "Deactivate" : "Activate"} ${member.name}`}
          />
        </div>
      </Td>
      <Td className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {!member.lastLoginAt ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !active}
              onClick={resendInvite}
            >
              {pending === "invite" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <SendIcon aria-hidden />
              )}
              {pending === "invite" ? "Sending…" : "Resend invite"}
            </Button>
          ) : null}
          {member.twoFactorOn ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={resetTotp}
            >
              {pending === "totp" ? <Loader2 className="animate-spin" /> : null}
              {pending === "totp" ? "Clearing…" : "Reset 2FA"}
            </Button>
          ) : null}
        </div>
      </Td>

      <Dialog
        open={deactivating}
        onOpenChange={(next) => {
          if (!next && !busy) setDeactivating(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate {member.name}?</DialogTitle>
            <DialogDescription>
              They will not be able to sign in, and any session they have open
              ends at its next request. Nothing they have already done is
              touched — their name stays on every ticket, payment and time entry
              — and you can turn this back on here at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setDeactivating(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => changeActive(false)}
            >
              {busy ? (
                <Loader2 className="animate-spin" />
              ) : (
                <DeactivateIcon aria-hidden />
              )}
              {busy ? "Deactivating…" : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tr>
  );
}

function InviteDialog({
  open,
  onClose,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  onLink: (link: { name: string; url: string }) => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("TECH");
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setName("");
    setEmail("");
    setRole("TECH");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await inviteUserAction({ name, email, role });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    if (result.inviteUrl) {
      // No mail provider is configured, so nothing was actually delivered —
      // hand the owner the link rather than leaving the new hire waiting.
      onLink({ name, url: result.inviteUrl });
    } else {
      toast.success(`Invite sent to ${email}.`);
    }

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
            They&apos;ll get an email with a link to set their own password. It
            works for three days — you never have to handle a password.
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
              {busy ? <Loader2 className="animate-spin" /> : <SendIcon aria-hidden />}
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shown only when no mail provider is configured.
 *
 * The link is the invite: without a provider the email went to the server
 * console and nowhere else, so the owner has to pass it on themselves. It is
 * displayed once, here, and refuses to close on an outside click.
 */
function InviteLinkDialog({
  link,
  onClose,
}: {
  link: { name: string; url: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(link)} onOpenChange={(next) => next || onClose()}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Send {link?.name} this link</DialogTitle>
          <DialogDescription>
            No email provider is set up yet, so nothing was actually delivered.
            Copy this link to {link?.name} — it lets them set their own password
            and works for three days.
          </DialogDescription>
        </DialogHeader>

        {link ? <InviteLinkBody url={link.url} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function InviteLinkBody({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <>
      <code className="select-all break-all rounded-md bg-surface-hover px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground">
        {url}
      </code>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              toast.error("Couldn't copy — select the link and copy it.");
            }
          }}
        >
          <CopyIcon aria-hidden /> {copied ? "Copied" : "Copy link"}
        </Button>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}
