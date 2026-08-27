import { PRINT_BASE_CSS } from "@/components/billing/print-styles";

/**
 * Print scaffolding for the portal's PDF view.
 *
 * This stays a separate component from app/print/layout.tsx, and that is on
 * purpose: that file is a LAYOUT whose whole job is to run `requireUser()` —
 * the staff guard. The portal's copy of the same sheet is authorised by the
 * `rf_portal` cookie instead, so it cannot live under that layout.
 *
 * What the two now share is the stylesheet, and only the stylesheet. That is a
 * pure string with no imports and no auth surface, so importing it couples
 * nothing — while the duplicate copy it replaces was a real hazard: it meant an
 * invoice could print one way for the shop and another way for the customer,
 * and nothing in the type system would have said so.
 */
export function PortalPrintRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-root">
      <style>{PRINT_BASE_CSS}</style>
      {children}
    </div>
  );
}

/** Drops empty parts and joins the rest — no stray commas on a printed address. */
export function addressLines(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
}): string[] {
  const cityLine = [parts.city, parts.state].filter(Boolean).join(", ");
  const locality = [cityLine, parts.postalCode].filter(Boolean).join(" ");
  return [
    parts.address1,
    parts.address2,
    locality,
    parts.phone,
    parts.email,
  ].filter((line): line is string => Boolean(line && line.trim()));
}
