/**
 * The storage contract every driver implements.
 *
 * Pure types — no `node:fs`, no `fetch` — so both drivers and the callers that
 * only need the shape can import from here.
 *
 * A `key` is the driver-relative object path (`<shopId>/<32 hex>.<ext>`). What
 * gets written into `Attachment.path` is the driver's own idea of a location:
 * for `local` that is the historical `/uploads/<shopId>/<name>` public path, so
 * every row written before object storage existed keeps working untouched.
 */

export type StorageDriverName = "local" | "s3";

export type PutInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

/** What a driver hands back for a successful read. */
export type StoredObject = {
  body: Buffer;
  contentType: string | null;
  sizeBytes: number;
};

export interface StorageDriver {
  readonly name: StorageDriverName;
  /** Writes the object and returns the value to store in `Attachment.path`. */
  put(input: PutInput): Promise<string>;
  /** Reads an object back by the stored path. Null when it is gone. */
  get(path: string): Promise<StoredObject | null>;
  /** Best-effort delete. Never throws for a missing object. */
  remove(path: string): Promise<void>;
}
