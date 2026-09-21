import type { Prisma } from "@prisma/client";

import { samePhoneClause } from "@/lib/customers/phone-search";
import { db } from "@/lib/db";
import { emitCustomerEvent } from "@/lib/events";

/**
 * "Add them as a new customer" from inside another form — an invoice, an
 * estimate — so a first-time customer is never a detour to a second screen.
 *
 * The form sends `customerId=new` plus `newCustomerName`, `newCustomerPhone`,
 * `newCustomerEmail` and the `newCustomerSmsOk` tick. The same person asked for
 * twice must not become two customers, so an existing match (last 7 digits of
 * the phone, or the email) is USED instead of created.
 */

export const NEW_CUSTOMER = "new";

export type QuickCustomer =
  | { ok: true; customer: { firstName: string; lastName: string; email: string | null; phone: string | null; smsOk: boolean } }
  | { ok: false; error: string };

export function readQuickCustomer(formData: FormData): QuickCustomer | null {
  if (String(formData.get("customerId") ?? "") !== NEW_CUSTOMER) return null;
  const name = String(formData.get("newCustomerName") ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Add the new customer's name." };
  const phone = String(formData.get("newCustomerPhone") ?? "").trim().slice(0, 40) || null;
  const email = String(formData.get("newCustomerEmail") ?? "").trim().toLowerCase().slice(0, 200) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email doesn't look right — fix it or leave it blank." };
  }
  const parts = name.split(/\s+/);
  const tick = formData.get("newCustomerSmsOk");
  return {
    ok: true,
    customer: {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      phone,
      email,
      smsOk: Boolean(phone) && (tick === "on" || tick === "true"),
    },
  };
}

/** The existing customer this person already is, or a new one. Returns the id. */
export async function findOrCreateQuickCustomer(
  shopId: string,
  person: Extract<QuickCustomer, { ok: true }>["customer"],
): Promise<string> {
  const known: Prisma.CustomerWhereInput[] = await samePhoneClause(shopId, person.phone);
  if (person.email) known.push({ email: { equals: person.email, mode: "insensitive" as const } });

  if (known.length > 0) {
    const match = await db.customer.findFirst({ where: { shopId, OR: known }, select: { id: true } });
    if (match) return match.id;
  }

  const created = await db.customer.create({
    data: {
      shopId,
      firstName: person.firstName,
      lastName: person.lastName,
      mobile: person.phone,
      email: person.email,
      emailOptIn: true,
      smsOptIn: person.smsOk,
    },
    select: { id: true },
  });
  await emitCustomerEvent(shopId, "customer.created", created.id);
  return created.id;
}
