import { z } from "zod";

export const newCustomerSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name.").max(160),
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
});

export const newDeviceSchema = z.object({
  type: z.string().trim().min(1).max(80),
  make: z.string().trim().max(80),
  model: z.string().trim().max(120),
  serial: z.string().trim().max(120),
  password: z.string().max(80),
});

export function splitCustomerName(name: string) {
  const [firstName, ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
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
