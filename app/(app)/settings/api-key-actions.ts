"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { mintApiKey } from "@/lib/api-key";
import type {
  ApiKeyItem,
  CreateApiKeyResult,
  SettingsResult,
} from "@/components/settings/types";

/**
 * Public-API key management.
 *
 * OWNER ONLY. A key is a permanent, password-less door into every customer,
 * ticket and invoice in the shop — front desk manages people's credit, not the
 * shop's integrations.
 *
 * Like the rest of settings/actions.ts these return an error object rather than
 * calling `requireRole` (which redirects), because the client is awaiting a
 * result and a redirect there surfaces as an opaque failure.
 */

const MAX_KEYS = 20;

async function ownerOnly() {
  const session = await requireUser();
  if (session.role !== "OWNER") {
    return { session, denied: "Only an owner can manage API keys." };
  }
  return { session, denied: null as string | null };
}

function toItem(row: {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}): ApiKeyItem {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    active: row.active,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Mints a key and returns it ONCE.
 *
 * The plaintext is generated here, handed to the caller, and forgotten — only
 * `sha256(key)` is written. There is deliberately no "show key again": if the
 * operator loses it, they revoke it and create another. That is the whole
 * security value of hashing it.
 */
export async function createApiKeyAction(
  name: string,
): Promise<CreateApiKeyResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  const trimmed = name.trim().slice(0, 60);
  if (trimmed.length < 2) {
    return { ok: false, error: "Give the key a name so you know what it's for." };
  }

  const count = await db.apiKey.count({ where: { shopId: session.shopId } });
  if (count >= MAX_KEYS) {
    return {
      ok: false,
      error: `That's ${MAX_KEYS} keys already — revoke one you no longer use.`,
    };
  }

  const minted = mintApiKey();

  try {
    const row = await db.apiKey.create({
      data: {
        shopId: session.shopId,
        name: trimmed,
        keyHash: minted.keyHash,
        prefix: minted.prefix,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    await audit({
      shopId: session.shopId,
      userId: session.userId,
      action: "api_key.created",
      entity: "api_key",
      entityId: row.id,
      summary: `Created API key "${row.name}" (${row.prefix}\u2026)`,
    });

    revalidatePath("/settings");
    return { ok: true, key: minted.key, item: toItem(row) };
  } catch {
    return { ok: false, error: "Could not create that key. Try again." };
  }
}

/**
 * Revoke = deactivate, never delete.
 *
 * `lastUsedAt` on a revoked key is the only evidence of what an abused
 * integration was doing and when it stopped; deleting the row destroys the
 * audit trail at exactly the moment someone needs it. An inactive key is
 * refused by authApiKey with the same 401 as an unknown one.
 */
export async function setApiKeyActiveAction(
  keyId: string,
  active: boolean,
): Promise<SettingsResult> {
  const { session, denied } = await ownerOnly();
  if (denied) return { ok: false, error: denied };

  // updateMany with the shopId in the where: a guessed id from another shop
  // matches nothing rather than flipping someone else's key.
  const result = await db.apiKey.updateMany({
    where: { id: keyId, shopId: session.shopId },
    data: { active },
  });

  if (result.count === 0) {
    return { ok: false, error: "That key no longer exists." };
  }

  await audit({
    shopId: session.shopId,
    userId: session.userId,
    action: active ? "api_key.created" : "api_key.revoked",
    entity: "api_key",
    entityId: keyId,
    summary: active ? "Re-enabled an API key" : "Revoked an API key",
  });

  revalidatePath("/settings");
  return { ok: true };
}
