import * as React from "react";

import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { Barcode } from "./barcode";
import {
  CutLine,
  Field,
  Masthead,
  MetaTable,
  PartyBlock,
  SectionHead,
  SignatureBlock,
  Stamp,
  type PrintMetaRow,
  type PrintParty,
} from "./print-chrome";
import { PrintToolbar } from "./print-toolbar";

/**
 * The printable work order behind /print/tickets/[id].
 *
 * This is the sheet a shop physically attaches to the device: what came in, who
 * it belongs to, what they said was wrong, what has been done to it, and — torn
 * off along the dashed line at the bottom — the claim check the customer walks
 * out with. Everything on the stub is deliberately duplicated from the body,
 * because after the cut the two halves live in different places.
 *
 * The blank ruled area is not decoration. Technicians write on this in pen while
 * the machine is open, and a work order with no room to write gets replaced by
 * a sticky note.
 *
 * ONE PAGE. The whole sheet, claim check included, fits one US Letter page and
 * one A4 page (the `rf-wo` rules in print-styles.ts tighten the house spacing,
 * an empty charges table is one line, and the footer barcode lives on the stub
 * instead of twice). The claim check is handed over at the counter, so it must
 * never fall onto a second sheet.
 *
 * THE PASSCODE stays off the paper by default: this sheet is pinned to the
 * device and handed around the shop. It reads "On file" unless the page was
 * asked to print it (`showPasscode`, the toolbar's "Show passcode" link).
 */

export type TicketCharge = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
};

export type TicketDevice = {
  type: string;
  make?: string | null;
  model?: string | null;
  serial?: string | null;
  /** Unlock code captured at intake — printed so a tech is not hunting for it. */
  password?: string | null;
  notes?: string | null;
};

