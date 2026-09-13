import { afterEach, describe, expect, it, vi } from "vitest";

import { collectFindings } from "@/lib/preflight";

describe("production AUTH_SECRET preflight", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects the long placeholder shipped in .env.example", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "change-me-to-something-long-and-random");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/db");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://repairpilot.example");
    vi.stubEnv("JOBS_INTERVAL_MIN", "15");

    expect(collectFindings().fatal).toContain(
      "AUTH_SECRET is still a placeholder value — anyone who has read this repo can mint a session.",
    );
  });

  it("accepts a long random-looking value that does not use placeholder prefixes", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "f2c94b3b7d038a94f8c352306b558daa2f0044a9b8a15b701370aa85312d47f0");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/db");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://repairpilot.example");
    vi.stubEnv("JOBS_INTERVAL_MIN", "15");

    expect(collectFindings().fatal).toEqual([]);
  });

  it("accepts a Hyperdrive binding as the database source without DATABASE_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "f2c94b3b7d038a94f8c352306b558daa2f0044a9b8a15b701370aa85312d47f0");
    vi.stubEnv("DATABASE_DRIVER", "hyperdrive");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://repairpilot.example");
    vi.stubEnv("JOBS_INTERVAL_MIN", "15");

    expect(collectFindings().fatal).toEqual([]);
  });
});
