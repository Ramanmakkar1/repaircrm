/**
 * The one visual family every printable RepairPilot document shares.
 *
 * This is a plain string of CSS — no imports, no server code — precisely so the
 * two print roots that live on opposite sides of an auth boundary can both use
 * it without coupling:
 *
 *   • app/print/layout.tsx            — staff, guarded by `requireUser()`
 *   • app/portal/_components/print-root.tsx — customer, guarded by `rf_portal`
 *
 * Those two components stay separate (their guards are genuinely different).
 * What used to be duplicated between them was forty lines of print CSS, which
 * meant an invoice could silently print differently depending on who asked for
 * it. Sharing the *stylesheet* — and only the stylesheet — fixes that without
 * touching either guard.
 *
 * Design rules encoded below:
 *  - Black-on-white first. The accent is a single deep petrol blue used for the
 *    masthead rule, the document wordmark, the balance panel and the stamp; it
 *    reads as dark grey on a monochrome laser printer, so nothing depends on it.
 *  - Every dimension that lands on paper is in inches or points, not rems. A
 *    sheet is a physical object and `@page` already speaks inches.
 *  - `@page` sets margins but NOT a paper size, so the same sheet composes
 *    correctly on US Letter (8.5×11) and A4 (8.27×11.69). The 0.5in margin
 *    leaves a 7.5in column on Letter and 7.27in on A4; no fixed-width element
 *    below exceeds 7.2in, so nothing clips on the narrower stock.
 */
