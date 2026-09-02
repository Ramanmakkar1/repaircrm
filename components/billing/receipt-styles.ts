/**
 * The 80mm thermal receipt stylesheet.
 *
 * Shared by the sale receipt and the deposit receipt: both come off the same
 * spool, on the same 203dpi head, and a deposit slip that looked like a
 * different shop's paperwork would be its own small betrayal of trust.
 *
 * A plain string rather than a CSS file because these pages render inside the
 * print layout and need to WIN on document order — `@page { size: 80mm auto }`
 * has to override the layout's letter-sized page box.
 */
export const RECEIPT_CSS = `
.receipt-sheet {
  --rc-ink: #000;
  --rc-dim: #3f3f3f;
  width: 80mm;
  margin: 28px auto 56px;
  padding: 7mm 6mm 9mm;
  background: #fff;
  color: var(--rc-ink);
  font-family: var(--rf-mono, ui-monospace), SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  box-shadow:
    0 0 0 1px rgb(16 20 24 / 0.07),
    0 1px 2px rgb(16 20 24 / 0.1),
    0 20px 44px -14px rgb(16 20 24 / 0.28);
}
.rc-center { text-align: center; }
.rc-shop {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.25;
  margin-bottom: 3px;
}
.rc-dim { color: var(--rc-dim); }
.rc-rule {
  border-top: 1px dashed #8a8a8a;
  margin: 9px 0;
}
.rc-meta-row, .rc-total-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.rc-meta > * + * { margin-top: 1px; }
.rc-meta-row > span:last-child { font-weight: 700; text-align: right; }
.rc-lines > * + * { margin-top: 7px; }
.rc-line-name {
  font-weight: 700;
  letter-spacing: -0.01em;
  word-break: break-word;
}
.rc-line-figures {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-left: 10px;
}
.rc-amount { white-space: nowrap; }
.rc-totals > * + * { margin-top: 3px; }
.rc-ref { padding-left: 10px; font-size: 10px; }
.rc-grand, .rc-change {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid var(--rc-ink);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.rc-change { font-size: 14px; }
.rc-owing { border-top-width: 2px; }
.rc-footer { margin-top: 14px; }
.rc-thanks {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rc-policy {
  margin: 4px 0 9px;
  font-size: 9.5px;
  line-height: 1.45;
  color: var(--rc-dim);
}
.rc-footer svg { max-width: 100%; height: auto; margin: 0 auto; }

/* A receipt is roll stock, not a page: fixed width, unlimited length. */
@page { size: 80mm auto; margin: 3mm; }

@media print {
  .receipt-sheet {
    width: auto;
    margin: 0;
    padding: 0;
    box-shadow: none;
    font-size: 11px;
  }
}
`;
