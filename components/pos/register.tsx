"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { calcTotals } from "@/lib/money";
import { checkoutAction } from "@/app/(app)/pos/actions";
import { CartPanel } from "./cart-panel";
import { ProductGrid } from "./product-grid";
import { SaleComplete, type CompletedSale } from "./sale-complete";
import { SerialPickerDialog } from "./serial-picker-dialog";
import { TenderDialog } from "./tender-dialog";
import {
  isSerialLine,
  isTicketLine,
  tracksStock,
  type CartLine,
  type PosCustomer,
  type PosProduct,
  type PosTicket,
  type TenderMethod,
} from "./types";

/**
 * The register.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CART LIVES HERE
 * ---------------------------------------------------------------------------
 * A walk-in sale is a burst of small edits — scan, scan, bump a quantity, undo
 * one — and every one of them has to land instantly. So the cart is plain React
 * state in this one component, and the server is touched exactly once per sale,
 * at checkout. There is no draft persistence in this wave: an abandoned cart
 * dies with the tab, which is what a counter expects anyway.
 *
 * The prices held here are for DISPLAY ONLY. Checkout sends product ids and
 * quantities, and the server re-reads the authoritative price for every
 * catalogue line, so a stale tile or a tampered client cannot set a price.
 */
export function Register({
  products,
  customers,
  tickets,
  taxRateBps,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  /** Open tickets with un-invoiced work — the "Add from ticket" list. */
  tickets: PosTicket[];
  taxRateBps: number;
}) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [ticketId, setTicketId] = React.useState<string | null>(null);
  const [tender, setTender] = React.useState<TenderMethod | null>(null);
  const [sale, setSale] = React.useState<CompletedSale | null>(null);
  /** The serialized product waiting on a "which unit?" answer. */
  const [pickingSerial, setPickingSerial] = React.useState<PosProduct | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const scanRef = React.useRef<HTMLInputElement | null>(null);
  const keySeq = React.useRef(0);
  const nextKey = () => `line-${keySeq.current++}`;

  const totals = calcTotals(lines, taxRateBps);
  const customer = customers.find((c) => c.id === customerId) ?? null;

  // ------------------------------------------------------------ cart edits ---

  /**
   * Scanning the same thing twice bumps the quantity rather than stacking rows —
   * except for a serialized product, where every unit is a different physical
   * thing and therefore its own row. Those detour through the serial picker.
   */
  const addProduct = (product: PosProduct) => {
    setError(null);
    if (product.serialized) {
      setPickingSerial(product);
      return;
    }
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          key: nextKey(),
          productId: product.id,
          name: product.name,
          unitPriceCents: product.priceCents,
          taxable: product.taxable,
          quantity: 1,
          stockQty: tracksStock(product) ? product.stockQty : null,
        },
      ];
    });
  };

  /** One serialized unit, added as its own quantity-1 line. */
  const addSerialUnit = (product: PosProduct, serial: string) => {
    setPickingSerial(null);
    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        productId: product.id,
        name: product.name,
        unitPriceCents: product.priceCents,
        taxable: product.taxable,
        quantity: 1,
        stockQty: null,
        serial,
      },
    ]);
    scanRef.current?.focus();
  };

  const addCustom = (item: {
    name: string;
    unitPriceCents: number;
    taxable: boolean;
  }) => {
    setError(null);
    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        productId: null,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        taxable: item.taxable,
        quantity: 1,
        stockQty: null,
      },
    ]);
    scanRef.current?.focus();
  };

  /**
   * Pull a repair ticket's un-invoiced charges onto the sale.
   *
   * The lines land LOCKED (see `TicketCartRow`) and the ticket's customer is
   * attached automatically — an invoice that links back to ticket #N had better
   * be addressed to the person the ticket is for. The single-ticket rule is
   * enforced by the picker's own disabled state; this replaces any previous
   * ticket block defensively so the cart can never hold two.
   */
  const addTicket = (ticket: PosTicket) => {
    setError(null);
    setTicketId(ticket.id);
    setCustomerId(ticket.customerId);
    setLines((current) => [
      ...ticket.charges.map((charge) => ({
        key: nextKey(),
        productId: null,
        name: `Ticket #${ticket.number} — ${charge.description}`,
        unitPriceCents: charge.unitPriceCents,
        taxable: charge.taxable,
        quantity: charge.quantity,
        stockQty: null,
        ticketChargeId: charge.id,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
      })),
      ...current.filter((line) => !isTicketLine(line)),
    ]);
    scanRef.current?.focus();
  };

  /** Ticket lines go as a set: a half-billed repair is not a thing. */
  const removeTicket = () => {
    setLines((current) => current.filter((line) => !isTicketLine(line)));
    setTicketId(null);
    setCustomerId(null);
    scanRef.current?.focus();
  };

  /** Stepping a quantity to zero removes the row — one less button to hunt for. */
  const setQuantity = (key: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.key !== key)
        : current.map((line) =>
            // A serialized line is one unit by definition; the stepper is
            // hidden for it, and this holds the line even if that changes.
            line.key === key && !isSerialLine(line)
              ? { ...line, quantity: Math.min(quantity, 9999) }
              : line,
          ),
    );
  };

  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
    scanRef.current?.focus();
  };

  const clearCart = () => {
    setLines([]);
    setTicketId(null);
    setError(null);
    scanRef.current?.focus();
  };

  // -------------------------------------------------------------- checkout ---

  const confirmTender = ({
    reference,
    tenderedCents,
  }: {
    reference: string | null;
    tenderedCents: number | null;
  }) => {
    if (!tender) return;
    setError(null);

    startTransition(async () => {
      const result = await checkoutAction({
        lines: lines.map((line) => ({
          productId: line.productId,
          description: line.name,
          unitPriceCents: line.unitPriceCents,
          taxable: line.taxable,
          quantity: line.quantity,
          serial: line.serial ?? null,
          ticketChargeId: line.ticketChargeId ?? null,
        })),
        customerId,
        method: tender,
        reference,
        tenderedCents,
      });

      if (!result.ok) {
        // The cart is left exactly as it was: nothing was charged, and the
        // cashier can fix the problem and take the payment again.
        setError(result.error);
        return;
      }

      setTender(null);
      setLines([]);
      setCustomerId(null);
      setTicketId(null);
      setSale({
        invoiceId: result.invoiceId,
        number: result.number,
        totalCents: result.totalCents,
        changeDueCents: result.changeDueCents,
        method: result.method,
        ticketId: result.ticketId,
        ticketNumber: result.ticketNumber,
      });
    });
  };

  const startNewSale = () => {
    setSale(null);
    setError(null);
    // The next customer is already at the counter — put the caret in the scanner.
    requestAnimationFrame(() => scanRef.current?.focus());
  };

  // ----------------------------------------------------------------- render ---

  if (sale) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="POS" description="Ring up walk-in sales at the counter." />
        <SaleComplete sale={sale} onNewSale={startNewSale} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="POS" description="Ring up walk-in sales at the counter." />

      {error && tender === null ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProductGrid products={products} onAdd={addProduct} inputRef={scanRef} />
        </div>

        <CartPanel
          lines={lines}
          totals={totals}
          taxRateBps={taxRateBps}
          customers={customers}
          customerId={customerId}
          onCustomerChange={setCustomerId}
          onQuantityChange={setQuantity}
          onRemove={removeLine}
          onClear={clearCart}
          onAddCustom={addCustom}
          tickets={tickets}
          attachedTicketId={ticketId}
          onPickTicket={addTicket}
          onRemoveTicket={removeTicket}
          onTender={(method) => {
            setError(null);
            setTender(method);
          }}
          disabled={pending}
        />
      </div>

      <SerialPickerDialog
        product={pickingSerial}
        taken={lines
          .map((line) => line.serial)
          .filter((serial): serial is string => Boolean(serial))}
        onPick={(serial) => {
          if (pickingSerial) addSerialUnit(pickingSerial, serial);
        }}
        onClose={() => setPickingSerial(null)}
      />

      <TenderDialog
        method={tender}
        totalCents={totals.totalCents}
        customerCredit={customer?.creditBalanceCents ?? 0}
        customerName={customer?.label ?? "a walk-in"}
        pending={pending}
        error={tender ? error : null}
        onClose={() => {
          setTender(null);
          setError(null);
          scanRef.current?.focus();
        }}
        onConfirm={confirmTender}
      />
    </div>
  );
}
