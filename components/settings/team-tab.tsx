"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  inviteUserAction,
  resendInviteAction,
  resetUserTotpAction,
  setUserActiveAction,
  updateUserRoleAction,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { InitialsVisual } from "@/components/ui/record-card";
import { Switch } from "./settings-switch";
import { Table, TBody, THead, Td, Th, Tr } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { GoogleMark } from "@/components/auth/google-button";
import { shopDateTime } from "./shop-time";
import { useShopZone } from "./shop-zone";
import { ROLE_BLURB, ROLE_LABEL, ROLE_OPTIONS, type TeamMember } from "./types";

/**
 * Who can sign in, and as what.
 *
 * There is no delete: a departed technician's name is on repairs, payments and
 * time entries, and a shop's history should not develop holes. Switching
 * someone off closes the door (`login()` refuses an inactive account) while
 * leaving the record intact.
 *
 * Easy mode: one card per person (initials, name, role and "Can sign in" in
 * words) and one Manage button that opens everything else for that person.
 * Full mode keeps the table.
 */
const AddIcon = ACTIONS.add;
const SendIcon = ACTIONS.send;
const DeactivateIcon = ACTIONS.void;
const CopyIcon = ACTIONS.copy;

const SIGN_IN_WORDS = ["Can sign in", "Switched off"] as const;

type InviteLink = { name: string; url: string };

