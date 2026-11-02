import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { readPlatformConsole } from "@/lib/platform-console-data";
import { formatDateTime } from "@/lib/platform-format";

const mocks = vi.hoisted(() => ({ console: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/platform-admin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/platform-shops", () => ({ recountStorage: vi.fn() }));
vi.mock("@/lib/platform-console-data", () => ({ readPlatformConsole: mocks.console }));

const { default: SystemHealthPage } = await import("@/app/platform/system/page");

type Reading = Awaited<ReturnType<typeof readPlatformConsole>>;

const NOW = new Date("2026-11-01T18:00:00Z");
const GB = 1024 ** 3;
const HOSTILE = `<img src=x onerror=alert(1)>`;

const healthy: Reading = {
  admin: { id: "op1", name: "Ops", email: "ops@example.test" },
  now: NOW,
  database: { storageBytes: 14 * 1024 * 1024, activeSessions: 2, totalSessions: 7, maxConnections: 100 },
  uploads: { bytes: 2.5 * GB, files: 1_204, complete: true },
  disk: { totalBytes: 931 * GB, freeBytes: 412 * GB, measured: "uploads", low: false },
  storedFiles: [{ storage: "local", files: 1_204, bytes: 2.5 * GB }],
  runtime: {
    production: true,
    buildId: "K-FRREVeFuWdOFpWQed7K",
    builtAt: new Date("2026-11-01T13:44:00Z"),
    startedAt: new Date("2026-11-01T13:47:00Z"),
    nodeVersion: "v22.23.3",
    storageDriver: "local",
  },
  failures: { rows: [], unavailableSources: [] },
};

async function render(overrides: Partial<Reading> = {}): Promise<{ html: string; text: string }> {
  mocks.console.mockResolvedValue({ ...healthy, ...overrides });
  // React adds its own form-replay script for the sign-out form; it is not page content.
  const html = renderToStaticMarkup(await SystemHealthPage()).replace(/<script>[\s\S]*?<\/script>/g, "");
  const text = html
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return { html, text };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("System health page", () => {
  it("shows the server's readings in plain words", async () => {
    const { text } = await render();

    expect(text).toContain("Free disk space412 GB");
    expect(text).toContain("Free of 931 GB · 56% used");
    expect(text).toContain("The disk that holds uploaded files.");
    expect(text).toContain("Uploaded files2.5 GB");
    expect(text).toContain("1,204 files in the uploads folder on this server.");
    expect(text).toContain("Database size14 MB");
    expect(text).toContain("7 of 100 connections in use · 2 busy right now");
    expect(text).toContain("Last backupUnknown");
    expect(text).toContain("this page can't tell when the last one was made");
    expect(text).toContain(`Built${formatDateTime(healthy.runtime.builtAt as Date)}`);
    expect(text).toContain("Build numberK-FRREVeFuWdOFpWQed7K");
    expect(text).toContain(`Running since${formatDateTime(healthy.runtime.startedAt)} (4 hours ago)`);
    expect(text).toContain("Node.jsv22.23.3");
    expect(text).toContain("New files are saved to This server's disk.");
    expect(text).toContain("1,204 files · 2.5 GB");
    expect(text).toContain("No saved failures");
    expect(text).not.toMatch(/Running low|Close to the limit|At least|Counting stopped/);
  });

  it("no longer shows the retired Cloudflare and PlanetScale hosting or its costs", async () => {
    const { html } = await render();

    for (const retired of ["Cloudflare", "PlanetScale", "Hyperdrive", "Worker", "Cost control", "$"]) {
      expect(html).not.toContain(retired);
    }
  });

  it("says plainly when a reading can't be taken", async () => {
    const { text } = await render({ disk: null, uploads: null, database: null, storedFiles: null });

    expect(text.match(/Can't read/g)).toHaveLength(3);
    expect(text).toContain("The app isn't allowed to check this disk.");
    expect(text).toContain("The uploads folder couldn't be read.");
    expect(text).toContain("The database didn't share its size and connections.");
    expect(text).toContain("The list of saved files couldn't be read from the database.");
    expect(text).not.toMatch(/NaN|undefined|null|Infinity/);
  });

  it("warns about a nearly full disk, a busy database and a count that stopped early", async () => {
    const { text } = await render({
      disk: { totalBytes: 100 * GB, freeBytes: 5 * GB, measured: "app", low: true },
      database: { storageBytes: 30 * 1024 * 1024, activeSessions: 40, totalSessions: 85, maxConnections: 100 },
      uploads: { bytes: 3 * GB, files: 50_000, complete: false },
    });

    expect(text).toContain("Running low. Free up space or add a bigger disk.");
    expect(text).toContain("Free of 100 GB · 95% used");
    expect(text).toContain("The disk the app runs from.");
    expect(text).toContain("Close to the limit. Sign-ins and pages may start to fail.");
    expect(text).toContain("Uploaded filesAt least 3 GB");
    expect(text).toContain("Counting stopped after a few seconds, so there is more than this.");
  });

  it("points to where new files really go when it isn't this server's disk", async () => {
    const { text } = await render({
      runtime: { ...healthy.runtime, storageDriver: "r2" },
      storedFiles: [
        { storage: "r2", files: 312, bytes: 480 * 1024 * 1024 },
        { storage: "local", files: 1, bytes: 40 * 1024 },
      ],
    });

    expect(text).toContain("New files go to Cloudflare R2 online storage, not this folder.");
    expect(text).toContain("New files are saved to Cloudflare R2 online storage.");
    expect(text).toContain("Cloudflare R2 online storage312 files · 480 MB");
    expect(text).toContain("This server's disk1 file · 40 KB");
  });

  it("calls a development copy what it is instead of describing a build", async () => {
    const { text } = await render({
      runtime: { ...healthy.runtime, production: false, buildId: null, builtAt: null },
      storedFiles: [],
    });

    expect(text).toContain("BuiltDevelopment copy on this computer, not the live site");
    expect(text).not.toContain("Build number");
    expect(text).not.toContain("Actions on GitHub");
    expect(text).toContain("No files have been saved yet.");
  });

  it("lists saved failures as text, newest first, and says which sources couldn't be checked", async () => {
    const { html, text } = await render({
      failures: {
        rows: [
          {
            id: "webhook-w1",
            kind: "webhook",
            title: `Webhook delivery · ${HOSTILE}`,
            shopName: HOSTILE,
            message: "Delivery failed with HTTP 500 after 5 attempts.",
            occurredAt: new Date("2026-11-01T16:00:00Z"),
          },
          {
            id: "payments-s1",
            kind: "payments",
            title: "Stripe webhook setup error",
            shopName: "Gadget Lab",
            message: "Invalid API key [redacted key]",
            occurredAt: new Date("2026-10-30T09:00:00Z"),
          },
        ],
        unavailableSources: ["accounting integrations"],
      },
    });

    expect(html).not.toContain(HOSTILE);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(text).toContain("2 records");
    expect(text).toContain("Some of these couldn't be checked: accounting integrations.");
    expect(text.indexOf("Webhook delivery")).toBeLessThan(text.indexOf("Stripe webhook setup error"));
    expect(text).toContain("2 hours ago");
    expect(text).toContain("Payments");
    expect(text).not.toContain("No saved failures");
    expect(text).toContain("They are only in the app's log on the server.");
  });
});
