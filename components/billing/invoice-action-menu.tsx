"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACTIONS, ICONS } from "@/components/ui/icons";
import { ConfirmActionDialog } from "./action-form";
import { ChargeCardButton } from "./charge-card-button";
import { RefundDialog, type RefundablePayment } from "./refund-dialog";
import { EmailReceiptMenuItem, type ReceiptAction } from "./send-receipt";
import { SignatureDialog } from "./signature-dialog";

/**
 * THE INVOICE HEADER'S SECONDARY ACTIONS, BEHIND ONE `⋯`.
 *
 * An invoice can offer eight things at once — print, edit, email a receipt,
 * collect a signature, charge the card on file, refund, void, take a payment,
 * send — and eight buttons is not a header, it is a paragraph of buttons. At
 * 1280px they wrapped onto a second line and the page's most important control
 * ended up somewhere different on every invoice, because which buttons exist
 * depends on the invoice's state.
 *
 * So the header keeps what someone came to do — take the money, send the bill —
 * and everything else lives here, in a fixed order that does not move as the
 * invoice changes.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DIALOGS ARE RENDERED OUTSIDE THE MENU
 * ---------------------------------------------------------------------------
 * Four of these actions are self-contained `Dialog`s that own their trigger and
 * their open state. A menu item cannot simply BE that trigger: Radix unmounts
 * the menu's content when the menu closes, and it closes the instant you pick
 * something — taking the dialog with it before it can open.
 *
 * The dialogs therefore sit as siblings of the menu, driven by one `dialog`
 * key, and each is asked to render no trigger of its own (see dialog-open.ts).
 * The menu item's job is reduced to naming which one to open. `preventDefault`
 * on select is the same idiom `CustomerActionsMenu` uses: it stops Radix
 * closing the menu on its own timing, so the dialog takes focus cleanly instead
 * of racing the menu for it.
 *
 * NOTHING HERE CHANGES WHAT AN ACTION DOES. Every server action, every
 * confirmation, every disabled reason is the one the buttons carried; only the
 * surface they are reached through moved.
 */

type SignatureAction = React.ComponentProps<typeof SignatureDialog>["action"];
type RefundAction = React.ComponentProps<typeof RefundDialog>["action"];
type VoidAction = React.ComponentProps<typeof ConfirmActionDialog>["action"];
type ChargeAction = React.ComponentProps<typeof ChargeCardButton>["action"];

/** Which dialog the menu has opened. `null` is the resting state. */
type DialogKey = "signature" | "charge" | "refund" | "void";

export function InvoiceActionMenu({
  invoiceId,
  invoiceNumber,
  customerName,
  printHref,
  editHref,
  receipt,
  signature,
  chargeCard,
  refund,
  voidInvoice,
}: {
  invoiceId: string;
  invoiceNumber: number;
  customerName: string;
  printHref: string;
  /** Null once the invoice is past the point where lines can change. */
  editHref: string | null;
  /** Offered on a settled invoice. `blockedReason` disables it, with a reason. */
  receipt: { action: ReceiptAction; blockedReason: string | null } | null;
  signature: { action: SignatureAction; signed: boolean } | null;
  chargeCard: {
    action: ChargeAction;
    balanceCents: number;
    cardLabel: string;
  } | null;
  refund: {
    action: RefundAction;
    refundableCents: number;
    payments: RefundablePayment[];
    defaultMethod: string;
  } | null;
  /** OWNER only. `blockedReason` is set when payments are already recorded. */
  voidInvoice: { action: VoidAction; blockedReason: string | null } | null;
}) {
  const [dialog, setDialog] = React.useState<DialogKey | null>(null);

  /** The controlled-open pair every dialog below is driven by. */
  const bind = (key: DialogKey) => ({
    open: dialog === key,
    onOpenChange: (next: boolean) => setDialog(next ? key : null),
  });

  /** Menu items that open a dialog all behave the same way. */
  const opens = (key: DialogKey) => (event: Event) => {
    event.preventDefault();
    setDialog(key);
  };

  const hasDestructive = Boolean(refund || voidInvoice);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* size-8, not the 36px `icon` default: it sits in a header row of
              `sm` buttons and has to end level with them. */}
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="More invoice actions"
          >
            <ACTIONS.more className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="min-w-[13rem]">
          <DropdownMenuItem asChild>
            <Link href={printHref} target="_blank">
              <ACTIONS.print className="size-4 text-muted-foreground" />
              Print
            </Link>
          </DropdownMenuItem>

          {editHref ? (
            <DropdownMenuItem asChild>
              <Link href={editHref}>
                <ACTIONS.edit className="size-4 text-muted-foreground" />
                Edit
              </Link>
            </DropdownMenuItem>
          ) : null}

          {receipt ? (
            <EmailReceiptMenuItem
              invoiceId={invoiceId}
              action={receipt.action}
              blockedReason={receipt.blockedReason}
            />
          ) : null}

          {signature ? (
            <DropdownMenuItem onSelect={opens("signature")}>
              <ICONS.signature className="size-4 text-muted-foreground" />
              {signature.signed ? "Re-sign" : "Collect signature"}
            </DropdownMenuItem>
          ) : null}

          {chargeCard ? (
            <DropdownMenuItem onSelect={opens("charge")}>
              <ACTIONS.pay className="size-4 text-muted-foreground" />
              Charge card on file
            </DropdownMenuItem>
          ) : null}

          {/* Money going back out, and the end of the invoice's life. Separated
              from the everyday half above so neither is a slip of the thumb. */}
          {hasDestructive ? <DropdownMenuSeparator /> : null}

          {refund ? (
            <DropdownMenuItem onSelect={opens("refund")}>
              <ACTIONS.refund className="size-4 text-muted-foreground" />
              Refund
            </DropdownMenuItem>
          ) : null}

          {voidInvoice ? (
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive-soft"
              disabled={Boolean(voidInvoice.blockedReason)}
              title={voidInvoice.blockedReason ?? undefined}
              onSelect={opens("void")}
            >
              <ACTIONS.void className="size-4" />
              Void
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ------------------------------------------------- the driven dialogs */}

      {signature ? (
        <SignatureDialog
          {...bind("signature")}
          action={signature.action}
          documentId={invoiceId}
          title="Collect signature"
          description={`Have ${customerName} sign to acknowledge invoice #${invoiceNumber}.`}
          triggerLabel={signature.signed ? "Re-sign" : "Collect signature"}
        />
      ) : null}

      {chargeCard ? (
        <ChargeCardButton
          {...bind("charge")}
          invoiceId={invoiceId}
          balanceCents={chargeCard.balanceCents}
          cardLabel={chargeCard.cardLabel}
          customerName={customerName}
          action={chargeCard.action}
        />
      ) : null}

      {refund ? (
        <RefundDialog
          {...bind("refund")}
          action={refund.action}
          invoiceId={invoiceId}
          refundableCents={refund.refundableCents}
          payments={refund.payments}
          customerName={customerName}
          defaultMethod={refund.defaultMethod}
        />
      ) : null}

      {voidInvoice ? (
        <ConfirmActionDialog
          {...bind("void")}
          action={voidInvoice.action}
          fields={{ id: invoiceId }}
          triggerLabel="Void"
          triggerIcon={<ACTIONS.void />}
          title={`Void invoice #${invoiceNumber}?`}
          description="The invoice stays on record but stops counting as money owed. This cannot be undone."
          confirmLabel="Void invoice"
          disabled={Boolean(voidInvoice.blockedReason)}
          disabledReason={voidInvoice.blockedReason ?? undefined}
        />
      ) : null}
    </>
  );
}
