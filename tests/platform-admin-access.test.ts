import { describe, expect, it } from "vitest";

import {
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
} from "@/lib/platform-admin-access";

describe("platform administrator allowlist", () => {
  it("accepts comma, whitespace, and semicolon separated addresses", () => {
    expect(
      [...parsePlatformAdminEmails(" OWNER@example.com, ops@example.com\n root@example.com; ")],
    ).toEqual(["owner@example.com", "ops@example.com", "root@example.com"]);
  });

  it("matches case-insensitively after trimming", () => {
    expect(isPlatformAdminEmail("  Ops@Example.com ", "ops@example.com")).toBe(
      true,
    );
  });

  it("fails closed for missing, empty, or non-matching configuration", () => {
    expect(isPlatformAdminEmail("owner@example.com", undefined)).toBe(false);
    expect(isPlatformAdminEmail("owner@example.com", " , ; ")).toBe(false);
    expect(isPlatformAdminEmail("other@example.com", "owner@example.com")).toBe(
      false,
    );
    expect(isPlatformAdminEmail(undefined, "owner@example.com")).toBe(false);
  });
});
