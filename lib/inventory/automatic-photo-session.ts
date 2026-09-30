import { getSession, passwordVersion } from "@/lib/auth";
import { appOrigin } from "@/lib/comms/config";
import { db } from "@/lib/db";

export function automaticPhotoSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === appOrigin(request.url) || origin === new URL(request.url).origin;
}

export async function automaticPhotoSession() {
  const session = await getSession();
  if (!session) return null;
  const account = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { active: true, passwordChangedAt: true, mustChangePassword: true },
  });
  if (!account?.active || account.mustChangePassword || (session.pv ?? 0) < passwordVersion(account.passwordChangedAt)) return null;
  return session;
}
