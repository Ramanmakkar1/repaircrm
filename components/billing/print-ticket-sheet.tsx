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
  SheetFooter,
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
        />
      ) : null}

      <article className="rf-sheet">
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
                  <div className="rf-fields">
                    <Field label="Type" value={device.type} />
                    <Field label="Make" value={device.make || "—"} />
                    <Field label="Model" value={device.model || "—"} />
                    <Field label="Serial / IMEI" value={device.serial || "—"} mono />
                  </div>
                  {device.password || device.notes ? (
                    <div className="rf-fields is-2" style={{ marginTop: "0.12in" }}>
                      {device.password ? (
                        <Field label="Passcode" value={device.password} mono />
                      ) : null}
                      {device.notes ? (
                        <Field label="Condition on intake" value={device.notes} />
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rf-field-value rf-muted">
                  No device recorded — counter service.
                </div>
              )}
            </div>
          </section>

          {/* --------------------------------------------------- problem --- */}
          <section className="rf-section rf-avoid">
            <SectionHead title="Reported problem" aside={problemType} />
            <p className="rf-note" style={{ marginTop: 0, fontSize: "10pt" }}>
              {subject}
            </p>
          </section>

          {diagnosis ? (
            <section className="rf-section-tight rf-avoid">
              <SectionHead title="Diagnosis" />
              <p className="rf-note" style={{ marginTop: 0 }}>
                {diagnosis}
              </p>
            </section>
          ) : null}

          {/* --------------------------------------------------- charges --- */}
          <section className="rf-section">
            <SectionHead
              title="Charges to date"
              aside={charges.length > 0 ? "Not a receipt" : undefined}
            />
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
                {charges.length === 0 ? (
                  <tr>
                    <td className="rf-empty" colSpan={4}>
                      No charges recorded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <div className="rf-totals-wrap">
              <div className="rf-totals-panel">
                <table className="rf-totals">
                  <tbody>
                    <tr>
                      <td className="rf-t-label">Subtotal</td>
                      <td className="rf-t-value">
                        {formatCents(totals.subtotalCents)}
                      </td>
                    </tr>
                    <tr>
                      <td className="rf-t-label">
                        Estimated tax ({formatBps(taxRateBps)})
                      </td>
                      <td className="rf-t-value">{formatCents(totals.taxCents)}</td>
                    </tr>
                    <tr className="is-strong">
                      <td className="rf-t-label">Estimated total</td>
                      <td className="rf-t-value">
                        {formatCents(totals.totalCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ------------------------------------------ technician notes --- */}
          <section className="rf-section rf-avoid">
            <SectionHead title="Technician notes" aside="Work performed / parts used" />
            <div className="rf-ruled" style={{ height: "1.8in" }} />
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
            <p className="rf-note">{terms}</p>
          </section>

          <SheetFooter
            barcode={code}
            message={`Work order #${number}`}
            contact={
              shopPhone
                ? `${shop.name}  ·  ${shopPhone}`
                : shop.name
            }
          />

          {/* ------------------------------------------------ claim stub --- */}
          <CutLine />
          <div className="rf-stub">
            <div className="rf-stub-main">
              <div className="rf-stub-title">Claim check</div>
              <div className="rf-stub-number">#{number}</div>
              <div className="rf-stub-lines">
                <div>{customer.name}</div>
                <div>
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
