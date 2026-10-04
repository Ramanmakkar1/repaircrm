import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { safeTimeZone } from "@/lib/dashboard/logic";
import { drawerTakings, shopDayLabel } from "@/components/pos/drawer-history";
import { PAYMENT_METHOD_LABELS } from "@/components/statements/query";
import { formatDate, formatDateTime } from "@/components/billing/format";
import { shopTime } from "@/components/billing/shop-clock";
import {
  Masthead,
  MetaTable,
  SectionHead,
  SheetFooter,
  SignatureBlock,
  type PrintMetaRow,
  type PrintParty,
} from "@/components/billing/print-chrome";
import { PrintToolbar } from "@/components/billing/print-toolbar";

export const dynamic = "force-dynamic";

/**
 * The end-of-day report: one drawer session, on paper, for the shop's own file.
 * (Accountants call it a Z-report; the shop does not.)
 *
 * Every time is the shop's own clock (`Shop.timezone`), never the server's. Above
 * the cash count it shows what came in while the drawer was open, split by how
 * people paid, with the refunds given back.
 *
 * Built from the SAME print chrome as the invoice, estimate and work order
 * (masthead, meta table, section heads, footer) rather than reinventing a
 * layout — a shop's paperwork should look like it came from one place. It is a
 * letter sheet, not a thermal slip: this is a document that goes in a folder
 * next to the day's banking, not something torn off a spool.
 *
 * Scoped by shopId like every other print route, so a drawer id from another
 * tenant 404s rather than printing.
 */

