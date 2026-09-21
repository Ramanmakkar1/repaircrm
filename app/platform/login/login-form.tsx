"use client";

import { useActionState } from "react";

import { platformLoginAction, type PlatformLoginState } from "../actions";

const field =
  "h-11 w-full rounded-md border border-white/15 bg-white/5 px-3.5 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-white/40 focus:ring-2 focus:ring-white/20";

export function PlatformLoginForm() {
  const [state, action, pending] = useActionState<PlatformLoginState, FormData>(platformLoginAction, {});
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-red-500/15 px-3 py-2 text-[13.5px] text-red-200">
          {state.error}
        </p>
      ) : null}
      <label className="flex flex-col gap-1.5 text-[13.5px] font-medium text-white/80">
        Email
        <input name="email" type="email" autoComplete="username" required className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13.5px] font-medium text-white/80">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mt-1 h-11 rounded-md bg-white text-[15px] font-bold text-[#0f1115] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
