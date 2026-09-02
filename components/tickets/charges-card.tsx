import { Pencil, Plus, Trash2 } from "lucide-react";

import { calcTotals, formatBps, formatCents } from "@/lib/money";
import { deleteChargeAction } from "@/app/(app)/tickets/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, THead, Th, Td } from "@/components/ui/table";
import { ChargeDialog, type ProductOption } from "./charge-dialog";

export type ChargeRow = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxable: boolean;
  invoiceId: string | null;
  invoice: { number: number } | null;
};

/**
 * Parts and labour on the ticket.
 *
 * A charge becomes read-only the moment it lands on an invoice — editing it
 * here afterwards would silently desync the ticket from a document the customer
 * may already be holding. The invoice is the place to change it.
 */
export function ChargesCard({
  ticketId,
  charges,
  products,
  taxRateBps,
  warranty = false,
}: {
  ticketId: string;
  charges: ChargeRow[];
  products: ProductOption[];
  taxRateBps: number;
  /** Warranty job: new charges start at $0, since the work is already paid for. */
  warranty?: boolean;
}) {
  const totals = calcTotals(charges, taxRateBps);
  const uninvoiced = charges.filter((charge) => charge.invoiceId === null);
  const uninvoicedTotals = calcTotals(uninvoiced, taxRateBps);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Charges</CardTitle>
        <ChargeDialog
          ticketId={ticketId}
          products={products}
          warranty={warranty}
          trigger={
            <Button variant="outline" size="sm">
              <Plus className="size-4" />
              Add Charge
            </Button>
          }
        />
      </CardHeader>

      <CardContent className="px-0 py-0">
        {charges.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No parts or labour on this ticket yet.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Description</Th>
                <Th className="w-14 text-right">Qty</Th>
                <Th className="w-24 text-right">Unit</Th>
                <Th className="w-24 text-right">Total</Th>
                <Th className="w-20" />
              </tr>
            </THead>
            <TBody>
              {charges.map((charge) => (
                <tr key={charge.id} className="border-b border-border">
                  <Td className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-foreground">{charge.description}</span>
                      {!charge.taxable ? (
                        <Badge variant="secondary">No tax</Badge>
                      ) : null}
                      {charge.invoice ? (
                        <Badge variant="outline">
                          Invoice #{charge.invoice.number}
                        </Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="text-right tabular-nums text-muted-foreground">
                    {charge.quantity}
                  </Td>
                  <Td className="text-right tabular-nums text-muted-foreground">
                    {formatCents(charge.unitPriceCents)}
                  </Td>
                  <Td className="text-right font-medium tabular-nums">
                    {formatCents(charge.quantity * charge.unitPriceCents)}
                  </Td>
                  <Td className="text-right">
                    {charge.invoiceId === null ? (
                      <div className="flex justify-end gap-0.5">
                        <ChargeDialog
                          ticketId={ticketId}
                          products={products}
                          charge={charge}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${charge.description}`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          }
                        />
                        <form action={deleteChargeAction.bind(null, charge.id)}>
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${charge.description}`}
                            className="text-faint-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-xs text-faint-foreground">Locked</span>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>

      {charges.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3 text-sm">
          <TotalRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
          <TotalRow
            label={`Tax (${formatBps(taxRateBps)})`}
            value={formatCents(totals.taxCents)}
          />
          <TotalRow
            label="Total"
            value={formatCents(totals.totalCents)}
            emphasis
          />
          {uninvoiced.length > 0 && uninvoiced.length < charges.length ? (
            <TotalRow
              label={`Not yet invoiced (${uninvoiced.length})`}
              value={formatCents(uninvoicedTotals.totalCents)}
              muted
            />
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "mt-1 flex items-center justify-between border-t border-border pt-2 font-semibold text-foreground"
          : muted
            ? "flex items-center justify-between text-xs text-muted-foreground"
            : "flex items-center justify-between text-muted-foreground"
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