/**
 * The document title is the filename the browser's print dialog proposes, so it
 * carries the day this drawer was opened. Scoped like the render; `getSession`
 * rather than `requireUser` because metadata must not redirect.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!session) return { title: "End-of-day report · Repairs helper" };

  const drawer = await db.cashDrawerSession.findFirst({
    where: { id, shopId: session.shopId },
    select: { openedAt: true, shop: { select: { timezone: true } } },
  });
  return {
    title: drawer
      ? `End-of-day report ${formatDate(drawer.openedAt, safeTimeZone(drawer.shop.timezone))} · Repairs helper`
      : "End-of-day report · Repairs helper",
  };
}

export default async function DrawerZReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { shopId } = await requireUser();
  const { id } = await params;

  const [session, shop] = await Promise.all([
    db.cashDrawerSession.findFirst({
      where: { id, shopId },
      select: {
        id: true,
        openedAt: true,
        closedAt: true,
        openingCents: true,
        expectedCents: true,
        countedCents: true,
        note: true,
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
      },
    }),
    db.shop.findUnique({
      where: { id: shopId },
      select: {
        name: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        phone: true,
        logoUrl: true,
        timezone: true,
      },
    }),
  ]);

  if (!session || !shop) notFound();
  const zone = safeTimeZone(shop.timezone);

  // What came in (and went back out) while this drawer was open, every way
  // people paid. Payments and refunds are append-only, so a reprint next
  // month shows the same figures. Scoped by shop like everything here.
  const window = { gte: session.openedAt, ...(session.closedAt ? { lte: session.closedAt } : {}) };
  const [methodGroups, refundGroups] = await Promise.all([
    db.payment.groupBy({
      by: ["method"],
      where: { shopId, createdAt: window },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    db.refund.groupBy({
      by: ["method"],
      where: { shopId, createdAt: window, status: { not: "failed" } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);
  const takingsByMethod = drawerTakings(
    methodGroups.map((group) => ({ method: group.method, cents: group._sum.amountCents ?? 0, count: group._count._all })),
    refundGroups.map((group) => ({ method: group.method, cents: group._sum.amountCents ?? 0, count: group._count._all })),
  );

  // The takings are derived from the two stored figures rather than re-queried:
  // a report reprinted next month must show what was true at close, not what
  // the till would say today.
  const expected = session.expectedCents;
  const counted = session.countedCents;
  const takings =
    expected === null ? null : expected - session.openingCents;
  const difference =
    expected === null || counted === null ? null : counted - expected;

  const shopParty: PrintParty = {
    name: shop.name,
    lines: [
      shop.address1,
      shop.address2,
      [[shop.city, shop.state].filter(Boolean).join(", "), shop.postalCode]
        .filter(Boolean)
        .join(" "),
      shop.phone,
    ].filter((line): line is string => Boolean(line && line.trim())),
  };

  const meta: PrintMetaRow[] = [
    { label: "Opened", value: formatDateTime(session.openedAt, zone) },
    {
      label: "Closed",
      value: session.closedAt ? formatDateTime(session.closedAt, zone) : "Still open",
    },
    { label: "Opened by", value: session.openedBy.name },
    { label: "Closed by", value: session.closedBy?.name ?? "—" },
  ];

  return (
    <>
      <PrintToolbar
        backHref="/pos/drawers"
        backLabel="Back to cash drawers"
        title={`End-of-day report · ${shopDayLabel(session.openedAt, zone)}`}
      />

      <article className="rf-sheet">
        <div className="rf-body">
          <Masthead
            shop={shopParty}
            logoUrl={shop.logoUrl}
            docLabel="End of day"
            docNumber={formatDate(session.openedAt, zone)}
            note={session.closedAt ? null : "Drawer still open"}
          />

          <section className="rf-cols">
            <div className="rf-col">
              <h2 className="rf-eyebrow">Session</h2>
              <div className="rf-party-name">
                {shopTime(session.openedAt, zone)} –{" "}
                {session.closedAt ? shopTime(session.closedAt, zone) : "still open"}
              </div>
              <div className="rf-party-lines">
                <div>{shop.name} · counter register</div>
              </div>
            </div>
            <MetaTable rows={meta} />
          </section>

          {/* ------------------------------------------ takings, and the count -- */}
          {/* Two columns so the page is used: what came in by method on the
              left, the cash count on the right. */}
          <section className="rf-section rf-cols" style={{ marginTop: "0.3in" }}>
            <div className="rf-col" style={{ flex: 1 }}>
              <SectionHead title="Money in while open" />
              <table className="rf-mini">
                <thead>
                  <tr>
                    <th scope="col">How they paid</th>
                    <th scope="col" style={{ textAlign: "right" }}>Payments</th>
                    <th scope="col" style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {takingsByMethod.rows.map((row) => (
                    <tr key={row.method}>
                      <td>{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</td>
                      <td className="rf-num">{row.count}</td>
                      <td className="rf-num">{formatCents(row.cents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Refunds given back</td>
                    <td className="rf-num">{takingsByMethod.refundCount}</td>
                    <td className="rf-num">
                      {takingsByMethod.refundCents > 0 ? `-${formatCents(takingsByMethod.refundCents)}` : formatCents(0)}
                    </td>
                  </tr>
                  <tr className="is-strong">
                    <td><strong>Total after refunds</strong></td>
                    <td />
                    <td className="rf-num"><strong>{formatCents(takingsByMethod.netCents)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rf-col" style={{ flex: "none", width: "3.1in" }}>
              <SectionHead title="Cash in the drawer" />
              <div className="rf-totals-panel">
                <table className="rf-totals">
                  <tbody>
                    <tr>
                      <td className="rf-t-label">Opening float</td>
                      <td className="rf-t-value">
                        {formatCents(session.openingCents)}
                      </td>
                    </tr>
                    <tr>
                      <td className="rf-t-label">Cash in, less cash refunds</td>
                      <td className="rf-t-value">
                        {takings === null ? "—" : formatCents(takings)}
                      </td>
                    </tr>
                    <tr className="is-strong">
                      <td className="rf-t-label">Expected in drawer</td>
                      <td className="rf-t-value">
                        {expected === null ? "—" : formatCents(expected)}
                      </td>
                    </tr>
                    <tr>
                      <td className="rf-t-label">Counted</td>
                      <td className="rf-t-value">
                        {counted === null ? "—" : formatCents(counted)}
                      </td>
                    </tr>
                    <tr className="is-strong">
                      <td className="rf-t-label">
                        {difference === null
                          ? "Difference"
                          : difference === 0
                            ? "Balanced"
                            : difference > 0
                              ? "Over"
                              : "Short"}
                      </td>
                      <td className="rf-t-value">
                        {difference === null
                          ? "—"
                          : `${difference > 0 ? "+" : ""}${formatCents(difference)}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* --------------------------------------------------------- note -- */}
          <section className="rf-section rf-avoid">
            <SectionHead title="Notes" />
            <p className="rf-note" style={{ marginTop: 0 }}>
              {session.note ?? "No note recorded at close."}
            </p>
          </section>

          {/* ---------------------------------------------------- signature -- */}
          <section className="rf-section rf-avoid">
            <SignatureBlock
              caption="Counted and agreed — signature / date"
              width="3.2in"
            />
          </section>
        </div>

        <SheetFooter
          message="Filed with the day's banking."
          contact={shop.phone ?? null}
        />
      </article>
    </>
  );
}
