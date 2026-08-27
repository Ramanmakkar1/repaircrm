/**
 * Print scaffolding for the portal's PDF view.
 *
 * The rules are a copy of the ones in app/print/layout.tsx rather than a shared
 * import, and that is on purpose: that file is a LAYOUT, and its whole job is to
 * run `requireUser()` — the staff guard. The portal's copy of the same sheet is
 * authorised by the `rf_portal` cookie instead, so it cannot live under that
 * layout, and hoisting the CSS into a shared module would mean editing a file
 * this change does not own for no behavioural gain. Forty lines of print CSS is
 * a cheaper duplication than a coupling between two different auth boundaries.
 *
 * The markup itself IS shared — `PrintSheet` renders both.
 */
export function PortalPrintRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-root min-h-dvh bg-neutral-100 py-0 print:bg-white">
      <style>{PRINT_CSS}</style>
      {children}
    </div>
  );
}

const PRINT_CSS = `
.print-root {
  color-scheme: light;
}
.print-sheet {
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 8px 24px rgb(0 0 0 / 0.08);
  min-height: 10.4in;
  padding-top: 2.25rem;
}
.print-sheet .watermark {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@page {
  size: letter;
  margin: 0.5in;
}
@media print {
  .no-print { display: none !important; }
  html, body, .print-root {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .print-sheet {
    box-shadow: none !important;
    max-width: none !important;
    min-height: 0 !important;
    padding-top: 0 !important;
    margin: 0 !important;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;

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
