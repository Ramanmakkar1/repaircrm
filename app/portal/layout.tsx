import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your repairs — RepairFlow",
  description: "Track your repairs, estimates and invoices.",
  robots: { index: false, follow: false },
};

/**
 * Deliberately a pass-through.
 *
 * The portal's chrome lives in `PortalShell` (a component each page opts into)
 * rather than here, because /portal/invoices/[id]/print must render as a bare
 * sheet of paper — and a layout cannot be opted out of.
 *
 * There is no auth check at this level either: /portal itself is the public
 * sign-in page. Every page below it calls `requirePortalCustomer()`, which is
 * also what scopes its queries — so the guard and the tenant filter can never
 * drift apart.
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
