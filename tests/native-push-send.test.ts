import { generateKeyPairSync, verify } from "node:crypto";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { callsTo, handlers, resetDb, whereOf } from "./helpers/db-mock";

vi.mock("@/lib/db", async () => ({ db: (await import("./helpers/db-mock")).fakeClient }));
vi.mock("@/components/counter/attention-data", () => ({
  loadAttentionCounts: vi.fn(async () => ({ ready: 2, overdue: 1, replies: 0, enquiries: 0, unpaid: 3, low: 0 })),
}));

import { apnsConfig, resetApnsCache, sendApns } from "@/lib/push/apns";
import { fcmConfig, resetFcmCache, sendFcm } from "@/lib/push/fcm";
import { nativePushPlatforms, sendNativePush } from "@/lib/push/native";
import { runStaffPushForShop } from "@/lib/jobs/push";
import { collectFindings } from "@/lib/preflight";

const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const P8 = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const RSA_PEM = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const IOS_TOKEN = "a1".repeat(32);
const message = { title: "Repairs helper", body: "2 things need attention.", url: "/tickets/42" };

const ENV_KEYS = [
  "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_KEY_P8", "APNS_BUNDLE_ID", "APNS_ENV", "APNS_API_BASE",
  "FCM_SERVICE_ACCOUNT_JSON", "FCM_API_BASE", "FCM_TOKEN_URL",
];
const saved: Record<string, string | undefined> = {};

function decode(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

// ---------------------------------------------------------------- fake APNs (h2c)
type ApnsSeen = { headers: http2.IncomingHttpHeaders; body: string };
let apnsServer: http2.Http2Server;
let apnsBase = "";
const apnsSeen: ApnsSeen[] = [];
let apnsReply: (path: string) => { status: number; body?: string } = () => ({ status: 200 });

beforeAll(async () => {
  apnsServer = http2.createServer();
  apnsServer.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => (body += chunk));
    stream.on("end", () => {
      apnsSeen.push({ headers, body });
      const reply = apnsReply(String(headers[":path"]));
      stream.respond({ ":status": reply.status, "content-type": "application/json" });
      stream.end(reply.body ?? "");
    });
  });
  await new Promise<void>((resolve) => apnsServer.listen(0, "127.0.0.1", resolve));
  apnsBase = `http://127.0.0.1:${(apnsServer.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => apnsServer.close(() => resolve())));

function setApnsEnv() {
  process.env.APNS_KEY_ID = "KEY1234567";
  process.env.APNS_TEAM_ID = "TEAM123456";
  process.env.APNS_KEY_P8 = P8.replace(/\n/g, "\\n"); // as a one-line env value
  process.env.APNS_BUNDLE_ID = "com.repairshelper.app";
  process.env.APNS_API_BASE = apnsBase;
}

function setFcmEnv() {
  process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: "service_account",
    project_id: "repairs-helper",
    client_email: "push@repairs-helper.iam.gserviceaccount.com",
    private_key: RSA_PEM,
    token_uri: "https://oauth2.example.test/token",
  });
  process.env.FCM_API_BASE = "https://fcm.example.test";
}

// ---------------------------------------------------------------- fake FCM (fetch)
type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[] = [];
let fcmReply: () => Response = () => new Response(JSON.stringify({ name: "projects/x/messages/1" }), { status: 200 });
function installFetch() {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).endsWith("/token")) {
        return new Response(JSON.stringify({ access_token: "ya29.fake", expires_in: 3599 }), { status: 200 });
      }
      return fcmReply();
    }),
  );
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetApnsCache();
  resetFcmCache();
  resetDb();
  apnsSeen.length = 0;
  apnsReply = () => ({ status: 200 });
  fcmReply = () => new Response(JSON.stringify({ name: "projects/x/messages/1" }), { status: 200 });
  installFetch();
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

describe("fail closed", () => {
  it("is off without env, and sends nothing", async () => {
    expect(apnsConfig()).toBeNull();
    expect(fcmConfig()).toBeNull();
    expect(nativePushPlatforms()).toEqual([]);
    expect(await sendApns(IOS_TOKEN, message)).toMatchObject({ ok: false, gone: false });
    expect(await sendFcm("tok", message)).toMatchObject({ ok: false, gone: false });
    expect(apnsSeen).toHaveLength(0);
    expect(fetchCalls).toHaveLength(0);
  });

  it("treats a mangled key as missing", () => {
    setApnsEnv();
    process.env.APNS_KEY_P8 = "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----";
    expect(apnsConfig()).toBeNull();
    process.env.FCM_SERVICE_ACCOUNT_JSON = "{not json";
    expect(fcmConfig()).toBeNull();
  });

  it("the job does not even query devices when no provider is configured", async () => {
    handlers["pushSubscription.findMany"] = () => [];
    await runStaffPushForShop("s1");
    expect(callsTo("nativePushDevice.findMany")).toHaveLength(0);
  });
});

describe("APNs", () => {
  it("POSTs an ES256-signed alert to /3/device/<token> with url beside aps", async () => {
    setApnsEnv();
    expect(await sendApns(IOS_TOKEN, message)).toEqual({ ok: true });
    const [seen] = apnsSeen;
    expect(seen.headers[":method"]).toBe("POST");
    expect(seen.headers[":path"]).toBe(`/3/device/${IOS_TOKEN}`);
    expect(seen.headers["apns-topic"]).toBe("com.repairshelper.app");
    expect(seen.headers["apns-push-type"]).toBe("alert");
    const payload = JSON.parse(seen.body);
    expect(payload).toEqual({
      aps: { alert: { title: message.title, body: message.body }, sound: "default" },
      url: "/tickets/42",
    });

    const jwt = String(seen.headers.authorization).replace(/^bearer /, "");
    const [h, c, s] = jwt.split(".");
    expect(decode(h)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(decode(c)).toMatchObject({ iss: "TEAM123456" });
    expect(
      verify("sha256", Buffer.from(`${h}.${c}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")),
    ).toBe(true);
  });

  it("reuses the provider token between sends", async () => {
    setApnsEnv();
    await sendApns(IOS_TOKEN, message);
    await sendApns(IOS_TOKEN, message);
    expect(apnsSeen[0].headers.authorization).toBe(apnsSeen[1].headers.authorization);
  });

  it("uses the sandbox host when APNS_ENV=sandbox", () => {
    setApnsEnv();
    delete process.env.APNS_API_BASE;
    process.env.APNS_ENV = "sandbox";
    expect(apnsConfig()?.base).toBe("https://api.sandbox.push.apple.com");
    process.env.APNS_ENV = "production";
    expect(apnsConfig()?.base).toBe("https://api.push.apple.com");
  });

  it.each([
    [410, '{"reason":"Unregistered"}', true],
    [400, '{"reason":"BadDeviceToken"}', true],
    [403, '{"reason":"InvalidProviderToken"}', false],
    [429, '{"reason":"TooManyRequests"}', false],
    [500, "", false],
  ])("HTTP %i %s → gone=%s", async (status, body, gone) => {
    setApnsEnv();
    apnsReply = () => ({ status, body });
    expect(await sendApns(IOS_TOKEN, message)).toMatchObject({ ok: false, gone });
  });

  it("reports an unreachable host as retryable", async () => {
    setApnsEnv();
    process.env.APNS_API_BASE = "http://127.0.0.1:1";
    expect(await sendApns(IOS_TOKEN, message)).toMatchObject({ ok: false, gone: false });
  });
});

