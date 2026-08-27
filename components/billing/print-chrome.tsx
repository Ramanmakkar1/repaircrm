import * as React from "react";

import { Barcode } from "./barcode";

/**
 * The pieces every printable RepairFlow document is assembled from.
 *
 * Invoice, estimate, statement and work-order sheets are genuinely different
 * documents — they do not share a layout — but they must share a *voice*: the
 * same masthead proportions, the same meta table, the same footer. Those live
 * here so a change to the house style lands on all four at once, and so a new
 * sheet cannot accidentally invent its own.
 *
 * Everything is presentational and server-renderable; the only client component
 * in the tree is `Barcode`, which has to mutate a live SVG node.
 */

export type PrintParty = {
  name: string;
  /** Address/contact lines, already filtered of empties. */
  lines: string[];
};

export type PrintMetaRow = { label: string; value: string };

/** "Demo Repair Shop" -> "D". Falls back to a bullet for an unnamed shop. */
export function monogram(name: string): string {
  const first = name.trim().match(/[\p{L}\p{N}]/u);
  return first ? first[0].toUpperCase() : "•";
}

/**
 * The shop's mark: its uploaded logo when it has one, otherwise a monogram tile.
 *
 * A missing logo is the common case on day one, and an empty rectangle reads as
 * a broken image. The tile is a deliberate design element instead — the same
 * one the app shell uses — so an un-branded shop still prints something
 * confident rather than something unfinished.
 */
export function ShopMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl?: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="rf-logo" src={logoUrl} alt={name} />
    );
  }
  return (
    <div className="rf-mark" aria-hidden>
      {monogram(name)}
    </div>
  );
}

/**
 * The masthead band: who is sending the document (left) and what it is (right).
 * `note` is the red qualifier under the number — "Void", "Not a bill".
 */
export function Masthead({
  shop,
  logoUrl,
  docLabel,
  docNumber,
  note,
}: {
  shop: PrintParty;
  logoUrl?: string | null;
  docLabel: string;
  docNumber?: string;
  note?: string | null;
}) {
  return (
    <header className="rf-band">
      <div className="rf-ident">
        <ShopMark name={shop.name} logoUrl={logoUrl} />
        <div>
          <div className="rf-shop-name">{shop.name}</div>
          <div className="rf-shop-lines">
            {shop.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="rf-doc">
        <div className="rf-doctype">{docLabel}</div>
        {docNumber ? <div className="rf-docnum">{docNumber}</div> : null}
        {note ? <div className="rf-docnote">{note}</div> : null}
      </div>
    </header>
  );
}

/** The right-hand key/value table under the masthead. */
export function MetaTable({ rows }: { rows: PrintMetaRow[] }) {
  return (
    <table className="rf-meta">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A labelled name-and-address block ("Bill to", "Customer", "Account"). */
export function PartyBlock({
  label,
  party,
}: {
  label: string;
  party: PrintParty;
}) {
  return (
    <div className="rf-col">
      <h2 className="rf-eyebrow">{label}</h2>
      <div className="rf-party-name">{party.name}</div>
      {party.lines.length > 0 ? (
        <div className="rf-party-lines">
          {party.lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Section heading in the house eyebrow style, with an optional right-side aside. */
export function SectionHead({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="rf-section-head">
      <h2 className="rf-eyebrow">{title}</h2>
      {aside ? <div className="rf-eyebrow">{aside}</div> : null}
    </div>
  );
}

/**
 * Footer: scannable document code bottom-left, thank-you and shop contact
 * bottom-right. The barcode is the reason it is a flex row rather than centred
 * text — a counter clerk scans it to pull the document up, so it needs the
 * quiet zone a corner gives it.
 */
export function SheetFooter({
  barcode,
  message,
  contact,
}: {
  barcode?: string | null;
  message: string;
  contact?: string | null;
}) {
  return (
    <footer className="rf-foot">
      <div className="rf-foot-code">
        {barcode ? <Barcode value={barcode} height={34} width={1.4} /> : null}
      </div>
      <div className="rf-foot-text">
        <div className="rf-thanks">{message}</div>
        {contact ? <div>{contact}</div> : null}
      </div>
    </footer>
  );
}

/** The rotated PAID / VOID / APPROVED stamp behind the document body. */
export function Stamp({
  label,
  tone = "accent",
}: {
  label: string;
  tone?: "accent" | "alarm";
}) {
  return (
    <div className="rf-stamp" aria-hidden>
      <span className={tone === "alarm" ? "is-alarm" : undefined}>{label}</span>
    </div>
  );
}

/**
 * A signature: the captured image when there is one, an empty ruled line when
 * there is not. A printed document that expects a signature should show *where*
 * it goes, not silently omit the block.
 */
export function SignatureBlock({
  caption,
  dataUrl,
  width,
}: {
  caption: string;
  dataUrl?: string | null;
  width?: string;
}) {
  return (
    <div className="rf-sign" style={width ? { width } : undefined}>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rf-sign-img rf-sign-rule" src={dataUrl} alt={caption} />
      ) : (
        <div className="rf-sign-blank rf-sign-rule" />
      )}
      <div className="rf-sign-cap">{caption}</div>
    </div>
  );
}

/** One label/value pair inside a `.rf-fields` grid. */
export function Field({
  label,
  value,
  mono = false,
  span = 1,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  span?: number;
}) {
  return (
    <div style={span > 1 ? { gridColumn: `span ${span}` } : undefined}>
      <div className="rf-field-label">{label}</div>
      <div className={`rf-field-value${mono ? " is-mono" : ""}`}>{value}</div>
    </div>
  );
}

/** Dashed tear line with a scissors glyph — where the stub gets cut off. */
export function CutLine({ label = "✂" }: { label?: string }) {
  return (
    <div className="rf-cut" aria-hidden>
      <span>{label}</span>
    </div>
  );
}

/**
 * "Net 30" / "Due on receipt" — payment terms are not a column in the schema,
 * they are the gap between the issue date and the due date, so they are derived
 * rather than stored (and stay honest when either date is edited).
 */
export function termsLabel(
  issuedAt: Date,
  dueDate: Date | null | undefined
): string {
  if (!dueDate) return "Due on receipt";
  const days = Math.round(
    (dueDate.getTime() - issuedAt.getTime()) / 86_400_000
  );
  if (days <= 0) return "Due on receipt";
  return `Net ${days}`;
}

/** Whole days `date` is in the past; 0 when it is today or later. */
export function daysPast(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}