export function TeamTab({
  members,
  currentUserId,
  simple = false,
}: {
  members: TeamMember[];
  currentUserId: string;
  simple?: boolean;
}) {
  const [inviting, setInviting] = React.useState(false);
  // Only ever set when the email driver is "log" — see inviteUserAction.
  const [inviteLink, setInviteLink] = React.useState<InviteLink | null>(null);
  const [managing, setManaging] = React.useState<string | null>(null);
  const managed = members.find((member) => member.id === managing) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className={cn("flex", simple ? "justify-start" : "justify-end")}>
        <Button onClick={() => setInviting(true)} className={simple ? "h-12 px-5 text-base" : undefined}>
          <AddIcon aria-hidden /> {simple ? "Add someone" : "Add team member"}
        </Button>
      </div>

      {simple ? (
        <ul aria-label="Your team" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {members.map((member) => (
            <PersonCard
              key={member.id}
              member={member}
              isSelf={member.id === currentUserId}
              onManage={() => setManaging(member.id)}
            />
          ))}
        </ul>
      ) : (
        <Card>
          <CardHeader
            title="Team"
            description="Everyone who can sign in. Set their role, or switch them off."
          />
          <CardContent className="px-0 py-0">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Email</Th>
                    <Th className="w-[190px]">Role</Th>
                    <Th className="w-[170px] text-right">Sign-in</Th>
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
      )}

      <Card>
        <CardHeader
          title="What each role can do"
          description="What owners, front desk and technicians can open."
        />
        <CardContent className="flex flex-col gap-3">
          {ROLE_OPTIONS.map((role) => (
            <div key={role.value} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
              <span className="w-28 shrink-0 text-[15px] font-bold text-foreground">
                {role.label}
              </span>
              <span className="text-[15px] leading-relaxed text-muted-foreground">
                {ROLE_BLURB[role.value]}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {managed ? (
        <ManageSheet
          key={managed.id}
          member={managed}
          isSelf={managed.id === currentUserId}
          onLink={setInviteLink}
          onClose={() => setManaging(null)}
        />
      ) : null}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onLink={setInviteLink}
      />

      <InviteLinkDialog link={inviteLink} onClose={() => setInviteLink(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The changes one person's row or card can make
// ---------------------------------------------------------------------------

function useMember(member: TeamMember, onLink: (link: InviteLink) => void) {
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
    if (next === role) return;
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
    toast.success(`Saved. ${member.name} is now ${(ROLE_LABEL[next] ?? next).toLowerCase()}.`);
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
      toast.success(`Invite sent again to ${member.email}.`);
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
    toast.success(`Two-step sign-in cleared for ${member.name}.`);
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
        : `${member.name} is switched off and can no longer sign in.`,
    );
    router.refresh();
  }

  return {
    role,
    active,
    busy,
    pending,
    deactivating,
    setDeactivating,
    changeRole,
    resendInvite,
    resetTotp,
    changeActive,
  };
}

type MemberControls = ReturnType<typeof useMember>;

/** Reactivating is harmless; switching someone off locks them out mid-shift, so that asks first. */
function DeactivateDialog({ member, controls }: { member: TeamMember; controls: MemberControls }) {
  const { deactivating, setDeactivating, busy, changeActive } = controls;
  return (
    <Dialog
      open={deactivating}
      onOpenChange={(next) => {
        if (!next && !busy) setDeactivating(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Switch {member.name} off?</DialogTitle>
          <DialogDescription>
            They will not be able to sign in, and any screen they have open
            stops working at its next tap. Nothing they have already done is
            touched — their name stays on every repair, payment and time entry
            — and you can switch them back on here at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            className="h-12"
            disabled={busy}
            onClick={() => setDeactivating(false)}
          >
            Keep them on
          </Button>
          <Button
            variant="destructive"
            className="h-12"
            disabled={busy}
            onClick={() => changeActive(false)}
          >
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <DeactivateIcon aria-hidden />
            )}
            {busy ? "Switching off…" : "Switch off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function signInWord(member: TeamMember, active: boolean): { label: string; tone: "success" | "neutral" | "waiting" } {
  if (!active) return { label: "Switched off", tone: "neutral" };
  if (!member.lastLoginAt) return { label: "Invite not used yet", tone: "waiting" };
  return { label: "Can sign in", tone: "success" };
}

// ---------------------------------------------------------------------------
// Easy mode: a card per person, one Manage button
// ---------------------------------------------------------------------------

function PersonCard({
  member,
  isSelf,
  onManage,
}: {
  member: TeamMember;
  isSelf: boolean;
  onManage: () => void;
}) {
  const word = signInWord(member, member.active);
  return (
    <li className="flex min-h-28 items-center gap-4 rounded-2xl border border-border bg-surface p-4">
      <InitialsVisual name={member.name} className={cn("size-16 text-xl sm:size-16 sm:text-xl", !member.active && "opacity-60")} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-lg font-semibold leading-tight text-foreground">{member.name}</span>
          {isSelf ? (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-accent-soft-foreground">
              You
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[13px]">{ROLE_LABEL[member.role] ?? member.role}</Badge>
          <StatusPill tone={word.tone} label={word.label} className="text-[13px]" />
          {member.twoFactorOn ? <StatusPill tone="success" dot={false} label="Two-step on" className="text-[13px]" /> : null}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-12 shrink-0 px-4 text-[15px]"
        onClick={onManage}
        aria-label={`Manage ${member.name}`}
      >
        Manage
      </Button>
    </li>
  );
}

function ManageSheet({
  member,
  isSelf,
  onLink,
  onClose,
}: {
  member: TeamMember;
  isSelf: boolean;
  onLink: (link: InviteLink) => void;
  onClose: () => void;
}) {
  const controls = useMember(member, onLink);
  const { role, active, busy, pending } = controls;
  const zone = useShopZone();

  return (
    <>
      <Dialog open onOpenChange={(next) => (!next ? onClose() : undefined)}>
        <DialogContent className="flex max-h-[min(92dvh,48rem)] flex-col gap-5 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">{member.name}</DialogTitle>
            <DialogDescription className="text-[15px]">
              {member.email}
              {member.lastLoginAt ? ` · Last signed in ${shopDateTime(member.lastLoginAt, zone)}` : " · Has not signed in yet"}
            </DialogDescription>
          </DialogHeader>

          {isSelf ? (
            <p className="rounded-xl bg-surface-hover px-4 py-3 text-[15px] text-muted-foreground">
              This is you. You can&rsquo;t switch yourself off, and the shop always keeps at least one owner.
            </p>
          ) : null}

          <section aria-labelledby="manage-role" className="flex flex-col gap-2.5">
            <h3 id="manage-role" className="text-base font-semibold">What they can do</h3>
            <div role="radiogroup" aria-labelledby="manage-role" className="grid gap-2">
              {ROLE_OPTIONS.map((option) => {
                const chosen = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    disabled={busy}
                    onClick={() => controls.changeRole(option.value)}
                    className={cn(
                      "flex min-h-14 items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                      chosen ? "border-accent ring-1 ring-accent" : "border-border hover:border-ring",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                        chosen ? "border-accent bg-accent text-accent-foreground" : "border-border-strong",
                      )}
                    >
                      {chosen ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-base font-semibold">{option.label}</span>
                      <span className="text-[14px] leading-snug text-muted-foreground">{ROLE_BLURB[option.value]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-muted-foreground">A tap saves it straight away.</p>
          </section>

          <section aria-labelledby="manage-signin" className="flex flex-col gap-2.5 border-t border-border pt-4">
            <h3 id="manage-signin" className="text-base font-semibold">Sign-in</h3>
            {isSelf ? (
              <p className="text-[15px] font-semibold">Can sign in</p>
            ) : (
              <label className="flex min-h-12 items-center justify-between gap-4">
                <span className="text-[15px] text-muted-foreground">
                  Switch them off when they leave. Their name stays on their work.
                </span>
                <Switch
                  checked={active}
                  disabled={busy}
                  words={SIGN_IN_WORDS}
                  onCheckedChange={(next) =>
                    next ? controls.changeActive(true) : controls.setDeactivating(true)
                  }
                  aria-label={`${member.name} can sign in`}
                />
              </label>
            )}
            {!member.lastLoginAt && !isSelf ? (
              <Button
                variant="outline"
                className="h-12 self-start"
                disabled={busy || !active}
                onClick={controls.resendInvite}
              >
                {pending === "invite" ? <Loader2 className="animate-spin" /> : <SendIcon aria-hidden />}
                {pending === "invite" ? "Sending…" : "Send the invite again"}
              </Button>
            ) : null}
            {member.twoFactorOn && !isSelf ? (
              <div className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  className="h-12 self-start"
                  disabled={busy}
                  onClick={controls.resetTotp}
                >
                  {pending === "totp" ? <Loader2 className="animate-spin" /> : null}
                  {pending === "totp" ? "Clearing…" : "Clear two-step sign-in"}
                </Button>
                <p className="text-[13px] text-muted-foreground">For a lost phone: they set it up again next time they sign in.</p>
              </div>
            ) : null}
          </section>

          <DialogFooter>
            <Button className="h-12 px-6 text-base" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeactivateDialog member={member} controls={controls} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Full mode: the table row
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  isSelf,
  onLink,
}: {
  member: TeamMember;
  isSelf: boolean;
  onLink: (link: InviteLink) => void;
}) {
  const controls = useMember(member, onLink);
  const { role, active, busy, pending } = controls;
  const zone = useShopZone();
  const nothingToDo = !(!member.lastLoginAt && !isSelf) && !member.twoFactorOn;

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
              <StatusPill size="sm" dot={false} tone="neutral" label="Switched off" />
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
          <span className="text-[14px] text-muted-foreground">
            {member.lastLoginAt
              ? `Last sign-in ${shopDateTime(member.lastLoginAt, zone)}`
              : "Never signed in"}
          </span>
        </div>
      </Td>
      <Td className="text-muted-foreground">{member.email}</Td>
      <Td>
        <Select value={role} onValueChange={controls.changeRole} disabled={busy}>
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
          {/* Never offered for yourself: a locked switch reads as "off". */}
          {isSelf ? (
            <span className="text-[14px] font-semibold text-foreground">Can sign in</span>
          ) : (
            <Switch
              checked={active}
              disabled={busy}
              words={SIGN_IN_WORDS}
              onCheckedChange={(next) =>
                next ? controls.changeActive(true) : controls.setDeactivating(true)
              }
              aria-label={`${member.name} can sign in`}
            />
          )}
        </div>
      </Td>
      <Td className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          {!member.lastLoginAt && !isSelf ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !active}
              onClick={controls.resendInvite}
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
              onClick={controls.resetTotp}
            >
              {pending === "totp" ? <Loader2 className="animate-spin" /> : null}
              {pending === "totp" ? "Clearing…" : "Reset 2FA"}
            </Button>
          ) : null}
          {nothingToDo ? (
            <span className="text-[14px] text-muted-foreground">Nothing to do</span>
          ) : null}
        </div>
      </Td>

      <DeactivateDialog member={member} controls={controls} />
    </Tr>
  );
}

// ---------------------------------------------------------------------------
// Adding someone
// ---------------------------------------------------------------------------

function InviteDialog({
  open,
  onClose,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  onLink: (link: InviteLink) => void;
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
          <DialogTitle>Add someone to your team</DialogTitle>
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
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              {ROLE_BLURB[role]}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              disabled={busy}
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-12" disabled={busy}>
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
 * The link is the invite: without a provider the email went nowhere, so the
 * owner has to pass it on themselves. It is displayed once, here, and refuses
 * to close on an outside click.
 */
function InviteLinkDialog({
  link,
  onClose,
}: {
  link: InviteLink | null;
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
            Emails are not set up yet, so nothing was actually delivered.
            Copy this link and send it to {link?.name} — it lets them set their
            own password and works for three days.
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
      <p className="select-all break-all rounded-md bg-surface-hover px-3.5 py-3 text-[14px] leading-relaxed text-foreground">
        {url}
      </p>

      <DialogFooter>
        <Button
          variant="outline"
          className="h-12"
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
        <Button className="h-12" onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}
