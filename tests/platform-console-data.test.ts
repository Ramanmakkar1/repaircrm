import type * as FsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calls, callsTo, handlers, resetDb } from "./helpers/db-mock";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  driver: vi.fn(),
  fs: { readdir: vi.fn(), lstat: vi.fn(), statfs: vi.fn(), stat: vi.fn(), readFile: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { fakeClient } = await import("./helpers/db-mock");
  return { db: fakeClient };
});
vi.mock("@/lib/platform-admin", () => ({ requirePlatformAdmin: mocks.admin }));
vi.mock("@/lib/storage", () => ({ storageDriverName: mocks.driver }));
// The real file system, watched: each test builds a throwaway app folder and
// can see (or override) every read the System health page makes.
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return { ...real, ...mocks.fs, default: { ...real, ...mocks.fs } };
});

const realFs = await vi.importActual<typeof FsPromises>("node:fs/promises");
const { readPlatformConsole } = await import("@/lib/platform-console-data");

const ADMIN = { id: "op1", name: "Ops", email: "ops@example.test" };
const HEX = "0123456789abcdef0123456789abcdef";
const denied = () => Object.assign(new Error("permission denied"), { code: "EACCES" });
const gone = () => Object.assign(new Error("no such file"), { code: "ENOENT" });

let appDir = "";

/**
 * An app folder like the production container's: public/uploads with two
 * shops' files (3 files, 4,000 bytes), a .gitkeep, and two links pointing out
 * of the folder that must never be followed.
 */
async function makeApp({ uploads = true } = {}) {
  appDir = await realFs.mkdtemp(path.join(os.tmpdir(), "system-health-"));
  if (uploads) {
    const root = path.join(appDir, "public", "uploads");
    await realFs.mkdir(path.join(root, "shopA"), { recursive: true });
    await realFs.mkdir(path.join(root, "shopB", "nested"), { recursive: true });
    await realFs.writeFile(path.join(root, ".gitkeep"), "");
    await realFs.writeFile(path.join(root, "shopA", `${HEX}.jpg`), Buffer.alloc(1_000));
    await realFs.writeFile(path.join(root, "shopB", `${HEX}.pdf`), Buffer.alloc(2_500));
    await realFs.writeFile(path.join(root, "shopB", "nested", `${HEX}.png`), Buffer.alloc(500));
    await realFs.writeFile(path.join(appDir, "outside.bin"), Buffer.alloc(10_000));
    await realFs.symlink(path.join(appDir, "outside.bin"), path.join(root, "shopA", "link.jpg"));
    await realFs.symlink(appDir, path.join(root, "escape"));
  }
  vi.spyOn(process, "cwd").mockReturnValue(appDir);
}

async function writeBuild(contents: string, builtAt: Date) {
  const file = path.join(appDir, ".next", "BUILD_ID");
  await realFs.mkdir(path.dirname(file), { recursive: true });
  await realFs.writeFile(file, contents);
  await realFs.utimes(file, builtAt, builtAt);
}

function statfsResult(bavail: number) {
  return { type: 0, bsize: 4096, blocks: 1_000_000, bfree: bavail, bavail, files: 0, ffree: 0 };
}

beforeEach(() => {
  resetDb();
  mocks.admin.mockReset().mockResolvedValue(ADMIN);
  mocks.driver.mockReset().mockReturnValue("local");
  for (const [name, mock] of Object.entries(mocks.fs)) {
    mock.mockReset().mockImplementation(realFs[name as keyof typeof mocks.fs]);
  }
  handlers["$queryRaw"] = () => [
    { storageBytes: BigInt(14_000_000), activeSessions: 2, totalSessions: 7, maxConnections: 100 },
  ];
  handlers["attachment.groupBy"] = () => [
    { storage: "local", _count: { _all: 3 }, _sum: { sizeBytes: 4_000 } },
    { storage: "r2", _count: { _all: 2 }, _sum: { sizeBytes: 9_000 } },
  ];
  handlers["automaticProductPhoto.groupBy"] = () => [{ storage: "r2", _count: { _all: 1 }, _sum: { sizeBytes: 1_000 } }];
  handlers["webhookDelivery.findMany"] = () => [];
  handlers["integrationConnection.findMany"] = () => [];
  handlers["shop.findMany"] = () => [];
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  if (appDir) await realFs.rm(appDir, { recursive: true, force: true });
  appDir = "";
});