export function TicketSheet({
  number,
  shop,
  shopPhone,
  logoUrl,
  customer,
  meta,
  subject,
  problemType,
  device,
  diagnosis,
  charges,
  taxRateBps,
  intakeSignature,
  intakeSignedCaption,
  resolved,
  backHref,
  backLabel,
  chrome = true,
  terms,
  showPasscode = false,
  passcodeToggleHref,
}: {
  number: number;
  shop: PrintParty;
  shopPhone?: string | null;
  logoUrl?: string | null;
  customer: PrintParty;
  meta: PrintMetaRow[];
  subject: string;
  problemType: string;
  device: TicketDevice | null;
  diagnosis?: string | null;
  charges: TicketCharge[];
  taxRateBps: number;
  intakeSignature?: string | null;
  intakeSignedCaption: string;
  /** Draws the RESOLVED stamp — this device is finished. */
  resolved?: boolean;
  backHref: string;
  backLabel: string;
  /** See the note on `PrintSheet.chrome` — off when a batch page stacks sheets. */
  chrome?: boolean;
  terms: string;
  /** Print the device passcode itself rather than "On file". */
  showPasscode?: boolean;
  /** The same page with the passcode shown (or hidden again), for the toolbar. */
  passcodeToggleHref?: string;
}) {
  const totals = calcTotals(charges, taxRateBps);
  const code = `T${number}`;

  return (
    <>
      {chrome ? (
        <PrintToolbar
          backHref={backHref}
          backLabel={backLabel}
          title={`Work order #${number}`}
        >
          {passcodeToggleHref && device?.password ? (
            <a href={passcodeToggleHref} className="rf-toolbar-back">
              {showPasscode ? "Hide passcode" : "Show passcode"}
            </a>
          ) : null}
        </PrintToolbar>
      ) : null}

      <article className="rf-sheet rf-wo">
        {resolved ? <Stamp label="Resolved" /> : null}

        <div className="rf-body">
          <Masthead
            shop={shop}
            logoUrl={logoUrl}
            docLabel="Work order"
            docNumber={`No. ${number}`}
          />

          <section className="rf-cols">
            <PartyBlock label="Customer" party={customer} />
            <MetaTable rows={meta} />
          </section>

          {/* ---------------------------------------------------- device --- */}
          <section className="rf-section rf-avoid">
            <SectionHead title="Device" />
            <div className="rf-panel">
              {device ? (
                <>
                  {/* One row: what it is, its serial, the passcode, and how it came in. */}
                  <div className="rf-fields">
                    <Field
                      label="Device"
                      value={
                        [device.make, device.model].filter(Boolean).length > 0
                          ? `${[device.make, device.model].filter(Boolean).join(" ")} (${device.type})`
                          : device.type
                      }
                    />
                    <Field label="Serial / IMEI" value={device.serial || "—"} mono />
                    <Field
                      label="Passcode"
                      value={device.password ? (showPasscode ? device.password : "On file") : "None given"}
                      mono={Boolean(device.password && showPasscode)}
                    />
                    <Field label="Condition on intake" value={device.notes || "—"} />
                  </div>
                </>
              ) : (
                <div className="rf-field-value rf-muted">
                  No device recorded — counter service.
                </div>
              )}
            </div>
          </section>

          {/* ------------------------------------------ problem + diagnosis --- */}
          {/* Side by side when both are known, so the page keeps its room. */}
          <section className={`rf-section rf-avoid${diagnosis ? " rf-wo-split" : ""}`}>
            <div>
              <SectionHead title="What they said is wrong" aside={problemType} />
              <p className="rf-note" style={{ marginTop: 0, fontSize: "10pt" }}>
                {subject}
              </p>
            </div>
            {diagnosis ? (
              <div>
                <SectionHead title="What we found" />
                <p className="rf-note" style={{ marginTop: 0 }}>
                  {diagnosis}
                </p>
              </div>
            ) : null}
          </section>

          {/* --------------------------------------------------- charges --- */}
          {charges.length === 0 ? (
            <section className="rf-section-tight rf-avoid">
              <SectionHead title="Charges so far" />
              <p className="rf-note" style={{ marginTop: 0 }}>
                Nothing charged yet. Prices are added as the work is done.
              </p>
            </section>
          ) : (
          <section className="rf-section">
            <SectionHead title="Charges so far" aside="Not a receipt" />
            <table className="rf-items is-dense">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" style={{ width: "0.7in", textAlign: "right" }}>
                    Qty
                  </th>
                  <th scope="col" style={{ width: "1.1in", textAlign: "right" }}>
                    Rate
                  </th>
                  <th scope="col" style={{ width: "1.2in", textAlign: "right" }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {charges.map((charge) => (
                  <tr key={charge.id}>
                    <td className="rf-item-desc">{charge.description}</td>
                    <td className="rf-num">{charge.quantity}</td>
                    <td className="rf-num">{formatCents(charge.unitPriceCents)}</td>
                    <td className="rf-num">
                      {formatCents(charge.quantity * charge.unitPriceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* One line, not a three-row panel: this is the work so far, not a bill. */}
            <div className="rf-wo-total">
              <span>Subtotal {formatCents(totals.subtotalCents)}</span>
              <span>Tax, as it stands ({formatBps(taxRateBps)}) {formatCents(totals.taxCents)}</span>
              <strong>Total so far {formatCents(totals.totalCents)}</strong>
            </div>
          </section>
          )}

          {/* ------------------------------------------ technician notes --- */}
          <section className="rf-section-tight rf-avoid">
            <SectionHead title="Technician notes" aside="Work done / parts used" />
            {/* Two writing lines with charges on the sheet, four without. */}
            <div className="rf-ruled" style={{ height: charges.length > 0 ? "0.75in" : "1.2in" }} />
          </section>

          {/* ------------------------------------------------- signature --- */}
          <section className="rf-avoid">
            <div className="rf-signs">
              <SignatureBlock
                caption={intakeSignedCaption}
                dataUrl={intakeSignature}
              />
              <SignatureBlock caption="Released to / date" width="2.4in" />
            </div>
            <p className="rf-note rf-wo-terms">{terms}</p>
          </section>

          {/* The scannable code is on the claim check below, which is where
              the counter scans it; a second footer barcode cost the page. */}

          {/* ------------------------------------------------ claim stub --- */}
          <CutLine />
          <div className="rf-stub">
            <div className="rf-stub-main">
              <div className="rf-stub-title">Claim check</div>
              <div className="rf-stub-number">#{number}</div>
              <div className="rf-stub-lines">
                <div>
                  {customer.name} ·{" "}
                  {device
                    ? [device.make, device.model || device.type]
                        .filter(Boolean)
                        .join(" ")
                    : subject}
                </div>
                {shopPhone ? (
                  <div>
                    {shop.name} · {shopPhone}
                  </div>
                ) : (
                  <div>{shop.name}</div>
                )}
              </div>
            </div>
            <div className="rf-stub-code">
              <Barcode value={code} height={40} width={1.5} />
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
