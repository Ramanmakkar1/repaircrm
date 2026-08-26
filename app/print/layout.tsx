import { requireUser } from "@/lib/auth";

/**
 * Print routes deliberately live OUTSIDE the (app) route group.
 *
 * A print view has to be a bare sheet of paper: no sidebar, no topbar, no
 * scroll container. Rendering it inside the app shell and then hiding the
 * chrome with print CSS works, but it fights the shell's `h-dvh`/`overflow`
 * layout and leaves a second, broken-looking copy of the app on screen. Its own
 * top-level segment is simply the honest structure — and it still runs
 * `requireUser()`, so it is exactly as protected as the rest of the app.
 */
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

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
  /* Table headers repeat and rows never split across a page break. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  /* Keep the dark table head and zebra striping on paper. */
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
`;
