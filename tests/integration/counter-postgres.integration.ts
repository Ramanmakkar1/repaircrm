import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {PrismaClient} from "@prisma/client";
const verificationUrl = process.env.VERIFICATION_DATABASE_URL;
if (!verificationUrl) throw new Error("Set VERIFICATION_DATABASE_URL to an isolated local verification database.");
const target = new URL(verificationUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(target.hostname) || !/^\/verification(?:_[a-z0-9_-]+)?$/.test(target.pathname)) throw new Error("Refusing a database outside the local verification environment.");
const control = vi.hoisted(() => ({url: process.env.VERIFICATION_DATABASE_URL,failCard: false, failedCardWrites: 0, raceCharge: "", staleInvoice: "", shopId: "", userId: ""}));
vi.mock("@/lib/auth", async () => {const bcrypt = (await import("bcryptjs")).default; return {hashPassword: async (value: string) => bcrypt.hash(value, 10), verifyPassword: (value: string, hash: string) => bcrypt.compare(value, hash), sessionFor: (user: {id: string; shopId: string; role: string}) => ({userId: user.id, shopId: user.shopId, role: user.role}), requireUser: async () => ({shopId: control.shopId, userId: control.userId, role: "OWNER", name: "Verifier"}), requireRole: async () => ({shopId: control.shopId, userId: control.userId, role: "OWNER"})};});
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: (url: string) => {throw new Error(`REDIRECT:${url}`);}}));
vi.mock("@/lib/events", () => ({emitPaymentEvent: vi.fn(), emitInvoiceEvent: vi.fn(), emitTicketEvent: vi.fn(), emitCustomerEvent: vi.fn()}));
vi.mock("@/lib/location", () => ({newRecordLocationId: async () => null, shopDefaultLocationId: async () => null}));
vi.mock("@/lib/session", () => ({setSessionCookie: vi.fn()}));
vi.mock("@/lib/push/device", () => ({clearPushDevice: vi.fn()}));
vi.mock("@/lib/audit", () => ({audit: vi.fn()}));
vi.mock("@/lib/db", async () => {
 const {PrismaClient} = await import("@prisma/client"); const base = new PrismaClient({datasourceUrl: control.url});
 const client = base.$extends({query: {payment: {async create({args, query}) {if (control.failCard && args.data.method === "CARD") {control.failedCardWrites += 1; throw new Error("Forced second-tender failure");} return query(args);}}, ticket: {async findFirst({args, query}) {const row = await query(args); if (row && control.raceCharge) {const id = control.raceCharge; control.raceCharge = ""; await base.ticketCharge.update({where: {id}, data: {invoiceId: control.staleInvoice}});} return row;}}}});
 return {db: client};
});
import {recordPayment} from "@/lib/payments/record";
import {performCheckout} from "@/app/(app)/pos/checkout";
import {makeInvoiceAction} from "@/app/(app)/tickets/actions";
import bcrypt from "bcryptjs";
import {saveStaffPinAction, switchStaffAction} from "@/app/(app)/staff-switch/actions";
import {searchBookingCustomersAction} from "@/app/(app)/appointments/actions";
import {findDuplicateCustomers} from "@/lib/customers/duplicates";
const db = new PrismaClient({datasourceUrl: control.url}); let customerId = ""; let invoiceId = "";
beforeAll(async () => {
 const shop = await db.shop.create({data: {name: "Isolated verification", slug: `verify-${crypto.randomUUID()}`, timezone: "America/Edmonton"}}); control.shopId = shop.id;
 const user = await db.user.create({data: {shopId: shop.id, name: "Verifier", email: `verify-${crypto.randomUUID()}@example.test`, passwordHash: await bcrypt.hash("local-password", 10), role: "OWNER"}}); control.userId = user.id;
 const customer = await db.customer.create({data: {shopId: shop.id, firstName: "Local", lastName: "Customer", mobile: "+1 (780) 555-1234"}}); customerId = customer.id;
 const invoice = await db.invoice.create({data: {shopId: shop.id, customerId, number: 1, status: "SENT", lines: {create: [{description: "Repair", unitPriceCents: 10000, quantity: 1, taxable: false}]}}}); invoiceId = invoice.id; control.staleInvoice = invoice.id;
});
afterAll(async () => {if (control.shopId) await db.shop.delete({where: {id: control.shopId}}); await db.$disconnect();});
describe("real PostgreSQL counter workflows", () => {
 it("rolls back the first cash row when the second card row fails", async () => {
  const failures = control.failedCardWrites; control.failCard = true; const result = await recordPayment({shopId: control.shopId, invoiceId, amountCents: 10000, method: "CARD", cashPartCents: 3000}); control.failCard = false;
  expect(control.failedCardWrites).toBe(failures + 1); expect(result).toMatchObject({ok: false}); expect(await db.payment.count({where: {invoiceId}})).toBe(0); expect((await db.invoice.findUniqueOrThrow({where: {id: invoiceId}})).status).toBe("SENT");
 });
 it("stores both split parts and settles the same invoice", async () => {
  expect(await recordPayment({shopId: control.shopId, invoiceId, amountCents: 10000, method: "CARD", cashPartCents: 3000})).toMatchObject({ok: true, settled: true});
  const payments = await db.payment.findMany({where: {invoiceId}, orderBy: {amountCents: "asc"}}); expect(payments.map(p => [p.method,p.amountCents])).toEqual([["CASH",3000],["CARD",7000]]);
 });
 it("rolls back the entire sale if its second tender fails", async () => {
  const before = await db.invoice.count({where: {shopId: control.shopId}}); const failures = control.failedCardWrites; control.failCard = true;
  const result = await performCheckout({shopId: control.shopId, userId: control.userId}, {lines: [{productId: null, description: "Local service", unitPriceCents: 10000, quantity: 1, taxable: false}], customerId, method: "SPLIT", cashAmountCents: 3000, tenderedCents: 3000, reference: null}); control.failCard = false;
  expect(control.failedCardWrites).toBe(failures + 1); expect(result).toMatchObject({ok: false}); expect(await db.invoice.count({where: {shopId: control.shopId}})).toBe(before);
 });
 it("completes a sale with two tenders, one invoice, and cash-only change", async () => {
  const result = await performCheckout({shopId: control.shopId, userId: control.userId}, {lines: [{productId: null, description: "Local service", unitPriceCents: 10000, quantity: 1, taxable: false}], customerId, method: "SPLIT", cashAmountCents: 3000, tenderedCents: 5000, reference: "local approval"});
  expect(result).toMatchObject({ok: true, method: "SPLIT", totalCents: 10000, changeDueCents: 2000});
  if (!result.ok) throw new Error(result.error);
  const invoice = await db.invoice.findUniqueOrThrow({where: {id: result.invoiceId}, include: {payments: true}});
  expect(invoice.status).toBe("PAID"); expect(invoice.payments.map(p => [p.method,p.amountCents]).sort()).toEqual([["CARD",7000],["CASH",3000]]);
 });
 it("rolls back the repair invoice when a competing cashier attached the charge after the read", async () => {
  const ticket = await db.ticket.create({data: {shopId: control.shopId, customerId, number: 1, subject: "Race check", problemType: "Other"}});
  const charge = await db.ticketCharge.create({data: {shopId: control.shopId, ticketId: ticket.id, description: "Bench work", quantity: 1, unitPriceCents: 1000, taxable: false}}); control.raceCharge = charge.id;
  const before = await db.invoice.count({where: {shopId: control.shopId}});
  expect(await makeInvoiceAction(ticket.id, {includeTime: false})).toHaveProperty("error");
  expect(await db.invoice.count({where: {shopId: control.shopId}})).toBe(before); expect((await db.ticketCharge.findUniqueOrThrow({where: {id: charge.id}})).invoiceId).toBe(invoiceId);
 });
 it("finds normalized existing phone numbers and never another shop's customers", async () => {
  expect(await findDuplicateCustomers(control.shopId, "7805551234")).toMatchObject([{id: customerId}]); expect(await findDuplicateCustomers("other-shop", "7805551234")).toEqual([]);
 });
 it("searches a customer beyond the first 500 records", async () => {
  await db.customer.createMany({data: Array.from({length: 501}, (_, i) => ({shopId: control.shopId, firstName: "Picker", lastName: `Customer ${i}`}))});
  const last = await db.customer.create({data: {shopId: control.shopId, firstName: "Beyond", lastName: "Fivehundred"}});
  const result = await searchBookingCustomersAction("Fivehundred"); expect(result.customers).toMatchObject([{value: last.id}]);
 });
 it("persists a bcrypt PIN and uses it to switch with the live role", async () => {
  const form = new FormData(); form.set("password", "local-password"); form.set("pin", "864209"); form.set("confirm", "864209");
  expect(await saveStaffPinAction({}, form)).toHaveProperty("message");
  const account = await db.user.findUniqueOrThrow({where: {id: control.userId}}); expect(account.pinHash).toMatch(/^\$2[aby]\$/); expect(await bcrypt.compare("864209", account.pinHash!)).toBe(true);
  const switchForm = new FormData(); switchForm.set("userId", control.userId); switchForm.set("pin", "864209"); await expect(switchStaffAction({}, switchForm)).rejects.toThrow("REDIRECT:/");
 });
});
