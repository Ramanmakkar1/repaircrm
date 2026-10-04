import { DEVICE_MAKES, DEVICE_MODELS } from "./intake";

export const DEVICE_BOXES = [
  { label: "Phone", type: "Phone", make: "", model: "" },
  { label: "Tablet", type: "Tablet", make: "", model: "" },
  { label: "Laptop", type: "Laptop", make: "", model: "" },
  { label: "TV", type: "Television", make: "", model: "" },
  { label: "PS5", type: "PlayStation", make: "Sony", model: "PlayStation 5" },
  { label: "Xbox", type: "Xbox", make: "Microsoft", model: "" },
  { label: "Switch", type: "Nintendo Switch", make: "Nintendo", model: "" },
  { label: "Other", type: "Other", make: "", model: "" },
] as const;

export function deviceIntakeProfile(type: string): { makes: readonly string[]; problems: string[] } {
  if (/television|\btv\b/i.test(type)) return { makes: ["Samsung", "LG", "Sony", "TCL", "Hisense", "Panasonic", "Philips"], problems: ["No Power", "No Picture", "Screen Repair", "Sound Problem", "Remote Problem", "Diagnostic"] };
  if (/playstation|xbox|nintendo|console/i.test(type)) return { makes: ["Sony", "Microsoft", "Nintendo"], problems: ["No Power", "HDMI Port Repair", "Overheating", "Disc Drive Repair", "Controller Repair", "Diagnostic"] };
  if (/laptop|desktop|computer/i.test(type)) return { makes: ["Apple", "Dell", "HP", "Lenovo", "Asus", "Acer", "Microsoft"], problems: ["No Power", "Screen Repair", "Battery Replacement", "Keyboard Repair", "Software / Virus", "Diagnostic"] };
  if (/phone|tablet/i.test(type)) return { makes: ["Apple", "Samsung", "Google", "Motorola", "OnePlus", "Huawei", "Xiaomi", "Oppo", "Nokia"], problems: ["Screen Repair", "Battery Replacement", "Charging Port Repair", "Water Damage", "Software / Virus", "Diagnostic"] };
  return { makes: DEVICE_MAKES, problems: ["No Power", "Physical Damage", "Intermittent Problem", "Maintenance", "Diagnostic", "Other Repair"] };
}

export function deviceModelOptions(type: string, make: string): string[] {
  const models = DEVICE_MODELS[make] ?? [];
  if (/television|\btv\b/i.test(type)) return [];
  if (/playstation|xbox|nintendo|console/i.test(type)) return models.filter(model => /playstation|xbox|switch/i.test(model));
  if (/laptop|desktop|computer/i.test(type)) return models.filter(model => /macbook|surface/i.test(model));
  if (/tablet/i.test(type)) return models.filter(model => /ipad|tab|surface/i.test(model));
  if (/phone/i.test(type)) return models.filter(model => /iphone|galaxy(?!.*tab)|pixel|xperia/i.test(model));
  return models;
}

/**
 * The device kinds the Easy-mode check-in shows as picture tiles. Separate from
 * DEVICE_BOXES (which Full mode indexes by position) so neither list can break
 * the other. `type` is what the repair is saved with; `photo` is a file in
 * public/images/products.
 */
export const INTAKE_DEVICE_KINDS = [
  { label: "Phone", type: "Phone", photo: "phone" },
  { label: "Tablet", type: "Tablet", photo: "tablet" },
  { label: "Laptop", type: "Laptop", photo: "laptop" },
  { label: "Computer", type: "Desktop", photo: "desktop-computer" },
  { label: "Game console", type: "Game console", photo: "game-console" },
  { label: "TV", type: "Television", photo: "television" },
  { label: "Watch", type: "Smartwatch", photo: "smartwatch" },
  { label: "Other", type: "Other", photo: "repair-tools" },
] as const;

/** The kind that has no fixed brand list: the person says what it is. */
export const INTAKE_OTHER_TYPE = "Other";

/** deviceIntakeProfile, plus the watch the Easy-mode tiles offer. */
export function easyIntakeProfile(type: string): { makes: readonly string[]; problems: string[] } {
  if (/watch/i.test(type)) return { makes: ["Apple", "Samsung", "Garmin", "Fitbit", "Google"], problems: ["Screen Repair", "Battery Replacement", "Charging Problem", "Water Damage", "Diagnostic"] };
  return deviceIntakeProfile(type);
}

/** deviceModelOptions, minus the laptops it would list for a desktop and the phones for a watch. */
export function easyModelOptions(type: string, make: string): string[] {
  if (/desktop/i.test(type)) return [];
  if (/watch/i.test(type)) return (DEVICE_MODELS[make] ?? []).filter(model => /watch/i.test(model));
  return deviceModelOptions(type, make);
}
