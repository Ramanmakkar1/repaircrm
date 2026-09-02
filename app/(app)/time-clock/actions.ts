"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * The time clock's four writes.
 *
 * Every one re-derives `shopId` (and the acting role) from the session and
 * scopes the row to it, per the tenancy contract in lib/db.ts. Clocking is
 * always for YOURSELF — `userId` comes from the session and is never read off
 * the form, so nobody can clock a colleague in.
 *
 * ROLE RULES
 *   Clock in / clock out    everyone
 *   Edit / delete an entry  OWNER only — this is payroll
 */

export type ClockResult = { ok: true } | { ok: false; error: string };

const MAX_NOTE = 200;

function revalidateClock(): void {
  revalidatePath("/time-clock");
}

// ---------------------------------------------------------------------------
// Clock in / out
// ---------------------------------------------------------------------------

/**
 * Starts a shift.
 *
 * Refuses when one is already running rather than opening a second: two open
 * entries would double-count every hour between them, and the fix afterwards is
 * a conversation about payroll rather than a click.
 */
export async function clockInAction(): Promise<ClockResult> {
  const { shopId, userId } = await requireUser();

  const open = await db.timeClockEntry.findFirst({
    where: { shopId, userId, clockOutAt: null },
    select: { id: true },
  });
  if (open) return { ok: false, error: "You're already clocked in." };

  await db.timeClockEntry.create({
    data: { shopId, userId },
  });

  revalidateClock();
  return { ok: true };
}

export async function clockOutAction(): Promise<ClockResult> {
  const { shopId, userId } = await requireUser();

  const open = await db.timeClockEntry.findFirst({
    where: { shopId, userId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
    select: { id: true },
  });
  if (!open) return { ok: false, error: "You're not clocked in." };

  await db.timeClockEntry.update({
    where: { id: open.id },
    data: { clockOutAt: new Date() },
  });

  revalidateClock();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Owner corrections
// ---------------------------------------------------------------------------

/**
 * Fixes an entry somebody forgot to close, or clocked in late.
 *
 * `clockOut` may be cleared (an empty string) to put a shift back to running —
 * useful when a manager closed the wrong one. The pair is validated: an out
 * before an in would produce negative hours on the timesheet.
 */
export async function updateTimeClockEntryAction(
  entryId: string,
  input: { clockIn: string; clockOut: string; note: string },
): Promise<ClockResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") return { ok: false, error: "Only an owner can edit the timesheet." };

  const clockInAt = parseLocal(input.clockIn);
  if (!clockInAt) return { ok: false, error: "Give the entry a valid start time." };

  const trimmedOut = input.clockOut.trim();
  const clockOutAt = trimmedOut === "" ? null : parseLocal(trimmedOut);
  if (trimmedOut !== "" && !clockOutAt) {
    return { ok: false, error: "That end time isn't a valid date and time." };
  }
  if (clockOutAt && clockOutAt.getTime() <= clockInAt.getTime()) {
    return { ok: false, error: "The end time has to be after the start time." };
  }

  // updateMany doubles as the ownership check: a foreign id matches 0 rows.
  const { count } = await db.timeClockEntry.updateMany({
    where: { id: entryId, shopId },
    data: {
      clockInAt,
      clockOutAt,
      note: input.note.trim().slice(0, MAX_NOTE) || null,
    },
  });
  if (count === 0) return { ok: false, error: "That entry no longer exists." };

  revalidateClock();
  return { ok: true };
}

export async function deleteTimeClockEntryAction(
  entryId: string,
): Promise<ClockResult> {
  const { shopId, role } = await requireUser();
  if (role !== "OWNER") {
    return { ok: false, error: "Only an owner can delete a timesheet entry." };
  }

  // Prisma treats `id: undefined` as "no filter" — this guard is what stops a
  // malformed call wiping the shop's whole timesheet.
  if (!entryId) return { ok: false, error: "That entry no longer exists." };

  const { count } = await db.timeClockEntry.deleteMany({
    where: { id: entryId, shopId },
  });
  if (count === 0) return { ok: false, error: "That entry no longer exists." };

  revalidateClock();
  return { ok: true };
}

/**
 * Reads a `<input type="datetime-local">` value as LOCAL time.
 *
 * `new Date("2026-09-01T09:00")` is implementation-defined for a bare local
 * datetime; splitting the parts and using the multi-arg constructor pins it to
 * the shop's own clock — the same reasoning as `optionalDate` in the ticket
 * actions.
 */
function parseLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