describe("FCM HTTP v1", () => {
  it("swaps an RS256 assertion for a bearer token, then sends to the project", async () => {
    setFcmEnv();
    expect(await sendFcm("fcm-token", message)).toEqual({ ok: true });
    expect(fetchCalls.map((c) => c.url)).toEqual([
      "https://oauth2.example.test/token",
      "https://fcm.example.test/v1/projects/repairs-helper/messages:send",
    ]);

    const form = new URLSearchParams(String(fetchCalls[0].init.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [h, c, s] = String(form.get("assertion")).split(".");
    expect(decode(h)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(c)).toMatchObject({
      iss: "push@repairs-helper.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.example.test/token",
    });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), rsa.publicKey, Buffer.from(s, "base64url"))).toBe(true);

    const send = fetchCalls[1];
    expect((send.init.headers as Record<string, string>).authorization).toBe("Bearer ya29.fake");
    expect(JSON.parse(String(send.init.body))).toEqual({
      message: {
        token: "fcm-token",
        notification: { title: message.title, body: message.body },
        data: { url: "/tickets/42" },
        android: { priority: "HIGH", ttl: "3600s", notification: { channel_id: "shop" } },
      },
    });
  });

  it("caches the access token", async () => {
    setFcmEnv();
    await sendFcm("a", message);
    await sendFcm("b", message);
    expect(fetchCalls.filter((c) => c.url.endsWith("/token"))).toHaveLength(1);
  });

  it("marks UNREGISTERED tokens gone, and other errors retryable", async () => {
    setFcmEnv();
    fcmReply = () =>
      new Response(
        JSON.stringify({ error: { code: 404, status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }),
        { status: 404 },
      );
    expect(await sendFcm("dead", message)).toEqual({ ok: false, gone: true, reason: "UNREGISTERED" });
    fcmReply = () => new Response(JSON.stringify({ error: { status: "UNAVAILABLE" } }), { status: 503 });
    expect(await sendFcm("live", message)).toMatchObject({ ok: false, gone: false });
  });
});

