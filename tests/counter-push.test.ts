import {beforeEach, describe, expect, it, vi} from "vitest";
import {callsTo, dataOf, handlers, resetDb, whereOf} from "./helpers/db-mock";
vi.mock("@/lib/db", async () => ({db: (await import("./helpers/db-mock")).fakeClient}));
vi.mock("@/lib/auth", () => ({requireUser: async () => ({shopId: "s1", userId: "u1"})}));
const jar = vi.hoisted(() => ({get: vi.fn(() => ({value: "device"})), set: vi.fn(), delete: vi.fn()}));
vi.mock("next/headers", () => ({cookies: async () => jar}));
vi.mock("@/lib/push/send", () => ({sendPush: vi.fn(async () => {})}));
vi.mock("@/components/counter/attention-data", () => ({loadAttentionCounts: vi.fn(async () => ({ready: 2, overdue: 0, replies: 0, enquiries: 0, unpaid: 3, low: 0}))}));
import {validPushEndpoint, increasedCounts} from "@/lib/push/validation";
import {sendPush} from "@/lib/push/send";
import {clearRateLimit} from "@/lib/rate-limit";
import {subscribePushAction, unsubscribePushAction, testPushAction} from "@/app/(app)/settings/push-actions";
import {runStaffPushForShop} from "@/lib/jobs/push";
const subscription = {endpoint: "https://fcm.googleapis.com/fcm/send/demo", keys: {p256dh: "a".repeat(87), auth: "b".repeat(22)}};
beforeEach(() => {resetDb(); vi.clearAllMocks(); vi.mocked(sendPush).mockResolvedValue({statusCode: 201, body: "", headers: {}}); clearRateLimit("push-subscribe:u1"); clearRateLimit("push-test:u1"); handlers["pushSubscription.upsert"] = () => ({id: "device"}); handlers["pushSubscription.deleteMany"] = () => ({count: 1});});
describe("staff phone notifications", () => {
 it.each(["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://example.com/x", "https://fcm.googleapis.com.evil.test/x", "https://user:pass@fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x"])('rejects non-push endpoints %s', endpoint => {expect(validPushEndpoint(endpoint)).toBe(false);});
 it.each(["https://fcm.googleapis.com/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/x", "https://wns2.notify.windows.com/x"])('accepts browser service %s', endpoint => {expect(validPushEndpoint(endpoint)).toBe(true);});
 it("saves a subscription for the current account without trusting client tenant IDs", async () => {expect(await subscribePushAction({...subscription, shopId: "other", userId: "other"})).toEqual({ok: true}); expect(dataOf("pushSubscription.upsert")).toEqual({}); const arg=callsTo("pushSubscription.upsert")[0].args; expect(arg.create).toMatchObject({shopId: "s1", userId: "u1"}); expect(jar.set).toHaveBeenCalled();});
 it("rejects arbitrary network targets before storing anything", async () => {expect(await subscribePushAction({...subscription, endpoint: "https://localhost/x"})).toMatchObject({ok: false}); expect(callsTo("pushSubscription.upsert")).toHaveLength(0);});
 it("removes only this browser's current-user subscription", async () => {await unsubscribePushAction(); expect(whereOf("pushSubscription.deleteMany")).toEqual({id: "device", shopId: "s1", userId: "u1"}); expect(jar.delete).toHaveBeenCalled();});
 it("does not alert again for identical or decreasing counts", () => {expect(increasedCounts({ready: 2}, {ready: 2})).toBe(false); expect(increasedCounts({ready: 1}, {ready: 2})).toBe(false); expect(increasedCounts({ready: 3}, {ready: 2})).toBe(true);});
 it("sends only after claiming new counts, without customer data or technician money counts", async () => {
  handlers["pushSubscription.findMany"] = () => [{id: "device", ...subscription, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updatedAt: new Date(0), lastCounts: {}, user: {active: true, role: "TECH", defaultLocationId: null}}];
  handlers["shop.findUnique"] = () => ({pushPublicKey: "pub", pushPrivateKey: "secret"}); handlers["pushSubscription.updateMany"] = () => ({count: 1});
  await runStaffPushForShop("s1"); expect(whereOf("pushSubscription.findMany")).toEqual({shopId: "s1"}); expect(sendPush).toHaveBeenCalledWith(expect.anything(), {publicKey: "pub", privateKey: "secret"}, expect.objectContaining({body: expect.stringContaining("2 things"), url: "/"})); expect(dataOf("pushSubscription.updateMany").lastCounts).not.toHaveProperty("unpaid");
 });
 it("tests only the signed-in device, and never returns private keys", async () => {handlers["pushSubscription.findFirst"] = () => ({id: "device", ...subscription}); handlers["shop.findUnique"] = () => ({pushPublicKey: "pub", pushPrivateKey: "secret"}); expect(await testPushAction()).toEqual({ok: true}); expect(whereOf("pushSubscription.findFirst")).toEqual({id: "device", shopId: "s1", userId: "u1"});});
});
