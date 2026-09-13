import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { StorageDriver, StoredObject } from "./types";

const BUCKET_NAME = "repairpilot-uploads-prod";
const STORED_PATH_PREFIX = `r2://${BUCKET_NAME}/`;
const KEY_PATTERN = /^([A-Za-z0-9_-]{1,64})\/([a-f0-9]{32}\.[a-z0-9]{1,8})$/;

function bucket() {
  const env = getCloudflareContext({ async: false }).env;
  const binding = env.REPAIRPILOT_UPLOADS;
  if (!binding) throw new Error("The Cloudflare REPAIRPILOT_UPLOADS binding is required.");
  return binding;
}

function keyFor(storedPath: string): string | null {
  if (!storedPath.startsWith(STORED_PATH_PREFIX)) return null;
  const key = storedPath.slice(STORED_PATH_PREFIX.length);
  return KEY_PATTERN.test(key) ? key : null;
}

export const r2Driver: StorageDriver = {
  name: "r2",

  async put({ key, body, contentType }): Promise<string> {
    if (!KEY_PATTERN.test(key)) throw new Error("Invalid R2 object key.");
    await bucket().put(key, body, {
      httpMetadata: { contentType },
    });
    return `${STORED_PATH_PREFIX}${key}`;
  },

  async get(storedPath: string): Promise<StoredObject | null> {
    const key = keyFor(storedPath);
    if (!key) return null;
    const object = await bucket().get(key);
    if (!object) return null;
    return {
      body: Buffer.from(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType ?? null,
      sizeBytes: object.size,
    };
  },

  async remove(storedPath: string): Promise<void> {
    const key = keyFor(storedPath);
    if (key) await bucket().delete(key);
  },
};
