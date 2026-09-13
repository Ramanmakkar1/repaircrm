import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";

import { getSession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
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
 * The Z-report: one drawer session, on paper, for the shop's own file.
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
  if (!session) return { title: "Cash drawer Z-report · RepairPilot" };

  const drawer = await db.cashDrawerSession.findFirst({
    where: { id, shopId: session.shopId },
    select: { openedAt: true },
  });
  return {
    title: drawer
      ? `Z-report ${format(drawer.openedAt, "d MMM yyyy")} · RepairPilot`
      : "Cash drawer Z-report · RepairPilot",
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
      },
    }),
  ]);

  if (!session || !shop) notFound();

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
    { label: "Opened", value: format(session.openedAt, "MMM d, yyyy · h:mm a") },
    {
      label: "Closed",
      value: session.closedAt
        ? format(session.closedAt, "MMM d, yyyy · h:mm a")
        : "Still open",
    },
    { label: "Opened by", value: session.openedBy.name },
    { label: "Closed by", value: session.closedBy?.name ?? "—" },
  ];

  return (
    <>
      <PrintToolbar
        backHref="/pos/drawers"
        backLabel="Back to drawers"
        title={`Drawer · ${format(session.openedAt, "MMM d")}`}
      />

      <article className="rf-sheet">
        <div className="rf-body">
          <Masthead
            shop={shopParty}
            logoUrl={shop.logoUrl}
            docLabel="Drawer report"
            docNumber={format(session.openedAt, "MMM d, yyyy")}
            note={session.closedAt ? null : "Drawer still open"}
          />

          <section className="rf-cols">
            <div className="rf-col">
              <h2 className="rf-eyebrow">Session</h2>
              <div className="rf-party-name">
                {format(session.openedAt, "h:mm a")} –{" "}
                {session.closedAt ? format(session.closedAt, "h:mm a") : "open"}
              </div>
              <div className="rf-party-lines">
                <div>{shop.name} · counter register</div>
              </div>
            </div>
            <MetaTable rows={meta} />
          </section>

          {/* ---------------------------------------------------- the count -- */}
          <section className="rf-section">
            <SectionHead title="Cash reconciliation" aside="Z-report" />

            <div className="rf-totals-wrap">
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
                      <td className="rf-t-label">Cash taken (net of refunds)</td>
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
