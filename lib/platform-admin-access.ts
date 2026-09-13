/**
 * Pure access-list helpers. Platform administration is configured explicitly
 * and is intentionally independent of the shop-scoped OWNER role.
 */
export function parsePlatformAdminEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdminEmail(
  email: string | null | undefined,
  allowlist: string | undefined,
): boolean {
  if (!email) return false;
  const admins = parsePlatformAdminEmails(allowlist);
  return admins.size > 0 && admins.has(email.trim().toLowerCase());
}