describe("System health readings", () => {
  it("checks the operator before reading the database, the uploads folder or the disk", async () => {
    await makeApp();
    mocks.admin.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(readPlatformConsole()).rejects.toThrow("NEXT_REDIRECT");
    expect(calls).toHaveLength(0);
    for (const mock of Object.values(mocks.fs)) expect(mock).not.toHaveBeenCalled();
  });

  it("adds up the uploads folder without following links or counting dot-files", async () => {
    await makeApp();

    const { uploads } = await readPlatformConsole();

    expect(uploads).toEqual({ bytes: 4_000, files: 3, complete: true });
  });

  it("stops counting after its time limit and says the total is only part of it", async () => {
    await makeApp();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    // Measuring the first file "takes" ten seconds.
    mocks.fs.lstat.mockImplementation(async (file: string) => {
      vi.setSystemTime(new Date("2026-11-01T12:00:10Z"));
      return realFs.lstat(file);
    });

    const { uploads } = await readPlatformConsole();

    expect(uploads?.complete).toBe(false);
    expect(uploads?.files).toBe(1);
  });

  it("counts a shop folder deleted mid-count as gone, but an unreadable one as missing from the total", async () => {
    await makeApp();
    mocks.fs.readdir.mockImplementationOnce(realFs.readdir).mockRejectedValueOnce(gone());
    const deleted = (await readPlatformConsole()).uploads;
    expect(deleted?.complete).toBe(true);
    expect(deleted?.files).toBeLessThan(3);

    mocks.fs.readdir.mockImplementationOnce(realFs.readdir).mockRejectedValueOnce(denied());
    expect((await readPlatformConsole()).uploads?.complete).toBe(false);
  });

  it("treats a missing uploads folder as empty and an unreadable one as unknown", async () => {
    await makeApp({ uploads: false });
    expect((await readPlatformConsole()).uploads).toEqual({ bytes: 0, files: 0, complete: true });

    mocks.fs.readdir.mockRejectedValueOnce(denied());
    expect((await readPlatformConsole()).uploads).toBeNull();
  });

  it("measures free space on the disk that holds the uploads folder", async () => {
    await makeApp();

    const { disk } = await readPlatformConsole();

    expect(mocks.fs.statfs).toHaveBeenCalledWith(path.join(appDir, "public", "uploads"));
    expect(disk?.measured).toBe("uploads");
    expect(disk?.totalBytes).toBeGreaterThan(0);
    expect(disk?.freeBytes).toBeGreaterThanOrEqual(0);
    expect(disk?.freeBytes).toBeLessThanOrEqual(disk?.totalBytes ?? 0);
  });

  it("warns only once less than a tenth of the disk is free", async () => {
    await makeApp();

    mocks.fs.statfs.mockResolvedValueOnce(statfsResult(99_999));
    expect((await readPlatformConsole()).disk).toEqual({
      totalBytes: 4096 * 1_000_000,
      freeBytes: 4096 * 99_999,
      measured: "uploads",
      low: true,
    });

    mocks.fs.statfs.mockResolvedValueOnce(statfsResult(100_000));
    expect((await readPlatformConsole()).disk?.low).toBe(false);
  });

  it("measures the app's own disk when there is no uploads folder, and gives up quietly when neither can be read", async () => {
    await makeApp({ uploads: false });
    expect((await readPlatformConsole()).disk?.measured).toBe("app");

    mocks.fs.statfs.mockRejectedValue(denied());
    expect((await readPlatformConsole()).disk).toBeNull();
  });

  it("reads the database's size and connections from PostgreSQL itself", async () => {
    await makeApp();

    const { database } = await readPlatformConsole();

    expect(database).toEqual({ storageBytes: 14_000_000, activeSessions: 2, totalSessions: 7, maxConnections: 100 });
    const sql = String(callsTo("$queryRaw")[0]?.args.sql);
    expect(sql).toContain("pg_database_size(current_database())");
    expect(sql).toContain("pg_stat_activity");
  });

  it("totals saved files by where they are kept, uploads and automatic photos together", async () => {
    await makeApp();
    mocks.driver.mockReturnValue("r2");

    const { storedFiles, runtime } = await readPlatformConsole();

    expect(runtime.storageDriver).toBe("r2");
    expect(storedFiles).toEqual([
      { storage: "r2", files: 3, bytes: 10_000 },
      { storage: "local", files: 3, bytes: 4_000 },
    ]);
    expect(callsTo("automaticProductPhoto.groupBy")[0]?.args.where).toEqual({ storage: { not: null } });
  });

  it("describes the live build only on a production server", async () => {
    await makeApp();
    const builtAt = new Date("2026-11-01T13:44:00Z");
    await writeBuild("K-FRREVeFuWdOFpWQed7K\n", builtAt);
    vi.spyOn(process, "uptime").mockReturnValue(7_200);

    const development = await readPlatformConsole();
    expect(development.runtime).toMatchObject({ production: false, buildId: null, builtAt: null, nodeVersion: process.version });
    expect(development.now.getTime() - development.runtime.startedAt.getTime()).toBe(7_200_000);
    expect(mocks.fs.readFile).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    const live = await readPlatformConsole();
    expect(live.runtime).toMatchObject({ production: true, buildId: "K-FRREVeFuWdOFpWQed7K", builtAt });
  });

  it("does not show a build file that isn't a Next.js build ID, and copes with no build at all", async () => {
    await makeApp();
    vi.stubEnv("NODE_ENV", "production");
    expect((await readPlatformConsole()).runtime).toMatchObject({ production: true, buildId: null, builtAt: null });

    const builtAt = new Date("2026-11-01T13:44:00Z");
    await writeBuild("<script>alert(1)</script>", builtAt);
    expect((await readPlatformConsole()).runtime).toMatchObject({ buildId: null, builtAt });
  });

  it("leaves out readings it is not allowed to take instead of failing the page", async () => {
    await makeApp();
    handlers["$queryRaw"] = () => {
      throw new Error("permission denied for function pg_database_size");
    };
    handlers["attachment.groupBy"] = () => {
      throw new Error("relation does not exist");
    };
    handlers["webhookDelivery.findMany"] = () => {
      throw new Error("timeout");
    };

    const reading = await readPlatformConsole();

    expect(reading.database).toBeNull();
    expect(reading.storedFiles).toBeNull();
    expect(reading.failures).toEqual({ rows: [], unavailableSources: ["webhook deliveries"] });
    expect(reading.uploads).toEqual({ bytes: 4_000, files: 3, complete: true });
  });

  it("lists saved failures newest first with credentials removed", async () => {
    await makeApp();
    handlers["webhookDelivery.findMany"] = () => [
      {
        id: "w1",
        event: "invoice.paid",
        lastError: "401 from https://hooks.example/in Bearer abc.def",
        responseCode: 401,
        attempts: 5,
        lastAttemptAt: new Date("2026-10-30T10:00:00Z"),
        createdAt: new Date("2026-10-29T10:00:00Z"),
        shop: { name: "Fix-It Corner" },
      },
    ];
    handlers["integrationConnection.findMany"] = () => [
      {
        id: "i1",
        provider: "quickbooks",
        lastError: "refresh_token=abc123 was rejected",
        updatedAt: new Date("2026-10-31T10:00:00Z"),
        shop: { name: "Phone Doc" },
      },
    ];
    handlers["shop.findMany"] = () => [
      {
        id: "s1",
        name: "Gadget Lab",
        stripeWebhookError: "Invalid API key sk_live_51Habc",
        stripeWebhookAt: null,
        updatedAt: new Date("2026-10-29T10:00:00Z"),
      },
    ];

    const { failures } = await readPlatformConsole();

    expect(failures.unavailableSources).toEqual([]);
    expect(failures.rows.map((row) => [row.kind, row.shopName, row.message])).toEqual([
      ["integration", "Phone Doc", "refresh_token=[redacted] was rejected"],
      ["webhook", "Fix-It Corner", "401 from https://hooks.example/in Bearer [redacted]"],
      ["payments", "Gadget Lab", "Invalid API key [redacted key]"],
    ]);
  });
});
