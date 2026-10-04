import { describe, expect, it } from "vitest";
import { speechTranscript } from "@/lib/voice/transcript";
import { possibleProductMatch } from "@/lib/ai/product-matching";
import { DEVICE_BOXES, deviceIntakeProfile, deviceModelOptions } from "@/lib/device-intake";
import { newCustomerSchema, newDeviceSchema } from "@/lib/intake";
import { inventoryGroups } from "@/lib/inventory/groups";
import manifest from "@/app/manifest";

describe("counter feedback", () => {
  it("groups guards separately from display assemblies and adds real quantities", () => {
    const groups = inventoryGroups([
      { id: "guard1", name: "iPhone 14 tempered glass", category: "Accessories", stockQty: 10 },
      { id: "guard2", name: "Samsung Screen Protector", category: "Accessories", stockQty: 7 },
      { id: "screen", name: "iPhone OLED screen assembly", category: "Parts / Displays", stockQty: 3 },
    ]);
    expect(groups[0]).toEqual({ key: "screen-guards", label: "Screen guards", quantity: 17, productIds: ["guard1", "guard2"] });
    expect(groups[1]).toMatchObject({ key: "screens", quantity: 3 });
  });
  it("launches an installed app into the task home", () => {
    expect(manifest()).toMatchObject({ start_url: "/counter", scope: "/", display: "standalone" });
  });
  it("replaces interim guesses instead of repeating every partial transcript", () => {
    expect(speechTranscript([[{ transcript: "check stock for screen cards" }]])).toBe("check stock for screen cards");
    expect(speechTranscript([[{ transcript: "check stock for" }], [{ transcript: "screen guards" }]])).toBe("check stock for screen guards");
    expect(speechTranscript([[{ transcript: "check stock for" }], [{ transcript: "screen guards please" }]])).toBe("check stock for screen guards please");
    expect(speechTranscript([])).toBe("");
  });
  it("finds a possible screen-guard match without confusing phone model numbers", () => {
    const guard = { name: "iPhone 14 Screen Guards", sku: "SG-14", category: "Protectors" };
    expect(possibleProductMatch("screen cards", guard)).toBe(true);
    expect(possibleProductMatch("iPhone 15 screen cards", guard)).toBe(false);
    expect(possibleProductMatch("battery", guard)).toBe(false);
    expect(possibleProductMatch("screen cards", { name: "Tempered Glass Protector", sku: "ACC-TG", category: "Accessories" })).toBe(true);
    expect(possibleProductMatch("screen guards", { name: "Tempered Glass Protector", sku: "ACC-TG", category: "Accessories" })).toBe(true);
    expect(possibleProductMatch("screen guards", { name: "OLED screen assembly", sku: "OLED", category: "Displays" })).toBe(false);
  });
  it("fills a PS5 identity and offers console problems, rather than phone options", () => {
    const ps5 = DEVICE_BOXES.find(device => device.label === "PS5")!;
    expect(ps5).toMatchObject({ type: "PlayStation", make: "Sony", model: "PlayStation 5" });
    expect(deviceIntakeProfile(ps5.type).problems).toContain("HDMI Port Repair");
    expect(deviceIntakeProfile("Television").makes).toContain("LG");
    expect(deviceModelOptions("Television", "Samsung")).toEqual([]);
    expect(deviceModelOptions("Phone", "Sony")).toEqual(["Xperia"]);
    expect(deviceModelOptions("PlayStation", "Sony")).not.toContain("Xperia");
  });
  it("accepts check-in without email, IMEI, passcode or a known model", () => {
    expect(newCustomerSchema.safeParse({ name: "Walk-in customer" }).success).toBe(true);
    expect(newDeviceSchema.safeParse({ type: "Television" }).success).toBe(true);
    expect(newDeviceSchema.safeParse({ type: "Coffee machine", serial: "", password: "" }).success).toBe(true);
    expect(newCustomerSchema.safeParse({ name: "Customer", email: "invalid email" }).success).toBe(false);
    // Name OR phone is enough; neither is not.
    expect(newCustomerSchema.safeParse({ phone: "512 555 0199" }).success).toBe(true);
    expect(newCustomerSchema.safeParse({}).success).toBe(false);
  });
});
