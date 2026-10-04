"use client";
import Link from "next/link";
import type { CustomerFormState } from "@/app/(app)/customers/actions";
export function DuplicateWarning({state}: {state: CustomerFormState}) {
  if (!state?.duplicates?.length) return null;
  return <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-surface p-4"><p className="font-semibold">Someone already has this number</p>{state.duplicates.map(c => <Link key={c.id} href={`/customers/${c.id}`} className="flex min-h-12 items-center font-semibold underline">Open {c.firstName} {c.lastName}</Link>)}<label className="flex min-h-12 items-center gap-3"><input type="checkbox" name="confirmDuplicate" value={state.duplicateCheck} className="size-5" />Create a separate customer anyway</label></div>;
}
