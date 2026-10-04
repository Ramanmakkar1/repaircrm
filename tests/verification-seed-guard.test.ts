import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("refuses an absent caller URL before Prisma can load its generated-client environment", () => {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  delete env.DATABASE_URL;
  // The independent production guard prevents seeding even if URL validation
  // regresses and the generated client imports the developer's environment.
  const result = spawnSync(process.execPath, ["--import", "tsx", resolve("prisma/seed.ts")], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 10_000,
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Set DATABASE_URL before seeding");
  expect(result.stdout).not.toContain("Seeding RepairPilot");
});
