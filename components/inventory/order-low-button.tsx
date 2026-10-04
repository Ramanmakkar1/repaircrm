"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { orderLowStockAction } from "@/app/(app)/inventory/purchase-orders/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { lowStockResultWords } from "./restock";

/**
 * "Order all low items": one tap writes a draft order per supplier with
 * everything that is running low (see orderLowStockAction), then opens the
 * "To order" list so the owner can check and place them. What was left out
 * (no supplier set, already on order) is said in words, not hidden.
 */
export function OrderLowButton({ count, className }: { count: number; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await orderLowStockAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const words = lowStockResultWords(result);
      const orders = result.orders ?? [];
      if (orders.length === 0) {
        toast.info(words);
        return;
      }
      toast.success(words, { duration: 8000 });
      router.push(orders.length === 1 ? `/inventory/purchase-orders/${orders[0].id}` : "/inventory/purchase-orders?status=DRAFT");
    });

  return (
    <Button type="button" onClick={run} disabled={pending} className={cn("h-12 px-5 text-base [&_svg]:size-5", className)}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ShoppingCart aria-hidden />}
      {pending ? "Making the orders…" : `Order all low items (${count})`}
    </Button>
  );
}
