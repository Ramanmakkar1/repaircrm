import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { locationWhere } from "@/lib/location";
import { attentionItems, attentionTotal } from "@/components/counter/attention";
import { loadAttentionCounts } from "@/components/counter/attention-data";

/**
 * GET /api/app-search/attention -> { total, items: [{ key, label, hint, href, count, photo }] }
 *
 * The "Needs you" counts for the bell in the controls row and the badge on the
 * phone tab bar: the same numbers Home shows. Polled by the shell every minute
 * and after each screen change, so a reply or a repair marked ready shows up
 * wherever the person is.
 *
 * 401 rather than a redirect, as /api/app-search does: a fetch would follow a
 * redirect to /login and get HTML back. The role is re-read from the database
 * (a demoted owner must stop seeing the unpaid count at once), and a
 * deactivated account gets nothing.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await db.user.findFirst({
    where: { id: session.userId, shopId: session.shopId },
    select: { active: true, role: true },
  });
  if (!account?.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branch = await locationWhere();
  const counts = await loadAttentionCounts({ shopId: session.shopId, role: account.role }, branch);
  const items = attentionItems(counts, account.role);

  return NextResponse.json(
    { total: attentionTotal(items), items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
