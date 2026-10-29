"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { keepShopWithPasswordAction, keepShopWithTokenAction } from "./actions";

/**
 * The two public "Keep my shop" forms. Plain elements styled like the legal
 * pages (this route sits outside the app shell), 48px targets throughout.
 */

const INPUT =
  "h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-base text-foreground shadow-xs outline-none focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-ring/20";
const PRIMARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2";

type Result = { ok: true; shopName: string } | { ok: false; error: string };

function Done({ shopName }: { shopName: string }) {
  return (
    <div role="status" className="rounded-xl border border-border bg-surface p-5 text-foreground">
      <p className="text-lg font-semibold">{shopName} will not be deleted.</p>
      <p className="mt-2 text-muted-foreground">Everyone&rsquo;s logins are back on. You can sign in now.</p>
      <Link href="/login" className={`${PRIMARY} mt-4 no-underline! text-accent-foreground!`}>
        Sign in
      </Link>
    </div>
  );
}

export function KeepShopWithLink({ token, shopName, dateLabel }: { token: string; shopName: string; dateLabel: string }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  if (result?.ok) return <Done shopName={result.shopName} />;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 text-foreground">
      <p className="text-lg font-semibold">Keep {shopName}?</p>
      <p className="mt-2 text-muted-foreground">
        It is scheduled to be deleted on {dateLabel}. Keeping it switches everyone&rsquo;s logins back on.
      </p>
      {result && !result.ok ? (
        <p role="alert" className="mt-3 font-medium">{result.error}</p>
      ) : null}
      <button
        type="button"
        className={`${PRIMARY} mt-4`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const next = await keepShopWithTokenAction(token).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
          setResult(next);
          setBusy(false);
        }}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Keep my shop
      </button>
    </div>
  );
}

export function KeepShopWithPassword() {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const [values, setValues] = React.useState({ email: "", password: "", totp: "" });

  if (result?.ok) return <Done shopName={result.shopName} />;

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 text-foreground"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const next = await keepShopWithPasswordAction(values).catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
        setResult(next);
        setBusy(false);
      }}
    >
      <label className="flex flex-col gap-2 font-medium">
        Owner email
        <input
          className={INPUT}
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-2 font-medium">
        Password
        <input
          className={INPUT}
          type="password"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-2 font-medium">
        <span>
          Authenticator code <span className="font-normal text-muted-foreground">(only if you use two-step sign-in)</span>
        </span>
        <input
          className={INPUT}
          inputMode="text"
          autoComplete="one-time-code"
          value={values.totp}
          onChange={(e) => setValues((v) => ({ ...v, totp: e.target.value }))}
        />
      </label>
      {result && !result.ok ? (
        <p role="alert" className="font-medium">{result.error}</p>
      ) : null}
      <button type="submit" className={`${PRIMARY} w-full sm:w-fit`} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Keep my shop
      </button>
    </form>
  );
}
