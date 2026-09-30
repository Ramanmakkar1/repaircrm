import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { StorageDriver, StoredObject } from "./types";
import { s3Config, s3Driver } from "./s3";

const BUCKET_NAME = "repairpilot-uploads-prod";
const STORED_PATH_PREFIX = `r2://${BUCKET_NAME}/`;
const KEY_PATTERN = /^([A-Za-z0-9_-]{1,64})\/([a-f0-9]{32}\.[a-z0-9]{1,8})$/;

function bucket() {
  // The VPS uses the same private bucket through its S3 endpoint. Keep r2://
  // paths and driver names stable so existing attachments and quotas survive.
  if (process.env.R2_TRANSPORT === "s3") {
    const config = s3Config();
    if (config.bucket !== BUCKET_NAME ||
        !config.endpoint?.match(/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\/?$/)) {
      throw new Error("R2 S3 transport must target the existing private R2 bucket.");
    }
    return null;
  }
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
    const binding = bucket();
    if (binding) await binding.put(key, body, { httpMetadata: { contentType } });
    else await s3Driver.put({ key, body, contentType });
    return `${STORED_PATH_PREFIX}${key}`;
  },

  async get(storedPath: string): Promise<StoredObject | null> {
    const key = keyFor(storedPath);
    if (!key) return null;
    const binding = bucket();
    if (!binding) return s3Driver.get(`s3://${BUCKET_NAME}/${key}`);
    const object = await binding.get(key);
    if (!object) return null;
    return {
      body: Buffer.from(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType ?? null,
      sizeBytes: object.size,
    };
  },

  async remove(storedPath: string): Promise<void> {
    const key = keyFor(storedPath);
    if (!key) return;
    const binding = bucket();
    if (binding) await binding.delete(key);
    else await s3Driver.remove(`s3://${BUCKET_NAME}/${key}`);
  },
};
