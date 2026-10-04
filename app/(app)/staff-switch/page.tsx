import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffSwitch } from "./switch-form";
export const metadata = {title: "Switch staff · Repairs helper"};
export default async function Page() {
 const {shopId} = await requireUser();
 const staff = await db.user.findMany({where: {shopId, active: true, mustChangePassword: false, totpEnabledAt: null, pinHash: {not: null}, pinVersion: {not: null}}, select: {id: true, name: true}, orderBy: {name: "asc"}});
 return <StaffSwitch staff={staff} />;
}
