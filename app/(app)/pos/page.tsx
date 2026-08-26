import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function PosPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="POS" description="Ring up walk-in sales and repairs at the counter." />
      <Card>
        <CardContent className="px-0 py-0">
          <EmptyState
            icon={ShoppingCart}
            title="Coming online shortly"
            hint="Point of sale is being built out."
          />
        </CardContent>
      </Card>
    </div>
  );
}
