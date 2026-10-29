"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { prefersFinePointer } from "@/components/ui/auto-focus";
import { shopNameMatches, type DeletionResult } from "@/lib/account-deletion/config";
import { deleteMyLoginAction, requestShopDeletionAction, sendDeletionCodeAction } from "./actions";

/** What this login has to prove (password, or an emailed code; plus 2FA when on). */
type Needs = { password: boolean; emailCode: boolean; totp: boolean };

type Proof = { password: string; emailChallenge: string; emailCode: string; totp: string };
const EMPTY: Proof = { password: "", emailChallenge: "", emailCode: "", totp: "" };

const FIELD = "h-12 text-base";
const BIG = "h-12 min-h-12 px-5 text-[15px]";

function proofReady(needs: Needs, proof: Proof): boolean {
  if (needs.password && !proof.password) return false;
  if (needs.emailCode && (!proof.emailChallenge || proof.emailCode.replace(/\D/g, "").length !== 6)) return false;
  if (needs.totp && !proof.totp.trim()) return false;
  return true;
}

/** The "it's really you" fields, shared by both dialogs. */
function ProofFields({
  idPrefix,
  needs,
  email,
  proof,
  setProof,
}: {
  idPrefix: string;
  needs: Needs;
  email: string;
  proof: Proof;
  setProof: React.Dispatch<React.SetStateAction<Proof>>;
}) {
  const [sending, setSending] = React.useState(false);
  const [codeNote, setCodeNote] = React.useState<string | null>(null);

  async function sendCode() {
    setSending(true);
    setCodeNote(null);
    const result = await sendDeletionCodeAction().catch(() => ({ ok: false as const, error: "Couldn't send a code. Try again." }));
    setSending(false);
    if (result.ok) {
      setProof((p) => ({ ...p, emailChallenge: result.challenge, emailCode: "" }));
      setCodeNote(`If ${email} can receive email, a 6-digit code is on its way. It works for 10 minutes.`);
    } else {
      setCodeNote(result.error);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {needs.password ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-password`} className="text-[15px]">Your password</Label>
          <Input
            id={`${idPrefix}-password`}
            type="password"
            autoComplete="current-password"
            enterKeyHint="done"
            className={FIELD}
            value={proof.password}
            onChange={(e) => setProof((p) => ({ ...p, password: e.target.value }))}
          />
        </div>
      ) : null}

      {needs.emailCode ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14.5px] text-muted-foreground">
            You sign in with Google, so we&rsquo;ll email a code to {email} to check it&rsquo;s you.
          </p>
          <Button type="button" variant="outline" className={`${BIG} w-fit`} onClick={sendCode} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {proof.emailChallenge ? "Send a new code" : "Email me a code"}
          </Button>
          {codeNote ? <p className="text-[14px] text-muted-foreground" aria-live="polite">{codeNote}</p> : null}
          {proof.emailChallenge ? (
            <>
              <Label htmlFor={`${idPrefix}-email-code`} className="text-[15px]">Code from the email</Label>
              <Input
                id={`${idPrefix}-email-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="done"
                maxLength={8}
                className={FIELD}
                value={proof.emailCode}
                onChange={(e) => setProof((p) => ({ ...p, emailCode: e.target.value }))}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {needs.totp ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-totp`} className="text-[15px]">Code from your authenticator app</Label>
          <Input
            id={`${idPrefix}-totp`}
            inputMode="text"
            autoComplete="one-time-code"
            enterKeyHint="done"
            placeholder="123456 or a recovery code"
            className={FIELD}
            value={proof.totp}
            onChange={(e) => setProof((p) => ({ ...p, totp: e.target.value }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function useSubmit(action: (input: unknown) => Promise<DeletionResult>) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(input: Record<string, string>) {
    setBusy(true);
    setError(null);
    let result: DeletionResult;
    try {
      result = await action(input);
    } catch {
      result = { ok: false, error: "Something went wrong. Nothing was deleted. Try again." };
    }
    if (result.ok) {
      // A full load: the session cookie is gone, so the app shell must not linger.
      window.location.replace(result.redirectTo ?? "/login");
      return;
    }
    setBusy(false);
    setError(result.error);
  }

  return { busy, error, setError, submit };
}

export function DeleteLoginButton({ needs, email }: { needs: Needs; email: string }) {
  const [open, setOpen] = React.useState(false);
  const [proof, setProof] = React.useState<Proof>(EMPTY);
  const { busy, error, setError, submit } = useSubmit(deleteMyLoginAction);

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) {
      setProof(EMPTY);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button type="button" variant="outline" className={`${BIG} w-full sm:w-fit`} onClick={() => setOpen(true)}>
        Delete my login
      </Button>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto"
        // No keyboard popping over the explanation on a phone (touch style guide).
        onOpenAutoFocus={(e) => {
          if (!prefersFinePointer()) e.preventDefault();
        }}
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (proofReady(needs, proof)) void submit(proof);
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete your login?</DialogTitle>
            <DialogDescription>
              You&rsquo;ll be signed out everywhere and won&rsquo;t be able to sign in again with {email}. Your work stays
              with the shop as &ldquo;Deleted user&rdquo;. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>

          <ProofFields idPrefix="login" needs={needs} email={email} proof={proof} setProof={setProof} />

          {error ? (
            <p role="alert" className="rounded-md border border-border bg-surface-hover/60 px-3 py-2.5 text-[14.5px] font-medium text-foreground">
              {error}
            </p>
          ) : null}

          <DialogFooter className="flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" className={`${BIG} w-full sm:w-auto`} onClick={() => onOpenChange(false)} disabled={busy}>
              Keep my login
            </Button>
            <Button type="submit" variant="destructive" className={`${BIG} w-full sm:w-auto`} disabled={busy || !proofReady(needs, proof)}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Delete my login
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteShopButton({
  needs,
  email,
  shopName,
  windowLabel,
}: {
  needs: Needs;
  email: string;
  shopName: string;
  windowLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [proof, setProof] = React.useState<Proof>(EMPTY);
  const { busy, error, setError, submit } = useSubmit(requestShopDeletionAction);
  const nameOk = shopNameMatches(typed, shopName);
  const ready = nameOk && proofReady(needs, proof);

  function onOpenChange(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) {
      setTyped("");
      setProof(EMPTY);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button type="button" variant="outline" className={`${BIG} w-full sm:w-fit`} onClick={() => setOpen(true)}>
        Delete this shop
      </Button>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto"
        // No keyboard popping over the explanation on a phone (touch style guide).
        onOpenAutoFocus={(e) => {
          if (!prefersFinePointer()) e.preventDefault();
        }}
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void submit({ ...proof, shopName: typed });
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete {shopName}?</DialogTitle>
            <DialogDescription>
              Everyone will be signed out now and no one can sign in. In {windowLabel} all of the shop&rsquo;s data is
              permanently deleted. Until then you can cancel from the email we send you, or at
              repairshelper.com/delete-account.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="shop-name-confirm" className="text-[15px]">
              Type <span className="font-semibold">{shopName}</span> to confirm
            </Label>
            <Input
              id="shop-name-confirm"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="next"
              className={FIELD}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>

          <ProofFields idPrefix="shop" needs={needs} email={email} proof={proof} setProof={setProof} />

          {error ? (
            <p role="alert" className="rounded-md border border-border bg-surface-hover/60 px-3 py-2.5 text-[14.5px] font-medium text-foreground">
              {error}
            </p>
          ) : null}

          <DialogFooter className="flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="outline" className={`${BIG} w-full sm:w-auto`} onClick={() => onOpenChange(false)} disabled={busy}>
              Keep my shop
            </Button>
            <Button type="submit" variant="destructive" className={`${BIG} w-full sm:w-auto`} disabled={busy || !ready}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Delete shop
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