describe("sendNativePush", () => {
  it("deletes a token the provider reports invalid, scoped to its shop", async () => {
    setApnsEnv();
    apnsReply = () => ({ status: 410, body: '{"reason":"Unregistered"}' });
    handlers["nativePushDevice.deleteMany"] = () => ({ count: 1 });
    await sendNativePush({ id: "d1", shopId: "s1", platform: "ios", token: IOS_TOKEN }, message);
    expect(whereOf("nativePushDevice.deleteMany")).toEqual({ id: "d1", shopId: "s1" });
  });

  it("keeps a token after a transient failure", async () => {
    setFcmEnv();
    fcmReply = () => new Response("", { status: 500 });
    await sendNativePush({ id: "d2", shopId: "s1", platform: "android", token: "t" }, message);
    expect(callsTo("nativePushDevice.deleteMany")).toHaveLength(0);
  });
});

describe("staff attention job → native devices", () => {
  it("sends the same digest as web push to configured platforms only", async () => {
    setFcmEnv(); // Android configured, iOS not.
    handlers["pushSubscription.findMany"] = () => [];
    handlers["nativePushDevice.findMany"] = () => [
      { id: "d1", shopId: "s1", platform: "android", token: "tok", lastCounts: {}, updatedAt: new Date(0), user: { active: true, role: "TECH", defaultLocationId: null } },
    ];
    handlers["nativePushDevice.updateMany"] = () => ({ count: 1 });
    await runStaffPushForShop("s1");

    expect(whereOf("nativePushDevice.findMany")).toEqual({ shopId: "s1", platform: { in: ["android"] } });
    const send = fetchCalls.find((c) => c.url.includes("messages:send"));
    const body = JSON.parse(String(send?.init.body));
    expect(body.message.notification.body).toContain("things need attention");
    expect(body.message.data.url).toBe("/");
    // Technicians never see money counts.
    const claimed = callsTo("nativePushDevice.updateMany")[0].args.data as { lastCounts: Record<string, number> };
    expect(claimed.lastCounts).not.toHaveProperty("unpaid");
  });

  it("does not repeat a digest for unchanged counts", async () => {
    setFcmEnv();
    handlers["pushSubscription.findMany"] = () => [];
    handlers["nativePushDevice.findMany"] = () => [
      { id: "d1", shopId: "s1", platform: "android", token: "tok", lastCounts: { ready: 2, replies: 0, overdue: 1, enquiries: 0, low: 0 }, updatedAt: new Date(0), user: { active: true, role: "TECH", defaultLocationId: null } },
    ];
    await runStaffPushForShop("s1");
    expect(fetchCalls).toHaveLength(0);
  });

  it("drops devices of deactivated staff", async () => {
    setApnsEnv();
    handlers["pushSubscription.findMany"] = () => [];
    handlers["nativePushDevice.findMany"] = () => [
      { id: "d9", shopId: "s1", platform: "ios", token: IOS_TOKEN, lastCounts: null, updatedAt: new Date(0), user: { active: false, role: "OWNER", defaultLocationId: null } },
    ];
    handlers["nativePushDevice.deleteMany"] = () => ({ count: 1 });
    await runStaffPushForShop("s1");
    expect(whereOf("nativePushDevice.deleteMany")).toEqual({ id: "d9", shopId: "s1" });
    expect(apnsSeen).toHaveLength(0);
  });
});

describe("preflight", () => {
  it("warns about half-configured native push and is silent when all or nothing is set", () => {
    const warns = () => collectFindings().warn.filter((w) => /APNS|FCM/.test(w));
    expect(warns()).toEqual([]);
    process.env.APNS_KEY_ID = "KEY1234567";
    expect(warns().join(" ")).toMatch(/APNS_TEAM_ID/);
    setApnsEnv();
    expect(warns()).toEqual([]);
    process.env.FCM_SERVICE_ACCOUNT_JSON = '{"project_id":"x"}';
    expect(warns().join(" ")).toMatch(/FCM_SERVICE_ACCOUNT_JSON/);
  });
});
