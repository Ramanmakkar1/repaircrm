"use client";
import { useActionState } from "react";
import { saveStaffPinAction } from "@/app/(app)/staff-switch/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
export function StaffPin() {
 const [state, action, pending] = useActionState(saveStaffPinAction, {});
 return <Card><CardHeader title="Your counter PIN" description="Switch staff on a signed-in shared tablet. Six digits; a switch lasts eight hours. Accounts with two-step sign-in use full sign-in." /><CardContent><form action={action} className="flex flex-col gap-4">{state.error ? <p role="alert" className="text-destructive">{state.error}</p> : null}{state.message ? <p role="status">{state.message}</p> : null}<Label htmlFor="pin-password">Current password</Label><Input id="pin-password" name="password" type="password" autoComplete="current-password" required /><Label htmlFor="new-pin">New PIN</Label><Input id="new-pin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" /><Label htmlFor="confirm-pin">Confirm PIN</Label><Input id="confirm-pin" name="confirm" type="password" inputMode="numeric" maxLength={6} autoComplete="off" /><div className="flex flex-wrap gap-3"><SubmitButton className="min-h-12">Save PIN</SubmitButton><Button type="submit" variant="outline" name="remove" value="yes" disabled={pending} className="min-h-12">Remove PIN</Button></div></form></CardContent></Card>;
}
