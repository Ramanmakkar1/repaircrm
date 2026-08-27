"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Printer, Receipt, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import { METHOD_LABELS, type TenderMethod } from "./types";

export type CompletedSale = {
  invoiceId: string;
  number: number;
  totalCents: number;
  changeDueCents: number;
  method: TenderMethod;
};

/**
 * The end of a sale.
 *
 * Change due is the loudest thing on the screen when there is change to give,
 * because that is the number the cashier has to act on before anything else.
 * "New sale" is autofocused so the register is one keypress from the next
 * customer.
 */
export function SaleComplete({
  sale,
  onNewSale,
}: {
  sale: CompletedSale;
  onNewSale: () => void;
}) {
  const newSaleRef = React.useRef<HTMLButtonElement | null>(null);
  const hasChange = sale.method === "CASH" && sale.changeDueCents > 0;

  React.useEffect(() => {
    newSaleRef.current?.focus();
  }, []);

  // The change is a fact about this moment at the drawer, not something the
  // invoice stores, so it rides along to the receipt as a query param. A
  // reprint later simply shows no change line.
  const receiptHref = hasChange
    ? `/print/receipts/${sale.invoiceId}?change=${sale.changeDueCents}`
    : `/print/receipts/${sale.invoiceId}`;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center gap-4 bg-status-resolved-bg px-6 py-10 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-status-resolved text-white shadow-md">
            <CheckCircle2 className="size-9" strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="text-2xl font-bold tracking-tight text-status-resolved-fg">
              Sale complete
            </p>
            <p className="text-[15px] font-semibold text-status-resolved-fg/80">
              Invoice #{sale.number} · {formatCents(sale.totalCents)} ·{" "}
              {METHOD_LABELS[sale.method]}
            </p>
          </div>
        </div>

        {hasChange ? (
          <div className="flex items-baseline justify-between gap-4 border-t border-border px-6 py-5">
            <span className="text-lg font-bold text-foreground">Change due</span>
            <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
              {formatCents(sale.changeDueCents)}
            </span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5 border-t border-border px-6 py-5">
          <Button ref={newSaleRef} size="lg" className="h-14" onClick={onNewSale}>
            <RotateCcw />
            New sale
          </Button>

          <div className="grid grid-cols-2 gap-2.5">
            <Button asChild variant="soft" size="lg" className="h-14">
              <Link href={receiptHref}>
                <Printer />
                Print receipt
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14">
              <Link href={`/invoices/${sale.invoiceId}`}>
                <Receipt />
                View invoice
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
