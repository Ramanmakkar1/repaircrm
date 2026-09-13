import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

function valueFromFile(file, keys) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      for (const key of keys) {
        const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`));
        if (match?.[1]) return match[1].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // Try the next source and report one actionable error below if none work.
  }
  return undefined;
}

const connectionString =
  process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ||
  process.env.HYPERDRIVE_LOCAL_URL ||
  valueFromFile(new URL("../../.dev.vars", import.meta.url), [
    "HYPERDRIVE_LOCAL_URL",
    "DATABASE_URL",
  ]) ||
  process.env.DATABASE_URL ||
  valueFromFile(new URL("../../.env", import.meta.url), [
    "HYPERDRIVE_LOCAL_URL",
    "DATABASE_URL",
  ]);

if (!connectionString) {
  console.error(
    "Set DATABASE_URL in ignored .env or HYPERDRIVE_LOCAL_URL in ignored .dev.vars to a PostgreSQL connection string before running RepairPilot locally.",
  );
  process.exit(1);
}

const result = spawnSync("npx", process.argv.slice(2), {
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: connectionString,
  },
});

process.exit(result.status ?? 1);
