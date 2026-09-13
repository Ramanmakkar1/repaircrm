import { afterEach, describe, expect, it } from "vitest";

import { squareConfigured } from "@/lib/payments/square/config";

const names = [
  "SQUARE_DRIVER",
  "SQUARE_APPLICATION_ID",
  "SQUARE_APPLICATION_SECRET",
] as const;
// Wrangler infers literal types for configured `vars`; in tests they still
// need to accept runtime overrides, just like a deployed Worker environment.
const env = process.env as Record<string, string | undefined>;
const original = Object.fromEntries(names.map((name) => [name, env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) Reflect.deleteProperty(env, name);
    else env[name] = value;
  }
});

describe("Square activation guard", () => {
  it("keeps credentials disabled until the explicit driver switch is on", () => {
    env.SQUARE_APPLICATION_ID = "square-app-test";
    env.SQUARE_APPLICATION_SECRET = "square-secret-test";
    delete env.SQUARE_DRIVER;

    expect(squareConfigured()).toBe(false);

    env.SQUARE_DRIVER = "square";
    expect(squareConfigured()).toBe(true);
  });

  it("stays disabled when either credential is missing", () => {
    env.SQUARE_DRIVER = "square";
    env.SQUARE_APPLICATION_ID = "square-app-test";
    delete env.SQUARE_APPLICATION_SECRET;

    expect(squareConfigured()).toBe(false);
  });
});
