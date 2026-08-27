"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { runAllJobs } from "@/lib/jobs";
import type { JobsSummary } from "@/lib/jobs/types";

/**
 * The "Run all jobs now" button behind Settings → Automation.
 *
 * Kept in its own file rather than added to settings/actions.ts so the
 * automation feature is one self-contained unit — and so the runner is not
 * imported by every settings mutation.
 *
 * OWNER ONLY. Running the jobs generates invoices and sends customer email;
 * that is an owner's decision, not a technician's. The role is re-derived from
 * the session here because the hidden-tab check in the client shell is
 * politeness, not enforcement.
 */

export type RunJobsResult =
  | { ok: true; summary: JobsSummary }
  | { ok: false; error: string };

export async function runJobsNowAction(): Promise<RunJobsResult> {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { ok: false, error: "Only an owner can run the automation jobs." };
  }

  // runAllJobs never throws — a failure comes back inside summary.errors, so
  // the button always has something to render.
  const summary = await runAllJobs("manual");

  // A run can mint invoices and move campaign rows; refresh the screens that
  // show them, plus this one for the freshly written "last run" stamp.
  revalidatePath("/invoices");
  revalidatePath("/invoices/recurring");
  revalidatePath("/marketing");
  revalidatePath("/settings");

  return { ok: true, summary };
}
