import { z } from "zod";
import { addDaysToKey, dayKeyIn, parseWallDateTime } from "@/lib/dashboard/zone";

/** A name OR a phone number is enough — customers often only give their number. */
export const newCustomerSchema = z.object({
  name: z.string().trim().max(160).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
}).refine((c) => Boolean(c.name || c.phone), { path: ["name"], message: "Enter a name or a phone number." });

export const newDeviceSchema = z.object({
  type: z.string().trim().min(1).max(80),
  make: z.string().trim().max(80).default(""),
  model: z.string().trim().max(120).default(""),
  serial: z.string().trim().max(120).default(""),
  password: z.string().max(80).default(""),
});

export function splitCustomerName(name: string, phone = "") {
  // Phone-only customers read as "Customer 5125550199" so lists stay scannable.
  if (!name.trim()) return { firstName: "Customer", lastName: phone.trim() };
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

/**
 * The number a phone-only customer is named after: the counter form's mobile,
 * else the office phone — the same order the customer is created with.
 */
function mainNumber(numbers: { mobile: string | null; phone: string | null }): string {
  return (numbers.mobile || numbers.phone || "").trim();
}

/**
 * The new name for a customer whose number just changed, or null to leave the
 * name alone. Only the auto "Customer <number>" placeholder for the OLD number
 * follows the change; a name somebody typed is never touched, nor is a name
 * whose number did not change.
 */
export function renamedPlaceholder(
  name: { firstName: string; lastName: string },
  before: { mobile: string | null; phone: string | null },
  after: { mobile: string | null; phone: string | null },
): { firstName: string; lastName: string } | null {
  const was = mainNumber(before);
  const now = mainNumber(after);
  if (!was || was === now) return null;
  const placeholder = splitCustomerName("", was);
  if (name.firstName !== placeholder.firstName || name.lastName !== placeholder.lastName) return null;
  return splitCustomerName("", now);
}

/** Suggested, editable subject using only the device and problem staff chose. */
export function repairSubject(device: string, problem: string): string {
  if (!problem.trim()) return "";
  return [device.trim(), problem.trim()].filter(Boolean).join(" — ").slice(0, 200);
}

/** Browser emits ISO including offset so server timezone never moves the promise. */
export function promisedDate(value: string): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export const DEVICE_MAKES = ["Apple", "Samsung", "Google", "Motorola", "OnePlus", "Huawei", "Xiaomi", "Oppo", "Nokia", "Sony", "Microsoft", "Dell", "HP", "Lenovo", "Asus", "Acer", "Nintendo"];
export const DEVICE_MODELS: Record<string, string[]> = {
  Apple: ["iPhone 13", "iPhone 14", "iPhone 15", "iPhone 16", "iPad", "iPad Pro", "MacBook Air", "MacBook Pro", "Apple Watch"],
  Samsung: ["Galaxy S23", "Galaxy S24", "Galaxy S25", "Galaxy A54", "Galaxy A55", "Galaxy Z Fold", "Galaxy Z Flip", "Galaxy Tab"],
  Google: ["Pixel 7", "Pixel 8", "Pixel 9", "Pixel Fold"],
  Sony: ["PlayStation 4", "PlayStation 5", "Xperia"],
  Microsoft: ["Surface Pro", "Surface Laptop", "Xbox Series X", "Xbox Series S"],
  Nintendo: ["Switch", "Switch OLED", "Switch Lite"],
};

/**
 * "Today" / "Tomorrow" / "In 3 days" / "Next week" on the shop's clock:
 * 5 pm that many days from now, as the `datetime-local` value the pickup field
 * holds (no zone; the zone is added by promisedIso).
 */
export function quickPromisedLocal(days: number, from: Date = new Date(), zone?: string): string {
  if (zone) return `${addDaysToKey(dayKeyIn(from.getTime(), zone), days)}T17:00`;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(17, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** A `datetime-local` value as the ISO instant the server reads (see promisedDate), or "" when blank or not a date. */
export function promisedIso(local: string, zone?: string): string {
  if (zone) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return "";
    const instant = parseWallDateTime(local, zone);
    return instant === null ? "" : new Date(instant).toISOString();
  }
  const parsed = local ? new Date(local) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}