export const PRINT_BASE_CSS = `
.print-root {
  color-scheme: light;

  /* ------------------------------------------------------------- palette -- */
  --rf-ink: #101418;
  --rf-ink-soft: #545d69;
  --rf-ink-faint: #868e99;
  --rf-rule: #e0e4e9;
  --rf-rule-mid: #b6bdc6;
  --rf-accent: #0f3355;
  --rf-accent-soft: #3d668f;
  --rf-alarm: #8c2f22;
  --rf-tint: #f1f5f9;
  --rf-paper: #ffffff;

  /* ---------------------------------------------------------- typography -- */
  --rf-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --rf-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono",
    monospace;

  min-height: 100dvh;
  background: #e7eaee;
  padding: 0 16px;
  font-family: var(--rf-sans);
}

/* ============================================================== toolbar === */
/* The only interactive chrome on a print route; @media print removes it. */
.rf-toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 -16px;
  padding: 10px 18px;
  background: #14181d;
  color: #e9ecf0;
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.06), 0 10px 24px -14px rgb(0 0 0 / 0.7);
}
.rf-toolbar-back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: #aab2bd;
  text-decoration: none;
  transition: color 0.15s ease;
}
.rf-toolbar-back:hover { color: #ffffff; }
.rf-toolbar-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6f7885;
}
.rf-toolbar-actions { display: flex; align-items: center; gap: 8px; }
.rf-toolbar-print {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 13px;
  border: 0;
  border-radius: 6px;
  background: #ffffff;
  color: #14181d;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.rf-toolbar-print:hover { background: #d8dde3; }
.rf-toolbar-print:active { transform: translateY(1px); }
.rf-toolbar-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid #333a43;
  border-radius: 6px;
  background: transparent;
  color: #c3cad3;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}
.rf-toolbar-ghost:hover { border-color: #4b545f; color: #ffffff; }
.rf-toolbar-label {
  font-size: 12px;
  font-weight: 500;
  color: #8b93a0;
}
/* Segmented preset picker (label counts) — reads as one control, not five. */
.rf-seg {
  display: flex;
  overflow: hidden;
  border: 1px solid #333a43;
  border-radius: 6px;
}
.rf-seg button {
  height: 32px;
  min-width: 34px;
  padding: 0 9px;
  border: 0;
  border-right: 1px solid #333a43;
  background: transparent;
  color: #c3cad3;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.rf-seg button:last-child { border-right: 0; }
.rf-seg button:hover { background: #21262d; color: #ffffff; }
.rf-seg button[aria-pressed="true"] {
  background: #ffffff;
  color: #14181d;
  font-weight: 700;
}
.rf-count {
  height: 32px;
  width: 62px;
  padding: 0 8px;
  border: 1px solid #333a43;
  border-radius: 6px;
  background: transparent;
  color: #e9ecf0;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: center;
  outline: none;
}
.rf-count:focus { border-color: #7e8894; }

/* ================================================================ sheet === */
.rf-sheet {
  position: relative;
  width: 100%;
  max-width: 8.5in;
  min-height: 10.6in;
  margin: 28px auto 56px;
  padding: 0.55in 0.6in 0.5in;
  background: var(--rf-paper);
  color: var(--rf-ink);
  font-size: 9.5pt;
  line-height: 1.5;
  box-shadow:
    0 0 0 1px rgb(16 20 24 / 0.07),
    0 1px 2px rgb(16 20 24 / 0.1),
    0 20px 44px -14px rgb(16 20 24 / 0.28);
}
.rf-body { position: relative; z-index: 1; }

/* ============================================================= masthead === */
.rf-band {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.4in;
  padding-top: 0.16in;
  padding-bottom: 0.2in;
  border-top: 3px solid var(--rf-accent);
  border-bottom: 1px solid var(--rf-rule-mid);
}
.rf-ident { display: flex; align-items: flex-start; gap: 0.15in; min-width: 0; }
.rf-mark {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0.52in;
  height: 0.52in;
  border-radius: 5px;
  background: var(--rf-accent);
  color: #ffffff;
  font-size: 17pt;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.01em;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rf-logo {
  flex: none;
  height: 0.55in;
  width: auto;
  max-width: 2.2in;
  object-fit: contain;
  object-position: left center;
}
.rf-shop-name {
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: -0.005em;
  line-height: 1.15;
}
.rf-shop-lines {
  margin-top: 0.045in;
  font-size: 8.5pt;
  line-height: 1.5;
  color: var(--rf-ink-soft);
}
.rf-doc { flex: none; text-align: right; }
.rf-doctype {
  font-size: 23pt;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--rf-accent);
  /* Trailing letter-space would push a right-aligned wordmark off the edge. */
  margin-right: -0.2em;
}
.rf-docnum {
  margin-top: 0.06in;
  font-family: var(--rf-mono);
  font-size: 11pt;
  font-variant-numeric: tabular-nums;
  color: var(--rf-ink);
}
.rf-docnote {
  margin-top: 0.05in;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rf-alarm);
}

/* ================================================== parties + meta table === */
.rf-cols {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5in;
  margin-top: 0.24in;
}
.rf-col { min-width: 0; }
.rf-eyebrow {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--rf-ink-faint);
}
.rf-party-name {
  margin-top: 0.055in;
  font-size: 11pt;
  font-weight: 600;
  line-height: 1.25;
}
.rf-party-lines {
  margin-top: 0.03in;
  font-size: 8.5pt;
  line-height: 1.55;
  color: var(--rf-ink-soft);
}
.rf-meta {
  flex: none;
  border-collapse: collapse;
  min-width: 2.55in;
}
.rf-meta th {
  padding: 0.05in 0.4in 0.05in 0;
  border-bottom: 1px solid var(--rf-rule);
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  color: var(--rf-ink-faint);
}
.rf-meta td {
  padding: 0.05in 0 0.05in 0;
  border-bottom: 1px solid var(--rf-rule);
  font-family: var(--rf-mono);
  font-size: 8.5pt;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.rf-meta tr:first-child th, .rf-meta tr:first-child td { padding-top: 0; }
.rf-meta tr:last-child th, .rf-meta tr:last-child td { border-bottom: 0; }

/* ============================================================== sections === */
.rf-section { margin-top: 0.3in; }
.rf-section-tight { margin-top: 0.2in; }
.rf-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.2in;
  margin-bottom: 0.08in;
}
.rf-avoid { break-inside: avoid; page-break-inside: avoid; }

/* =========================================================== items table === */
.rf-items { width: 100%; border-collapse: collapse; }
.rf-items th {
  padding: 0 0.09in 0.07in;
  border-bottom: 1.5px solid var(--rf-ink);
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-align: left;
  color: var(--rf-ink-soft);
  white-space: nowrap;
}
.rf-items td {
  padding: 0.075in 0.09in;
  border-bottom: 1px solid var(--rf-rule);
  vertical-align: top;
}
.rf-items th:first-child, .rf-items td:first-child { padding-left: 0; }
.rf-items th:last-child, .rf-items td:last-child { padding-right: 0; }
.rf-items tbody tr:last-child td { border-bottom: 1px solid var(--rf-rule-mid); }
/* Keeps the totals panel welded to the final row of the table. */
.rf-items tbody tr:last-child { break-after: avoid; page-break-after: avoid; }
.rf-item-desc { font-weight: 500; line-height: 1.4; }
.rf-item-sub {
  margin-top: 0.02in;
  font-family: var(--rf-mono);
  font-size: 7.5pt;
  letter-spacing: 0.02em;
  color: var(--rf-ink-faint);
}
.rf-num {
  font-family: var(--rf-mono);
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.rf-mark-tax {
  margin-left: 0.15em;
  font-size: 6.5pt;
  font-weight: 700;
  vertical-align: super;
  color: var(--rf-accent-soft);
}
/* A statement lists seven columns where an invoice lists four; the type steps
   down rather than the columns wrapping. */
.rf-items.is-dense th,
.rf-items.is-dense td { font-size: 8.5pt; }
.rf-items.is-dense td { padding-top: 0.055in; padding-bottom: 0.055in; }
.rf-items tr.is-overdue td { color: var(--rf-alarm); }
.rf-items tr.is-overdue .rf-num { font-weight: 700; }
.rf-empty {
  padding: 0.2in 0;
  text-align: center;
  font-size: 9pt;
  color: var(--rf-ink-faint);
}
.rf-footnote {
  margin-top: 0.07in;
  font-size: 7.5pt;
  color: var(--rf-ink-faint);
}

/* ================================================================ totals === */
.rf-totals-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.16in;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rf-totals-panel { width: 3.3in; max-width: 100%; }
.rf-totals { width: 100%; border-collapse: collapse; }
.rf-totals td { padding: 0.045in 0; font-size: 9pt; }
.rf-t-label { text-align: right; padding-right: 0.3in; color: var(--rf-ink-soft); }
.rf-t-value {
  text-align: right;
  font-family: var(--rf-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.rf-totals tr.is-strong td {
  border-top: 1px solid var(--rf-rule-mid);
  padding-top: 0.065in;
  font-weight: 600;
  color: var(--rf-ink);
}
.rf-balance {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.3in;
  margin-top: 0.1in;
  padding: 0.1in 0.14in;
  background: var(--rf-tint);
  border-top: 2px solid var(--rf-accent);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rf-balance-label {
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rf-accent);
}
.rf-balance-value {
  font-family: var(--rf-mono);
  font-size: 16pt;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  white-space: nowrap;
}

/* =========================================================== mini tables === */
.rf-mini { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
.rf-mini th {
  padding: 0 0.09in 0.05in;
  border-bottom: 1px solid var(--rf-rule-mid);
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left;
  color: var(--rf-ink-faint);
  white-space: nowrap;
}
.rf-mini td {
  padding: 0.05in 0.09in;
  border-bottom: 1px solid var(--rf-rule);
  vertical-align: top;
}
.rf-mini th:first-child, .rf-mini td:first-child { padding-left: 0; }
.rf-mini th:last-child, .rf-mini td:last-child { padding-right: 0; }
.rf-mini tr.is-overdue td { color: var(--rf-alarm); }
.rf-mini tr.is-overdue .rf-num { font-weight: 700; }
.rf-muted { color: var(--rf-ink-faint); }

/* ================================================================= chips === */
.rf-tag {
  display: inline-block;
  padding: 0.008in 0.05in;
  border: 1px solid currentColor;
  border-radius: 2px;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  line-height: 1.5;
  text-transform: uppercase;
  white-space: nowrap;
}
.rf-tag-accent { color: var(--rf-accent); }
.rf-tag-alarm { color: var(--rf-alarm); }

/* ============================================================== callout === */
.rf-callout {
  margin-top: 0.2in;
  padding: 0.1in 0.14in;
  border-left: 3px solid var(--rf-accent);
  background: var(--rf-tint);
  font-size: 8.5pt;
  line-height: 1.5;
  color: var(--rf-ink-soft);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rf-callout-title {
  display: block;
  margin-bottom: 0.03in;
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--rf-accent);
}
.rf-note {
  margin-top: 0.06in;
  font-size: 8.5pt;
  line-height: 1.55;
  color: var(--rf-ink-soft);
  white-space: pre-wrap;
}

/* ================================================================ aging === */
/* Five buckets sharing one hairline grid — the standard shape an accounts
   department expects to find on a statement. */
.rf-aging {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1px;
  margin-top: 0.18in;
  border: 1px solid var(--rf-rule-mid);
  background: var(--rf-rule-mid);
  break-inside: avoid;
  page-break-inside: avoid;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rf-aging > div {
  padding: 0.075in 0.1in;
  background: var(--rf-paper);
  text-align: right;
}
.rf-aging-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--rf-ink-faint);
}
.rf-aging-value {
  margin-top: 0.015in;
  font-family: var(--rf-mono);
  font-size: 9.5pt;
  font-variant-numeric: tabular-nums;
}
.rf-aging > div.is-alarm .rf-aging-label,
.rf-aging > div.is-alarm .rf-aging-value { color: var(--rf-alarm); }

/* ================================================== panels + ruled areas === */
.rf-panel {
  border: 1px solid var(--rf-rule-mid);
  border-radius: 3px;
  padding: 0.12in 0.14in;
}
.rf-panel-tint {
  background: var(--rf-tint);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rf-fields {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.12in 0.2in;
}
.rf-fields.is-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.rf-fields.is-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rf-fields.is-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.rf-field-label {
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rf-ink-faint);
}
.rf-field-value {
  margin-top: 0.015in;
  font-size: 9pt;
  font-weight: 500;
  line-height: 1.35;
  word-break: break-word;
}
.rf-field-value.is-mono {
  font-family: var(--rf-mono);
  font-size: 8.5pt;
}
/* A ruled writing area — the lines are a repeating gradient so they cost one
   element instead of a dozen empty divs, and they land exactly on 0.3in. */
.rf-ruled {
  border: 1px solid var(--rf-rule-mid);
  border-radius: 3px;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(0.3in - 1px),
    var(--rf-rule) calc(0.3in - 1px),
    var(--rf-rule) 0.3in
  );
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ============================================================ signatures === */
.rf-signs { display: flex; gap: 0.35in; margin-top: 0.28in; flex-wrap: wrap; }
.rf-sign { width: 3.1in; max-width: 100%; }
.rf-sign-img {
  display: block;
  height: 0.62in;
  width: 100%;
  object-fit: contain;
  object-position: left bottom;
}
.rf-sign-blank { height: 0.62in; }
.rf-sign-rule { border-bottom: 1px solid var(--rf-ink); }
.rf-sign-cap {
  margin-top: 0.05in;
  padding-top: 0.05in;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rf-ink-faint);
}

/* ================================================================ stamp === */
.rf-stamp {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;
}
.rf-stamp span {
  transform: rotate(-16deg);
  padding: 0.09in 0.34in;
  border: 0.045in double var(--rf-accent);
  border-radius: 0.06in;
  color: var(--rf-accent);
  opacity: 0.1;
  font-size: 42pt;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.rf-stamp span.is-alarm { color: var(--rf-alarm); border-color: var(--rf-alarm); }

/* =============================================================== footer === */
.rf-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.4in;
  margin-top: 0.34in;
  padding-top: 0.14in;
  border-top: 1px solid var(--rf-rule);
  break-inside: avoid;
  page-break-inside: avoid;
}
.rf-foot-code { flex: none; }
.rf-foot-code svg { display: block; height: 0.44in; width: auto; }
.rf-foot-text {
  text-align: right;
  font-size: 8pt;
  line-height: 1.5;
  color: var(--rf-ink-soft);
}
.rf-thanks {
  margin-bottom: 0.02in;
  font-size: 9.5pt;
  font-weight: 600;
  color: var(--rf-ink);
}

/* ============================================================ cut / stub === */
.rf-cut {
  position: relative;
  margin: 0.3in 0 0.16in;
  border-top: 1.5px dashed var(--rf-rule-mid);
  break-before: avoid;
  page-break-before: avoid;
}
.rf-cut span {
  position: absolute;
  top: -0.085in;
  left: 0;
  padding-right: 0.08in;
  background: var(--rf-paper);
  font-size: 8pt;
  line-height: 1;
  color: var(--rf-ink-faint);
}
.rf-stub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.3in;
  padding: 0.13in 0.15in;
  border: 1px solid var(--rf-rule-mid);
  border-radius: 3px;
  break-inside: avoid;
  page-break-inside: avoid;
}
.rf-stub-main { min-width: 0; }
.rf-stub-title {
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--rf-ink-faint);
}
.rf-stub-number {
  margin-top: 0.02in;
  font-family: var(--rf-mono);
  font-size: 15pt;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.rf-stub-lines {
  margin-top: 0.04in;
  font-size: 8.5pt;
  line-height: 1.45;
  color: var(--rf-ink-soft);
}
.rf-stub-code { flex: none; text-align: right; }
.rf-stub-code svg { display: block; height: 0.5in; width: auto; }

/* ============================================================== @page ===== */
/* No 'size' on purpose: the sheet has to compose on Letter AND A4, so the
   paper the operator chose in the print dialog wins and only margins are set. */
@page { margin: 0.5in; }

@media print {
  .no-print, .rf-toolbar { display: none !important; }
  html, body, .print-root {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .rf-sheet {
    max-width: none !important;
    width: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
  }
  /* A long items table repeats its header on every sheet; individual rows,
     images and barcodes never straddle a page break. */
  thead { display: table-header-group; }
  tr, img, svg { break-inside: avoid; page-break-inside: avoid; }
  /* Tints (balance panel, stamp, monogram, ruled lines) must survive the
     browser's default "don't waste toner on backgrounds". */
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

/* Narrow screens: the sheet is a fixed physical object, so on a phone it just
   scales its padding rather than reflowing into something that is not a page. */
@media screen and (max-width: 900px) {
  .rf-sheet { padding: 0.4in 0.35in; min-height: 0; }
  .rf-cols { gap: 0.25in; }
}
`;
