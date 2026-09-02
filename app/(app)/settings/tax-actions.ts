"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseBps } from "@/lib/money";
import type { SettingsResult } from "@/components/settings/types";

/**
 * Named sales-tax rates.
 *
 * ---------------------------------------------------------------------------
 * WHY `Shop.taxRateBps` STILL EXISTS
 * ---------------------------------------------------------------------------
 * Every screen written before this card — the POS, the ticket charge totals,
 * the API, the recurring job — reads `Shop.taxRateBps`. Rather than rewrite all
 * of them, the starred rate is mirrored back into that column on every save, so
 * "the shop's tax rate" keeps meaning exactly what it always meant and the
 * named rates are a refinement on top rather than a replacement underneath.
 *
 * ---------------------------------------------------------------------------
 * SEEDING
 * ---------------------------------------------------------------------------
 * A shop that has never opened this card has a rate but no rows. The first save
 * therefore creates a "Default" row carrying whatever `taxRateBps` already said,
 * so the number the shop has been charging for months is never quietly lost
 * behind a newly-added one.
 *
 * OWNER only, like every other money default. `requireUser` + an explicit role
 * check rather than `requireRole`, because a redirect inside an action the
 * client is awaiting surfaces as an opaque failure.
 */

const MAX_RATES = 20;

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can change tax rates." };
  }
  return { session, denied: null as string | null };
}

/**
 * Mirrors the starred rate into `Shop.taxRateBps` and guarantees exactly one
 * star. Called at the end of every mutation, inside its transaction.
 */
async function syncDefault(
  tx: Prisma.TransactionClient,
  shopId: string,
): Promise<void> {
  const rates = await tx.taxRate.findMany({
    where: { shopId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, rateBps: true, isDefault: true, active: true },
  });
  if (rates.length === 0) return;

  const chosen =
    rates.find((rate) => rate.isDefault && rate.active) ??
    rates.find((rate) => rate.active) ??
    null;
  if (!chosen) return;

  // One star, and it is on `chosen`.
  await tx.taxRate.updateMany({
    where: { shopId, id: { not: chosen.id }, isDefault: true },
    data: { isDefault: false },
  });
  if (!chosen.isDefault) {
    await tx.taxRate.update({
      where: { id: chosen.id },
      data: { isDefault: true },
    });
  }

  await tx.shop.update({
    where: { id: shopId },
    data: { taxRateBps: chosen.rateBps },
  });
}

function revalidateTax() {
  // The rate shows up on documents, the POS and the app shell's print sheets.
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

export async function saveTaxRateAction(input: {
  id?: string | null;
  name: string;
  /** A percentage the way a human types it: "8.25". */
  rate: string;
  isDefault: boolean;
  active: boolean;
}): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const name = input.name.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Give this rate a name." };

  const rateBps = parseBps(input.rate);
  if (rateBps < 0 || rateBps > 10_000) {
    return { ok: false, error: "Enter a rate between 0 and 100%." };
  }

  try {
    await db.$transaction(async (tx) => {
      const shop = await tx.shop.findUnique({
        where: { id: session.shopId },
        select: { taxRateBps: true },
      });
      if (!shop) throw new Error("Shop not found.");

      const existingCount = await tx.taxRate.count({
        where: { shopId: session.shopId },
      });

      if (input.id) {
        const updated = await tx.taxRate.updateMany({
          where: { id: input.id, shopId: session.shopId },
          data: {
            name,
            rateBps,
            active: input.active,
            isDefault: input.isDefault && input.active,
          },
        });
        if (updated.count === 0) throw new Error("That rate no longer exists.");
      } else {
        if (existingCount >= MAX_RATES) {
          throw new Error(`A shop can keep up to ${MAX_RATES} tax rates.`);
        }
        // First ever save: keep the rate the shop has been charging.
        if (existingCount === 0) {
          await tx.taxRate.create({
            data: {
              shopId: session.shopId,
              name: "Default",
              rateBps: shop.taxRateBps,
              isDefault: !input.isDefault,
              active: true,
            },
          });
        }
        await tx.taxRate.create({
          data: {
            shopId: session.shopId,
            name,
            rateBps,
            active: input.active,
            isDefault: input.isDefault && input.active,
          },
        });
      }

      await syncDefault(tx, session.shopId);
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save that rate.",
    };
  }

  revalidateTax();
  return { ok: true };
}

/**
 * Deletes a rate outright.
 *
 * Safe because nothing depends on the row surviving: every document snapshots
 * `taxRateBps` at creation, and the `taxRateId` links are `onDelete: SetNull`.
 * A deleted rate takes its name off old documents, not its money.
 */
export async function deleteTaxRateAction(id: string): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  // Prisma reads `id: undefined` as "no filter" — without this guard a
  // malformed call would empty the table.
  if (typeof id !== "string" || !id) {
    return { ok: false, error: "That rate no longer exists." };
  }

  try {
    await db.$transaction(async (tx) => {
      const deleted = await tx.taxRate.deleteMany({
        where: { id, shopId: session.shopId },
      });
      if (deleted.count === 0) throw new Error("That rate no longer exists.");
      await syncDefault(tx, session.shopId);
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not delete that rate.",
    };
  }

  revalidateTax();
  return { ok: true };
}
