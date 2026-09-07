import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit + integration tests for the money paths.
 *
 * SCOPE: pure logic and DB-free helpers only. There is no browser environment,
 * no jsdom, and no e2e runner here — the things this suite exists to protect
 * (cents arithmetic, tax snapshotting, refund ceilings, payment dedupe, webhook
 * signatures, tenant scoping) are all decidable without rendering a page.
 *
 * Prisma is never reached. Modules that talk to the database take either an
 * injectable `tx` (lib/sequence.ts, lib/deposits.ts) or the module-level `db`
 * from `@/lib/db`, which the tests replace with a recording fake — see
 * tests/helpers/db-mock.ts. That fake is what lets the tenancy suite ASSERT the
 * `shopId` filter on every query rather than trusting a code review of it.
 */
/** This directory, with no trailing separator — the "@" of tsconfig's paths. */
const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json, so tests import exactly the
    // specifiers the application does and `vi.mock("@/lib/db")` matches the
    // same resolved file the application imports.
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Explicit imports of describe/it/expect keep the test files honest under
    // `tsc --noEmit` without adding vitest's globals to the app's type space.
    globals: false,
    restoreMocks: true,
  },
});
