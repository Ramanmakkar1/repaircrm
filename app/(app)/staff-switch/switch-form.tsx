"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { switchStaffAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
export function StaffSwitch({staff}: {staff: {id: string; name: string}[]}) {
 const [id, setId] = useState(""); const [state, action] = useActionState(switchStaffAction, {});
 return <section className="mx-auto flex max-w-xl flex-col gap-5"><h1 className="text-3xl font-bold">Who’s at the counter?</h1><p>Choose your name, then enter your PIN.</p><form action={action} className="flex flex-col gap-5"><input type="hidden" name="userId" value={id} /><div role="group" aria-label="Staff" className="grid grid-cols-2 gap-3">{staff.map(s => <button key={s.id} type="button" aria-pressed={id === s.id} onClick={() => setId(s.id)} className={`min-h-24 rounded-xl border p-4 font-semibold ${id === s.id ? "bg-accent text-accent-foreground" : "bg-surface"}`}>{s.name}</button>)}</div>{staff.length ? <><Label htmlFor="switch-pin">Six-digit PIN</Label><Input key={id} id="switch-pin" name="pin" type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" autoComplete="off" required /><SubmitButton disabled={!id} className="min-h-12">Switch staff</SubmitButton></> : <p>No PINs set yet. Each person can set theirs in Your profile.</p>}{state.error ? <p role="alert" className="text-destructive">{state.error}</p> : null}</form><Link href="/settings?tab=profile" className="flex min-h-12 items-center underline">Set your PIN</Link><Link href="/" className="flex min-h-12 items-center underline">Back to work</Link><form action="/logout" method="post"><button className="min-h-12 underline">Use full sign-in instead</button></form></section>;
}
