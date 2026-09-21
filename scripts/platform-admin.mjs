#!/usr/bin/env node
/**
 * Create or reset a RepairPilot platform operator (the /platform console).
 *
 *   PLATFORM_ADMIN_PASSWORD='long-random-passphrase' \
 *     node scripts/platform-admin.mjs add ops@example.com "Ops Name"
 *   node scripts/platform-admin.mjs disable ops@example.com
 *   node scripts/platform-admin.mjs list
 *
 * There is deliberately no web page for this: an operator account can read
 * every shop, so creating one needs database access, not a browser. The
 * password comes from the environment so it never lands in shell history as an
 * argument. Setting a new password signs out that operator's other sessions.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const [command, rawEmail, ...nameParts] = process.argv.slice(2);
const db = new PrismaClient();

async function main() {
  if (command === "list") {
    const admins = await db.platformAdmin.findMany({
      orderBy: { email: "asc" },
      select: { email: true, name: true, active: true, lastLoginAt: true },
    });
    console.table(admins);
    return;
  }
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Give an email address.");

  if (command === "disable") {
    await db.platformAdmin.update({ where: { email }, data: { active: false } });
    console.log(`Disabled ${email}. Their session ends on their next click.`);
    return;
  }
  if (command === "add") {
    const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
    if (password.length < 14) throw new Error("Set PLATFORM_ADMIN_PASSWORD to at least 14 characters.");
    const name = nameParts.join(" ").trim() || email;
    const passwordHash = await bcrypt.hash(password, 12);
    await db.platformAdmin.upsert({
      where: { email },
      create: { email, name, passwordHash },
      update: { name, passwordHash, active: true, passwordChangedAt: new Date() },
    });
    console.log(`Operator ${email} is ready. Sign in at /platform/login.`);
    return;
  }
  throw new Error('Usage: add <email> [name] | disable <email> | list');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
