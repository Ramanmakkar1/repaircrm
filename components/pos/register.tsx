"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { calcTotals } from "@/lib/money";
import { checkoutAction, posTerminalIntentAction } from "@/app/(app)/pos/actions";
import { CartPanel } from "./cart-panel";
import { ProductGrid } from "./product-grid";
import { SaleComplete, type CompletedSale } from "./sale-complete";
import { SerialPickerDialog } from "./serial-picker-dialog";
import { TenderDialog, type TenderTerminal } from "./tender-dialog";
import {
  isSerialLine,
  isTicketLine,
  tracksStock,
  type CartLine,
  type CheckoutInput,
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
  cardReader,
}: {
  products: PosProduct[];
  customers: PosCustomer[];
  /** Open tickets with un-invoiced work — the "Add from ticket" list. */
  tickets: PosTicket[];
  taxRateBps: number;
  /**
   * Whether this shop can take a card at a reader, and whether the platform is
   * on test keys (which is what makes Stripe offer a simulated reader). Both
   * are decided on the server; no key material crosses over.
   */
  cardReader: { enabled: boolean; testMode: boolean };
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

  const customer = customers.find((c) => c.id === customerId) ?? null;

  // A walk-in is taxed at the shop default; an attached customer at their own
  // rate, which is 0% when they are exempt. The server resolves it again at
  // checkout — this keeps the cart honest while the cashier is looking at it.
  const effectiveTaxRateBps = customer ? customer.taxRateBps : taxRateBps;
  const totals = calcTotals(lines, effectiveTaxRateBps);

  // Money already on account against the repair being billed. It comes off the
  // total before the drawer opens, so the customer is only asked for the rest.
  const attachedTicket = tickets.find((t) => t.id === ticketId) ?? null;
  const depositCents = Math.min(
    attachedTicket?.depositCents ?? 0,
    totals.totalCents,
  );
  const dueCents = totals.totalCents - depositCents;

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

  /**
   * The cart as the server will re-price it.
   *
   * Descriptions and prices ride along for the CUSTOM lines only — everything
   * with a productId or a ticketChargeId is re-read from the database, so this
   * payload is a list of intents rather than a bill.
   */
  const cartPayload = React.useCallback(
    (method: TenderMethod): CheckoutInput => ({
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
      method,
      reference: null,
      tenderedCents: null,
    }),
    [lines, customerId],
  );

  /** Rings the sale up. Shared by the keyed-in tenders and the card reader. */
  const runCheckout = React.useCallback(
    async (
      method: TenderMethod,
      extra: {
        reference: string | null;
        tenderedCents: number | null;
        terminalPaymentIntentId?: string | null;
      },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      const result = await checkoutAction({
        ...cartPayload(method),
        reference: extra.reference,
        tenderedCents: extra.tenderedCents,
        terminalPaymentIntentId: extra.terminalPaymentIntentId ?? null,
      });

      if (!result.ok) {
        // The cart is left exactly as it was: nothing was charged, and the
        // cashier can fix the problem and take the payment again.
        setError(result.error);
        return { ok: false, error: result.error };
      }

      setTender(null);
      setLines([]);
      setCustomerId(null);
      setTicketId(null);
      setSale({
        invoiceId: result.invoiceId,
        number: result.number,
        totalCents: result.totalCents,
        depositAppliedCents: result.depositAppliedCents,
        changeDueCents: result.changeDueCents,
        method: result.method,
        ticketId: result.ticketId,
        ticketNumber: result.ticketNumber,
      });
      return { ok: true };
    },
    [cartPayload],
  );

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
      await runCheckout(tender, { reference, tenderedCents });
    });
  };

  /**
   * The card-reader tender.
   *
   * `createIntent` prices the cart on the server and opens a card-present
   * PaymentIntent for it; `record` completes the sale once Stripe has approved
   * the card. Nothing is written until then, so a decline leaves the cart
   * exactly as it was.
   */
  const terminal: TenderTerminal | undefined = cardReader.enabled
    ? {
        testMode: cardReader.testMode,
        createIntent: async () => {
          const result = await posTerminalIntentAction(cartPayload("CARD"));
          return result.ok
            ? {
                ok: true as const,
                clientSecret: result.clientSecret,
                paymentIntentId: result.paymentIntentId,
              }
            : { ok: false as const, error: result.error };
        },
        record: (paymentIntentId: string) =>
          runCheckout("CARD", {
            reference: null,
            tenderedCents: null,
            terminalPaymentIntentId: paymentIntentId,
          }),
      }
    : undefined;

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
          taxRateBps={effectiveTaxRateBps}
          depositCents={depositCents}
          dueCents={dueCents}
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
        totalCents={dueCents}
        customerCredit={customer?.creditBalanceCents ?? 0}
        customerName={customer?.label ?? "a walk-in"}
        pending={pending}
        error={tender ? error : null}
        terminal={terminal}
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
