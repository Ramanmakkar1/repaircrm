"use server";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { CommandSuggestion } from "@/lib/ai/quick-commands";

/** Small, tenant-scoped autocomplete. No provider calls or cross-shop cache. */
export async function assistantSuggestions(input: string): Promise<CommandSuggestion[]> {
  const { shopId, userId } = await requireUser();
  if (typeof input !== "string" || input.length > 180 || !rateLimit(`assistant-suggest:${shopId}:${userId}`, 90, 60_000).allowed) return [];
  const match = input.trim().match(/^(?:find|search|look up|show) (customer|customers|part|parts|product|products|repair|ticket) (.{2,120})$/i);
  if (!match) return [];
  const term = match[2].trim();
  if (/customer/i.test(match[1])) {
    const rows = await db.customer.findMany({ where: { shopId, AND: term.split(/\s+/).slice(0, 4).map(word => ({ OR: [{ firstName: { contains: word, mode: "insensitive" as const } }, { lastName: { contains: word, mode: "insensitive" as const } }, { businessName: { contains: word, mode: "insensitive" as const } }] })) }, take: 4, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { firstName: true, lastName: true, businessName: true } });
    return rows.map(row => { const name = [row.firstName, row.lastName].filter(Boolean).join(" ") || row.businessName || "Customer"; return { label: name, command: `Find customer ${name}`, detail: "Customer" }; });
  }
  if (/repair|ticket/i.test(match[1])) {
    if (!/^#?\d{1,7}$/.test(term)) return [];
    const rows = await db.ticket.findMany({ where: { shopId, number: Number(term.replace("#", "")) }, take: 4, select: { number: true, subject: true } });
    return rows.map(row => ({ label: `Repair #${row.number}`, command: `Show repair ${row.number}`, detail: row.subject }));
  }
  const rows = await db.product.findMany({ where: { shopId, active: true, name: { contains: term, mode: "insensitive" } }, take: 4, orderBy: { name: "asc" }, select: { name: true, stockQty: true } });
  return rows.map(row => ({ label: row.name, command: `Find product ${row.name}`, detail: `${row.stockQty} in stock` }));
}
