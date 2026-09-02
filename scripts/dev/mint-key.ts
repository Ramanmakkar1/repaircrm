/**
 * Dev helper: mints an API key for the first shop and prints it once.
 *
 *     npx tsx scripts/dev/mint-key.ts "Local testing"
 *
 * The app itself only mints keys through Settings (which is where an operator
 * should do it); this exists so a developer can curl /api/v1 without clicking
 * through the UI first. It writes the same sha256-only row the UI does.
 */
import { db } from "../../lib/db";
import { mintApiKey } from "../../lib/api-key";

async function main() {
  const shop = await db.shop.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!shop) throw new Error("No shop in the database — run `npm run db:seed`.");

  const minted = mintApiKey();
  await db.apiKey.create({
    data: {
      shopId: shop.id,
      name: process.argv[2] ?? "Local testing",
      keyHash: minted.keyHash,
      prefix: minted.prefix,
    },
  });

  console.log(`shop: ${shop.name} (${shop.id})`);
  console.log(minted.key);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
