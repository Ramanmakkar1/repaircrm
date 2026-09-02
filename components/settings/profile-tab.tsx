"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import {
  changeOwnPasswordAction,
  confirmTotpAction,
  disableTotpAction,
  disconnectGoogleAction,
  startTotpSetupAction,
  updateProfileNameAction,
} from "@/app/(app)/settings/profile-actions";
import { GoogleButton, GoogleMark } from "@/components/auth/google-button";
import { Avatar, AvatarFallback, AvatarImage, getInitials } from "@/components/ui/avatar";
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
import { formatDateTime } from "@/components/billing/format";
import { SubmitButton } from "@/components/ui/submit-button";
import { IDLE_SETTINGS_STATE, ROLE_LABEL, type SettingsFormState } from "./types";
import type { ProfileValues, TotpSetup } from "./profile-types";

/**
 * Settings → My profile. The one tab every role sees.
 *
 * Three separate forms rather than one big save: a name change, a password
 * change and a 2FA switch have nothing to do with each other, and bundling them
 * would mean typing your password to correct a typo in your name.
 */
export function ProfileTab({ profile }: { profile: ProfileValues }) {
  return (
    <div className="flex flex-col gap-5">
      <DetailsCard profile={profile} />
      <GoogleCard profile={profile} />
      <PasswordCard />
      <TwoFactorCard profile={profile} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared banners
// ---------------------------------------------------------------------------

function Banners({ state }: { state: SettingsFormState }) {
  return (
    <>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state.message ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-md bg-status-resolved-bg px-4 py-3 text-sm font-semibold text-status-resolved-fg"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Name / identity
// ---------------------------------------------------------------------------

function DetailsCard({ profile }: { profile: ProfileValues }) {
  const router = useRouter();
  const [state, formAction] = useActionStateWithRefresh(
    updateProfileNameAction,
    router.refresh,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Banners state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              name="name"
              defaultValue={profile.name}
              maxLength={120}
              required
            />
            <p className="text-[13.5px] text-muted-foreground">
              What colleagues see on tickets, notes and time entries.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" value={profile.email} readOnly disabled />
            <p className="text-[13.5px] text-muted-foreground">
              Your sign-in address. Ask an owner to change it for you.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Role</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {ROLE_LABEL[profile.role] ?? profile.role}
              </Badge>
              {profile.lastLoginAt ? (
                <span className="text-[13.5px] text-muted-foreground">
                  Last sign-in {formatDateTime(profile.lastLoginAt)}
                </span>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sign in with Google
// ---------------------------------------------------------------------------

/**
 * One row: connected or not.
 *
 * Connecting is a link, not a button with an action behind it — the flow ends
 * at Google, so it has to be a GET to /api/auth/google/start. Disconnecting is
 * an ordinary action, and it refuses while the account has no password of its
 * own: someone who signed up with Google and disconnects it has no way back in.
 *
 * The whole card disappears when the server has no Google client credentials.
 */
function GoogleCard({ profile }: { profile: ProfileValues }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  if (!profile.googleAvailable) return null;

  const linked = Boolean(profile.googleEmail);

  async function disconnect() {
    setBusy(true);
    const result = await disconnectGoogleAction();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Google account disconnected.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {profile.googleNotice ? (
          <div
            role={profile.googleNotice.tone === "bad" ? "alert" : "status"}
            className={
              profile.googleNotice.tone === "bad"
                ? "flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
                : "flex items-start gap-2.5 rounded-md bg-status-resolved-bg px-4 py-3 text-sm font-semibold text-status-resolved-fg"
            }
          >
            {profile.googleNotice.tone === "bad" ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{profile.googleNotice.text}</span>
          </div>
        ) : null}

        {linked ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                {profile.avatarUrl ? (
                  <AvatarImage
                    src={profile.avatarUrl}
                    alt={`${profile.name}'s Google picture`}
                  />
                ) : null}
                <AvatarFallback>{getInitials(profile.name)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                  <GoogleMark className="size-4" />
                  {profile.googleEmail}
                </span>
                <span className="text-[13.5px] text-muted-foreground">
                  {profile.googleLinkedAt
                    ? `Connected ${formatDateTime(profile.googleLinkedAt)}`
                    : "Connected"}
                </span>
              </div>
            </div>

            <Button variant="outline" disabled={busy} onClick={disconnect}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-prose text-[14px] leading-relaxed text-muted-foreground">
              Connect a Google account and you can sign in with one tap instead
              of typing your password. Your email and password keep working
              either way.
            </p>
            <GoogleButton
              intent="link"
              label="Connect"
              className="w-auto px-5"
            />
          </div>
        )}

        {linked && !profile.hasPassword ? (
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            You&apos;ve never set a password here, so Google is your only way
            in. To set one, sign out and use &ldquo;Forgot password?&rdquo; —
            after that you can disconnect.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

function PasswordCard() {
  const [state, formAction] = React.useActionState(
    changeOwnPasswordAction,
    IDLE_SETTINGS_STATE,
  );

  // A successful save clears the three boxes; leaving a password sitting in a
  // field after it has been used is exactly what a shoulder-surfer wants.
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state.done) formRef.current?.reset();
  }, [state.done]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <Banners state={state} />

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              className="sm:max-w-sm"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <p className="text-[13.5px] leading-relaxed text-muted-foreground sm:col-span-2">
            At least 8 characters. Changing it signs out every other device
            you&apos;re logged in on — this one stays put.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Two-step verification
// ---------------------------------------------------------------------------

function TwoFactorCard({ profile }: { profile: ProfileValues }) {
  const router = useRouter();
  const [setup, setSetup] = React.useState<TotpSetup | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [disabling, setDisabling] = React.useState(false);
  const [starting, setStarting] = React.useState(false);

  const enabled = Boolean(profile.totpEnabledAt);

  async function start() {
    setStarting(true);
    const result = await startTotpSetupAction();
    setStarting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSetup(result.setup);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Two-step verification</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {enabled ? (
              <Badge className="bg-status-resolved-bg text-status-resolved-fg">
                <ShieldCheck className="size-3.5" /> On
              </Badge>
            ) : (
              <Badge variant="secondary">
                <ShieldOff className="size-3.5" /> Off
              </Badge>
            )}
            <span className="text-[14px] text-muted-foreground">
              {enabled
                ? `Turned on ${formatDateTime(profile.totpEnabledAt)} · ${profile.recoveryCodesLeft} recovery ${profile.recoveryCodesLeft === 1 ? "code" : "codes"} left`
                : "Not set up"}
            </span>
          </div>

          <p className="max-w-prose text-[14px] leading-relaxed text-muted-foreground">
            With this on, signing in asks for a 6-digit code from an
            authenticator app on your phone as well as your password. Someone
            who learns your password still can&apos;t get into the shop.
          </p>

          <div className="flex justify-start">
            {enabled ? (
              <Button variant="outline" onClick={() => setDisabling(true)}>
                Turn off
              </Button>
            ) : (
              <Button onClick={start} disabled={starting}>
                {starting ? "Preparing…" : "Turn on"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <SetupDialog
        setup={setup}
        onClose={() => setSetup(null)}
        onEnabled={(newCodes) => {
          setSetup(null);
          setCodes(newCodes);
          router.refresh();
        }}
      />

      <RecoveryCodesDialog
        codes={codes}
        onClose={() => {
          setCodes(null);
          router.refresh();
        }}
      />

      <DisableDialog
        open={disabling}
        onClose={() => setDisabling(false)}
        onDisabled={() => {
          setDisabling(false);
          router.refresh();
        }}
      />
    </>
  );
}

function SetupDialog({
  setup,
  onClose,
  onEnabled,
}: {
  setup: TotpSetup | null;
  onClose: () => void;
  onEnabled: (codes: string[]) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  return (
    <Dialog
      open={Boolean(setup)}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Scan this with your app</DialogTitle>
          <DialogDescription>
            Use Google Authenticator, 1Password, Authy or any app that scans a
            QR code, then type the 6-digit code it shows.
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while the dialog is open, so the code box starts empty
            every time without an effect reaching in to clear it. */}
        {setup ? (
          <SetupForm
            setup={setup}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
            onEnabled={onEnabled}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SetupForm({
  setup,
  busy,
  setBusy,
  onClose,
  onEnabled,
}: {
  setup: TotpSetup;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onClose: () => void;
  onEnabled: (codes: string[]) => void;
}) {
  const [code, setCode] = React.useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await confirmTotpAction(code);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Two-step verification is on.");
    onEnabled(result.codes);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex justify-center">
        <Image
          src={setup.qrDataUrl}
          alt="QR code for setting up two-step verification"
          width={232}
          height={232}
          unoptimized
          className="rounded-md border border-border"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-foreground">
          Can&apos;t scan? Type this key instead
        </span>
        <div className="flex items-center gap-2">
          <code className="flex-1 select-all break-all rounded-md bg-surface-hover px-3 py-2 font-mono text-[13px] text-foreground">
            {setup.manualKey}
          </code>
          <CopyButton value={setup.manualKey.replace(/\s/g, "")} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="totp-code">6-digit code</Label>
        <Input
          id="totp-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          autoFocus
          className="font-mono tracking-[0.3em]"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || code.length < 6}>
          {busy ? "Checking…" : "Turn on"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The codes exist in plaintext exactly once, right here. The dialog says so and
 * refuses to close on an outside click, because a stray tap that loses them is
 * a support call at the worst possible moment.
 */
function RecoveryCodesDialog({
  codes,
  onClose,
}: {
  codes: string[] | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(codes)} onOpenChange={(next) => next || onClose()}>
      <DialogContent
        className="max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Save your recovery codes</DialogTitle>
          <DialogDescription>
            Each one signs you in once if you lose your phone. This is the only
            time they are shown — print them or put them in a password manager.
          </DialogDescription>
        </DialogHeader>

        {codes ? <RecoveryCodesBody codes={codes} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RecoveryCodesBody({
  codes,
  onClose,
}: {
  codes: string[];
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = React.useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-hover p-3">
        {codes.map((code) => (
          <code
            key={code}
            className="select-all text-center font-mono text-[14px] tracking-wide text-foreground"
          >
            {code}
          </code>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <CopyButton value={codes.join("\n")} label="Copy all codes" />
      </div>

      <label className="flex items-start gap-2.5 text-[14px] leading-snug text-foreground">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-0.5 size-4 rounded border-border-strong accent-[var(--accent)]"
        />
        I&apos;ve saved these somewhere safe.
      </label>

      <DialogFooter>
        <Button disabled={!acknowledged} onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

function DisableDialog({
  open,
  onClose,
  onDisabled,
}: {
  open: boolean;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

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
          <DialogTitle>Turn off two-step verification</DialogTitle>
          <DialogDescription>
            Signing in will only need your password again. Confirm it to
            continue — your recovery codes are deleted too.
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open, so the password box is never left holding a
            value between visits. */}
        {open ? (
          <DisableForm
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
            onDisabled={onDisabled}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DisableForm({
  busy,
  setBusy,
  onClose,
  onDisabled,
}: {
  busy: boolean;
  setBusy: (value: boolean) => void;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [password, setPassword] = React.useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await disableTotpAction(password);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Two-step verification is off.");
    onDisabled();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="disable-password">Current password</Label>
        <Input
          id="disable-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={busy || password.length === 0}
        >
          {busy ? "Turning off…" : "Turn off"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error("Couldn't copy — select the text and copy it manually.");
        }
      }}
    >
      <Copy /> {copied ? "Copied" : (label ?? "Copy")}
    </Button>
  );
}

/**
 * `useActionState` plus a `router.refresh()` once the action reports success,
 * so the server-rendered values above the form catch up with what was saved.
 */
function useActionStateWithRefresh(
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>,
  refresh: () => void,
) {
  const [state, formAction] = React.useActionState(action, IDLE_SETTINGS_STATE);
  const done = state.done;
  React.useEffect(() => {
    if (done) refresh();
  }, [done, refresh]);
  return [state, formAction] as const;
}
