import {beforeEach, describe, expect, it, vi} from "vitest";
import {handlers, resetDb} from "./helpers/db-mock";
vi.mock("@/lib/db", async () => ({db: (await import("./helpers/db-mock")).fakeClient}));
vi.mock("next/navigation", () => ({redirect: (url: string) => {throw new Error(`REDIRECT:${url}`);}}));
const session = vi.hoisted(() => ({userId: "u1", shopId: "s1", role: "OWNER", email: "a@example.test", name: "A", pv: 0, pinv: "version"}));
vi.mock("@/lib/session", () => ({readSessionCookie: async () => session, setSessionCookie: vi.fn(), clearSessionCookie: vi.fn()}));
import {getSession, requireUser} from "@/lib/auth";
beforeEach(() => {resetDb(); handlers["user.findFirst"] = () => ({active: true, role: "TECH", email: "a@example.test", passwordChangedAt: null, pinHash: "hash", pinVersion: "version", totpEnabledAt: null, mustChangePassword: false});});
describe("live PIN session guard", () => {
 it("refreshes the role for nullable API guards", async () => {expect(await getSession()).toMatchObject({role: "TECH"});});
 it.each([{active: false}, {pinVersion: "new"}, {pinHash: null}, {totpEnabledAt: new Date()}, {mustChangePassword: true}, {passwordChangedAt: new Date()}])("rejects stale PIN cookies in nullable API guards %s", async changes => {handlers["user.findFirst"] = () => ({active: true, role: "TECH", email: "a@example.test", passwordChangedAt: null, pinHash: "hash", pinVersion: "version", ...changes}); expect(await getSession()).toBeNull();});
 it("uses the current database role rather than the earlier owner role", async () => {expect(await requireUser()).toMatchObject({role: "TECH"});});
 it.each([{pinVersion: "new"}, {pinHash: null}, {totpEnabledAt: new Date()}, {mustChangePassword: true}])("revokes a PIN session when credentials or requirements change %s", async changes => {handlers["user.findFirst"] = () => ({active: true, role: "TECH", email: "a@example.test", passwordChangedAt: null, pinHash: "hash", pinVersion: "version", ...changes}); await expect(requireUser()).rejects.toThrow("REDIRECT:/session-expired?reason=password");});
});
